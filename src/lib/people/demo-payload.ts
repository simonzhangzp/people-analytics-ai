import { CASE3_TREND_MONTHS, TOP_BREAKDOWN_ROWS, attritionHeadline, concentrationLocationFromVisible, previousMonthEnd, rankVisibleCells } from "./case3-view";
import { DEFAULT_IDENTITY, identityShowsCompaRatio } from "./demo-identities";
import { asList, asRecord, isoDate } from "./format";
import {
  grainFields,
  HEADCOUNT_WINDOW,
  VOL_MONTH_WINDOW,
  VOL_T12M_WINDOW,
} from "./metric-grain";
import { groupQualityTestsByLayer, type QualityCatalogRow } from "./quality-catalog";
import {
  peopleGetCase3Signals,
  peopleGetHealth,
  peopleGetIncidents,
  peopleGetLineage,
  peopleGetMetricBreakdown,
  peopleGetMetricFor,
  peopleGetMetricRow,
  peopleGetMetricTrend,
  peopleGetPointer,
  peopleGetQualityCatalog,
  peopleGetReplayValues,
  peopleGetServingRun,
  peopleGetSkillCoverage,
} from "./v2-client";

export { headcountLineageSteps } from "./headcount-lineage";
export { groupQualityTestsByLayer } from "./quality-catalog";
export type { QualityCatalogRow } from "./quality-catalog";

export async function loadTrustCase(identityId = DEFAULT_IDENTITY) {
  const [company, engineering, definition, lineage, health, run, quality, certified] = await Promise.all([
    peopleGetMetricFor(identityId, "headcount", { grain: "month" }),
    peopleGetMetricFor(identityId, "headcount", { grain: "month", jobFamily: "Engineering" }),
    peopleGetMetricRow("headcount"),
    peopleGetLineage(),
    peopleGetHealth("headcount"),
    peopleGetServingRun("data-v1"),
    peopleGetQualityCatalog("data-v1"),
    peopleGetPointer("current_certified"),
  ]);
  const asOf = isoDate(certified.as_of) || isoDate(company.as_of) || isoDate(engineering.as_of);
  const tests: QualityCatalogRow[] = quality.map((row) => ({
    test_name: String(row.test_name ?? ""),
    test_id: String(row.test_id ?? row.test_name ?? ""),
    layer: String(row.layer ?? "gold"),
    object_name: String(row.object_name ?? ""),
    test_type: String(row.test_type ?? row.test_group ?? ""),
    blocking: row.blocking !== false,
    status: String(row.status ?? "passed"),
      last_run_at: isoDate(row.last_run_at) || null,
  }));
  return {
    snapshot: { as_of_date: asOf, snapshot_id: "current_certified" },
    metric: {
      ...engineering,
      quality_status: health.status === "healthy" ? "healthy" : "unhealthy",
      trusted: run.certified === true,
      freshness: { freshness_status: run.certified ? "healthy" : "failed" },
    },
    companyMetric: company,
    engineeringGrain: grainFields({
      metricId: "headcount",
      scope: "Engineering",
      window: HEADCOUNT_WINDOW,
      asOf,
      annualized: false,
    }),
    companyGrain: grainFields({
      metricId: "headcount",
      scope: "Company",
      window: HEADCOUNT_WINDOW,
      asOf,
      annualized: false,
    }),
    definition: {
      ...definition,
      ...grainFields({
        metricId: "headcount",
        scope: "Engineering",
        window: HEADCOUNT_WINDOW,
        asOf,
        annualized: false,
      }),
    },
    lineage: {
      lineage,
      quality_status: health.status ?? "healthy",
      publish_status: run.certified ? "published" : "blocked",
    },
    sourceHealth: { sources: [] },
    tests,
    testsByLayer: groupQualityTestsByLayer(tests),
    health,
    run,
  };
}

