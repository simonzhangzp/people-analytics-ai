import { asList, asRecord } from "./format";
import { peopleServing } from "./serving";

export function headcountLineageSteps(lineage: Record<string, unknown>) {
  const sources = Array.isArray(lineage.source_tables)
    ? lineage.source_tables.map(String)
    : ["people_hris"];
  const marts = Array.isArray(lineage.downstream_marts)
    ? lineage.downstream_marts.map(String)
    : ["people_mart_workforce_overview"];
  const rows = asList(lineage.lineage);
  const overview =
    rows.find((row) => String(row.dataset_name).includes("workforce_overview")) ?? rows[0] ?? {};
  return [
    { label: "HRIS Worker", table: sources[0] ?? "people_hris" },
    {
      label: "Worker Assignment",
      table: String(overview.upstream_source ?? sources[0] ?? "people_hris"),
    },
    { label: "Normalized Workforce", table: "silver workforce layer" },
    { label: "Certified Headcount", table: "certified headcount metric" },
    {
      label: "Workforce Overview",
      table: marts[0] ?? String(overview.serving_table ?? "people_mart_workforce_overview"),
    },
  ];
}

export async function loadTrustCase() {
  const [snapshot, metric, definition, lineage, sourceHealth, tests] = await Promise.all([
    peopleServing.getServingSnapshot("current"),
    peopleServing.getMetric("headcount", { jobFamily: "Engineering" }),
    peopleServing.getMetricDefinition("headcount"),
    peopleServing.traceLineage("headcount", "current"),
    peopleServing.getSourceHealth("current"),
    peopleServing.listQualityTests("current"),
  ]);
  return {
    snapshot: asRecord(snapshot),
    metric: asRecord(metric),
    definition: asRecord(definition),
    lineage: asRecord(lineage),
    sourceHealth: asRecord(sourceHealth),
    tests,
  };
}

export async function loadIncidentCase() {
  const [snapshot, current, incidents, sourceHealth, lineage, tests] = await Promise.all([
    peopleServing.getServingSnapshot("incident_replay"),
    peopleServing.getServingSnapshot("current"),
    peopleServing.getQualityIncidents("incident_replay"),
    peopleServing.getSourceHealth("incident_replay"),
    peopleServing.traceLineage("headcount", "incident_replay"),
    peopleServing.listQualityTests("incident_replay"),
  ]);
  const incidentList = asList(asRecord(incidents).incidents);
  const apac =
    incidentList.find((item) => item.incident_id === "people-incident-apac-hris-incomplete") ?? {};
  return {
    snapshot: asRecord(snapshot),
    current: asRecord(current),
    apac,
    sourceHealth: asRecord(sourceHealth),
    lineage: asRecord(lineage),
    tests,
  };
}

export function attritionHeadline(retention: Record<string, unknown>) {
  const metric = asRecord(retention.metric);
  const trend = asList(asRecord(retention.trend).points);
  const current = Number(metric.value);
  const previous = trend.length >= 2 ? Number(trend[trend.length - 2]?.value) : NaN;
  const deltaPp =
    Number.isFinite(current) && Number.isFinite(previous) ? (current - previous) * 100 : null;
  const byLocation = asList(retention.by_location);
  const top = byLocation[0];
  const where = top?.location_id ? String(top.location_id) : "a small set of locations";
  const rateLabel = Number.isFinite(current) ? `${(current * 100).toFixed(1)}%` : "n/a";
  if (deltaPp == null) {
    return `Engineering monthly voluntary attrition is ${rateLabel}, concentrated primarily in ${where}.`;
  }
  if (Math.abs(deltaPp) < 0.25) {
    return `Engineering monthly voluntary attrition is ${rateLabel} and roughly unchanged versus last month, concentrated primarily in ${where}.`;
  }
  const deltaLabel = `${deltaPp >= 0 ? "+" : ""}${deltaPp.toFixed(1)} pp`;
  return `Engineering voluntary attrition ${deltaLabel} month-over-month, concentrated primarily in ${where}.`;
}

export async function loadAttritionCase() {
  const [
    snapshot,
    retention,
    mobility,
    skills,
    recommendations,
    span,
    engagement,
    definition,
  ] = await Promise.all([
    peopleServing.getServingSnapshot("current"),
    peopleServing.getRetentionAnalysis("Engineering"),
    peopleServing.getMobilityAnalysis("Engineering"),
    peopleServing.getSkillGap("Engineering"),
    peopleServing.getLearningRecommendations("Engineering", "skill_python"),
    peopleServing.getMetric("span_of_control", { jobFamily: "Engineering" }),
    peopleServing.getMetric("engagement_score", { jobFamily: "Engineering" }),
    peopleServing.getMetricDefinition("voluntary_attrition"),
  ]);
  const retentionRecord = asRecord(retention);
  const recPayload = asRecord(recommendations);
  return {
    snapshot: asRecord(snapshot),
    retention: retentionRecord,
    mobility: asRecord(mobility),
    skills: asRecord(skills),
    recommendations: {
      ...recPayload,
      recommendations: asList(recPayload.recommendations).filter(
        (row) => !/minecraft|makecode|k-?12|for kids|minigame|hour of code/i.test(String(row.title ?? "")),
      ),
    },
    span: asRecord(span),
    engagement: asRecord(engagement),
    definition: asRecord(definition),
    headline: attritionHeadline(retentionRecord),
  };
}