export async function loadIncidentCase() {
  const [replayPointer, current, incidents, replay, lineage, run] = await Promise.all([
    peopleGetPointer("incident_replay"),
    peopleGetPointer("current_certified"),
    peopleGetIncidents(),
    peopleGetReplayValues(),
    peopleGetLineage(),
    peopleGetServingRun("data-v1"),
  ]);
  const incident =
    incidents.find((row) => String(row.incident_id).includes("2026-08-14")) ?? incidents[0] ?? {};
  const details = asRecord(incident.details);
  const replayRow = replay[0] ?? {};
  return {
    snapshot: {
      snapshot_id: "incident_replay",
      as_of_date: isoDate(replayPointer.as_of),
      extract_id: replayPointer.extract_id,
      moved: replayPointer.moved,
      notes: replayPointer.notes,
    },
    current: {
      snapshot_id: "current_certified",
      as_of_date: isoDate(current.as_of),
      extract_id: current.extract_id,
    },
    apac: {
      incident_id: incident.incident_id,
      expected_records: details.control_total,
      actual_records: details.rows_received,
      isolated: incident.isolated,
      status: incident.status,
    },
    sourceHealth: {
      sources: [
        {
          source_name: "people_hris",
          quality_status: "failed",
          error_message: "APAC Employee extract incomplete (replay)",
        },
      ],
    },
    lineage: {
      quality_status: "unhealthy",
      publish_status: "not_published",
      freshness: { freshness_status: "failed" },
      impact: lineage,
    },
    tests: [
      {
        test_name: "apac_hris_volume",
        status: "failed",
        observed_value: details.rows_received,
        expected_value: details.control_total,
      },
    ],
    replay: replayRow,
    run,
    currentGrain: {
      metric_id: "headcount",
      scope: "Company",
      window: "month (as-of)",
      as_of: isoDate(current.as_of),
    },
    replayGrain: {
      metric_id: "headcount",
      scope: "Company (incident replay)",
      window: "extract day",
      as_of: isoDate(replayPointer.as_of),
    },
    extractGrain: {
      metric_id: "apac_hris_volume",
      scope: "APAC Employee extract",
      window: "extract day",
      as_of: isoDate(incident.extract_date ?? replayPointer.as_of),
    },
  };
}

export { attritionHeadline } from "./case3-view";

export async function loadAttritionCase(identityId = DEFAULT_IDENTITY) {
  const [metric, monthMetric, company, trend, breakdown, signals, definition, skills, certified] = await Promise.all([
    peopleGetMetricFor(identityId, "voluntary_attrition_rate", {
      grain: "trailing_12m",
      jobFamily: "Engineering",
    }),
    peopleGetMetricFor(identityId, "voluntary_attrition_rate", {
      grain: "month",
      jobFamily: "Engineering",
    }),
    peopleGetMetricFor(identityId, "voluntary_attrition_rate", { grain: "trailing_12m" }),
    peopleGetMetricTrend(identityId, "voluntary_attrition_rate", {
      months: CASE3_TREND_MONTHS,
      jobFamily: "Engineering",
    }),
    peopleGetMetricBreakdown(identityId, "voluntary_attrition_rate", "location_tenure_grade", {
      jobFamily: "Engineering",
    }),
    peopleGetCase3Signals(identityId),
    peopleGetMetricRow("voluntary_attrition_rate"),
    peopleGetSkillCoverage("Engineering"),
    peopleGetPointer("current_certified"),
  ]);
  const asOf = isoDate(certified.as_of) || isoDate(metric.as_of) || isoDate(company.as_of);
  const points = asList(asRecord(trend).points);
  const allCells = asList(asRecord(breakdown).cells);
  const rankedVisible = rankVisibleCells(allCells);
  const where = concentrationLocationFromVisible(allCells);
  const priorAsOf = previousMonthEnd(asOf);
  const priorMonth = priorAsOf
    ? await peopleGetMetricFor(identityId, "voluntary_attrition_rate", {
        grain: "month",
        jobFamily: "Engineering",
        asOf: priorAsOf,
      })
    : {};
  const prior = priorMonth.value;
  const engineeringGrain = grainFields({
    metricId: "voluntary_attrition_rate",
    scope: "Engineering",
    window: VOL_T12M_WINDOW,
    asOf,
    annualized: true,
  });
  return {
    snapshot: { as_of_date: asOf },
    metric,
    monthMetric,
    companyMetric: company,
    engineeringGrain,
    companyGrain: grainFields({
      metricId: "voluntary_attrition_rate",
      scope: "Company",
      window: VOL_T12M_WINDOW,
      asOf,
      annualized: true,
    }),
    monthGrain: grainFields({
      metricId: "voluntary_attrition_rate",
      scope: "Engineering",
      window: VOL_MONTH_WINDOW,
      asOf,
      annualized: true,
    }),
    trend: { points, grain: "trailing_12m", scenario_start: "2026-03-01" },
    breakdown,
    rankedVisible: rankedVisible.slice(0, TOP_BREAKDOWN_ROWS),
    hiddenCellCount: allCells.filter((row) => row.suppressed === true).length,
    signals: identityShowsCompaRatio(identityId)
      ? asRecord(signals)
      : { ...asRecord(signals), compa: [], compa_restricted: true },
    definition: { ...definition, ...engineeringGrain },
    skills,
    headline: attritionHeadline({
      t12m: metric.value,
      rate: monthMetric.value,
      prior,
      where,
      asOf,
    }),
    identityId,
  };
}
