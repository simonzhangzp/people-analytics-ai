import { canonicalSource } from "@/lib/data/local-profiler";
import type { MetricProposal, StrategyBrief } from "@/types/strategy";
import type {
  CellValue,
  LocalDataset,
  MetricDashboard,
  WorkforceAnalysis,
} from "@/types/local-data";

const DAY_MS = 24 * 60 * 60 * 1_000;

function asDate(value: CellValue | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function asBoolean(value: CellValue | undefined) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  return ["true", "yes", "y", "1", "hired", "accepted"].includes(
    value.trim().toLowerCase(),
  );
}

function round(value: number, precision = 1) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function formatMonth(month: string) {
  const [year, mon] = month.split("-");
  if (!year || !mon) return month;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(mon) - 1, 1)));
}

export function targetDaysFromBrief(brief?: StrategyBrief | null, fallback = 45) {
  const metric = brief?.metrics.find(
    (item) => item.id === "time_to_fill" || item.name === "Time to Fill",
  );
  const raw = metric?.target || metric?.suggestedTarget || "";
  const match = raw.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : fallback;
}

function availableFields(datasets: LocalDataset[]) {
  const fields = new Set<string>();
  for (const dataset of datasets) {
    for (const mapping of dataset.mappings) {
      fields.add(mapping.canonicalField);
    }
    if (dataset.aggregates?.uniqueEmployees) fields.add("employee_id");
    if (dataset.aggregates?.monthlyHeadcount.length) fields.add("snapshot_month");
    if (dataset.aggregates?.hireYearCounts?.length) fields.add("hire_date");
    if (
      dataset.aggregates?.statusCounts &&
      Object.keys(dataset.aggregates.statusCounts).length
    ) {
      fields.add("workforce_status");
    }
    for (const mixField of Object.keys(dataset.aggregates?.mixCounts ?? {})) {
      fields.add(mixField);
    }
  }
  return fields;
}

function sampledNote(datasets: LocalDataset[]) {
  return datasets.some((dataset) => dataset.aggregates?.sampled)
    ? "Calculated locally from uploaded files. Large files were inspected from a local sample; snapshot counts use the full file."
    : "Calculated locally from uploaded files. Raw rows were not uploaded.";
}

function durationValues(
  datasets: LocalDataset[],
  startField: string,
  endField: string,
) {
  const dataset = datasets.find(
    (item) => canonicalSource(item, startField) && canonicalSource(item, endField),
  );
  if (!dataset) return [];
  const startSource = canonicalSource(dataset, startField);
  const endSource = canonicalSource(dataset, endField);
  if (!startSource || !endSource) return [];
  return dataset.rows.flatMap((row) => {
    const start = asDate(row[startSource]);
    const end = asDate(row[endSource]);
    if (!start || !end) return [];
    const days = (end.getTime() - start.getTime()) / DAY_MS;
    return days >= 0 && days <= 730 ? [days] : [];
  });
}

function rateFromPresence(
  datasets: LocalDataset[],
  successField: string,
  successBoolean?: string,
) {
  const dataset =
    datasets.find(
      (item) =>
        canonicalSource(item, successField) ||
        (successBoolean && canonicalSource(item, successBoolean)),
    ) ?? datasets.find((item) => item.entity === "Candidate Application");
  if (!dataset || dataset.rows.length === 0) return null;
  const hits = dataset.rows.filter((row) => {
    const dateSource = canonicalSource(dataset, successField);
    const flagSource =
      successBoolean && canonicalSource(dataset, successBoolean)
        ? canonicalSource(dataset, successBoolean)
        : undefined;
    return (
      Boolean(dateSource && asDate(row[dateSource])) ||
      Boolean(flagSource && asBoolean(row[flagSource]))
    );
  }).length;
  return {
    hits,
    total: dataset.rows.length,
    rate: round((hits / dataset.rows.length) * 100),
  };
}

function unanswerable(
  metric: MetricProposal,
  missing: string[],
  extra?: string,
): MetricDashboard {
  const gap = missing.length
    ? `missing ${missing.slice(0, 4).join(", ")}`
    : "the uploaded files do not contain the required events";
  return {
    id: metric.id,
    metricId: metric.id,
    name: metric.name,
    role: metric.category,
    status: "unanswerable",
    sentence:
      extra ??
      `${metric.name} cannot be calculated from the uploaded files: ${gap}.`,
    value: "—",
    unit: metric.unit,
    target: metric.target || metric.suggestedTarget,
    chartTitle: metric.name,
    chartUnit: metric.unit || "value",
    points: [],
    missingFields: missing,
    sourceNote: "No invented baseline. Add the missing fields or a matching extract.",
  };
}

function card(
  metric: MetricProposal,
  partial: Partial<MetricDashboard> &
    Pick<MetricDashboard, "sentence" | "value" | "status">,
): MetricDashboard {
  return {
    id: metric.id,
    metricId: metric.id,
    name: metric.name,
    role: metric.category,
    unit: metric.unit,
    target: metric.target || metric.suggestedTarget,
    chartTitle: metric.name,
    chartUnit: metric.unit || "value",
    points: [],
    missingFields: [],
    sourceNote: "Calculated locally from uploaded files.",
    ...partial,
  };
}

function latestSnapshot(datasets: LocalDataset[]) {
  const snapshot = datasets.find(
    (item) => (item.aggregates?.monthlyHeadcount.length ?? 0) > 0,
  );
  const months = snapshot?.aggregates?.monthlyHeadcount ?? [];
  return {
    snapshot,
    months,
    latest: months[months.length - 1],
    prior: months.length > 1 ? months[months.length - 2] : undefined,
  };
}

function numericTarget(metric: MetricProposal) {
  const raw = metric.target || metric.suggestedTarget || "";
  const match = raw.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function comparisonPoints(
  observed: number,
  metric: MetricProposal,
  observedLabel = "Observed",
) {
  const points = [{ label: observedLabel, value: observed }];
  const target = numericTarget(metric);
  if (target !== null) points.push({ label: "Target", value: target });
  return points;
}

function durationCard(
  metric: MetricProposal,
  datasets: LocalDataset[],
  startField: string,
  endField: string,
  sentence: (medianDays: number, n: number) => string,
  status: MetricDashboard["status"] = "calculated",
  missingFields: string[] = [],
) {
  const values = durationValues(datasets, startField, endField);
  const mid = median(values);
  if (mid === null) {
    return unanswerable(
      metric,
      missingFields.length ? missingFields : metric.requiredFields,
    );
  }
  return card(metric, {
    status,
    value: `${round(mid)} days`,
    sentence: sentence(round(mid), values.length),
    chartTitle: `${metric.name} vs target`,
    chartUnit: "days",
    points: comparisonPoints(round(mid), metric),
    missingFields,
  });
}

function buildForMetric(
  metric: MetricProposal,
  datasets: LocalDataset[],
): MetricDashboard {
  if (datasets.length === 0) {
    return unanswerable(
      metric,
      metric.requiredFields,
      `${metric.name} is waiting for uploaded files in Data. No number is shown until a matching extract is profiled locally.`,
    );
  }

  const fields = availableFields(datasets);
  const missing = metric.requiredFields.filter((field) => !fields.has(field));
  const { snapshot, months, latest, prior } = latestSnapshot(datasets);

  if (metric.id === "time_to_fill" || metric.name === "Time to Fill") {
    if (fields.has("requisition_open_date") && fields.has("offer_accepted_at")) {
      return durationCard(
        metric,
        datasets,
        "requisition_open_date",
        "offer_accepted_at",
        (days, n) =>
          `Median Time to Fill is ${days} days across ${n.toLocaleString()} completed requisitions.`,
      );
    }
    const proxy = durationValues(datasets, "application_date", "hire_date");
    const mid = median(proxy);
    if (mid !== null) {
      return card(metric, {
        status: "partial",
        value: `${round(mid)} days`,
        sentence: `Time to Fill is not calculable; observed Time to Hire is ${round(mid)} days across ${proxy.length.toLocaleString()} completed cycles.`,
        chartTitle: "Observed Time to Hire vs target",
        chartUnit: "days",
        points: comparisonPoints(round(mid), metric, "Time to Hire"),
        missingFields: missing,
      });
    }
    return unanswerable(metric, missing);
  }

  if (metric.id === "time_to_hire" || metric.name === "Time to Hire") {
    return durationCard(
      metric,
      datasets,
      "application_date",
      "hire_date",
      (days, n) =>
        `Median Time to Hire is ${days} days across ${n.toLocaleString()} completed hires.`,
      "calculated",
      missing,
    );
  }

  if (metric.id === "interview_scheduling") {
    if (fields.has("interview_requested_at") && fields.has("interview_scheduled_at")) {
      return durationCard(
        metric,
        datasets,
        "interview_requested_at",
        "interview_scheduled_at",
        (days, n) =>
          `Median interview scheduling time is ${days} days across ${n.toLocaleString()} records.`,
      );
    }
    const proxy = durationValues(datasets, "reviewed_at", "interviewed_at");
    const mid = median(proxy);
    if (mid !== null) {
      return card(metric, {
        status: "partial",
        value: `${round(mid)} days`,
        sentence: `Interview request/schedule timestamps are missing; review-to-interview time is ${round(mid)} days across ${proxy.length.toLocaleString()} records.`,
        missingFields: missing,
        chartTitle: "Review-to-interview vs target",
        chartUnit: "days",
        points: comparisonPoints(round(mid), metric, "Review → Interview"),
      });
    }
    return unanswerable(metric, missing);
  }

  if (metric.id === "offer_approval") {
    return durationCard(
      metric,
      datasets,
      "offer_created_at",
      "offer_approved_at",
      (days, n) =>
        `Median offer-approval time is ${days} days across ${n.toLocaleString()} records.`,
      missing.length ? "unanswerable" : "calculated",
      missing,
    );
  }

  if (metric.id === "offer_acceptance") {
    const offers = rateFromPresence(datasets, "offer_extended_at", "offer_extended");
    const accepts = rateFromPresence(datasets, "offer_accepted_at", "offer_accepted");
    if (!offers || offers.hits === 0) return unanswerable(metric, missing);
    const accepted = accepts?.hits ?? 0;
    const rate = round((accepted / offers.hits) * 100);
    return card(metric, {
      status: "calculated",
      value: `${rate}%`,
      sentence: `Offer acceptance is ${rate}% (${accepted.toLocaleString()} accepted of ${offers.hits.toLocaleString()} extended).`,
      chartTitle: "Offers extended vs accepted",
      chartUnit: "offers",
      points: [
        { label: "Extended", value: offers.hits },
        { label: "Accepted", value: accepted },
      ],
    });
  }

  if (metric.id === "source_effectiveness") {
    const dataset = datasets.find((item) => canonicalSource(item, "source"));
    if (!dataset) return unanswerable(metric, missing);
    const sourceField = canonicalSource(dataset, "source");
    const hireField = canonicalSource(dataset, "hire_date");
    if (!sourceField) return unanswerable(metric, missing);
    const groups = new Map<string, { applications: number; hires: number }>();
    for (const row of dataset.rows) {
      const key = String(row[sourceField] ?? "Unknown");
      const current = groups.get(key) ?? { applications: 0, hires: 0 };
      current.applications += 1;
      if (hireField && asDate(row[hireField])) current.hires += 1;
      groups.set(key, current);
    }
    const ranked = [...groups.entries()]
      .map(([label, values]) => ({
        label,
        value: round((values.hires / Math.max(values.applications, 1)) * 100),
        hires: values.hires,
      }))
      .sort((a, b) => b.value - a.value);
    const top = ranked[0];
    if (!top) return unanswerable(metric, missing);
    return card(metric, {
      status: "calculated",
      value: `${top.value}%`,
      sentence: `${top.label} has the highest observed hire rate at ${top.value}% (${top.hires.toLocaleString()} hires).`,
      points: ranked.slice(0, 8).map((item) => ({
        label: item.label,
        value: item.value,
      })),
      chartTitle: "Hire rate by source",
      chartUnit: "%",
    });
  }

  if (
    metric.id === "headcount_vs_plan" ||
    metric.id === "joiners" ||
    metric.name.toLowerCase() === "headcount"
  ) {
    if (!latest) {
      const employees = datasets.reduce(
        (max, item) => Math.max(max, item.aggregates?.uniqueEmployees ?? 0),
        0,
      );
      if (employees > 0 && metric.id !== "joiners") {
        return card(metric, {
          status: "partial",
          value: employees.toLocaleString(),
          sentence: `A monthly headcount trend is not available; ${employees.toLocaleString()} unique employees were counted in the extract.`,
        });
      }
      return unanswerable(metric, missing.length ? missing : ["snapshot_month"]);
    }
    if (metric.id === "joiners") {
      const hires = snapshot?.aggregates?.hireYearCounts ?? [];
      const last = hires[hires.length - 1];
      if (!last) return unanswerable(metric, ["hire_date"]);
      return card(metric, {
        status: "calculated",
        value: last.count.toLocaleString(),
        sentence: `${last.count.toLocaleString()} unique employees have a latest hire year of ${last.year}.`,
        points: hires.slice(-8).map((item) => ({
          label: item.year,
          value: item.count,
        })),
        chartTitle: "Employees by latest hire year",
        chartUnit: "people",
      });
    }
    const mom =
      prior && prior.count
        ? round(((latest.count - prior.count) / prior.count) * 100)
        : null;
    return card(metric, {
      status: metric.id === "headcount_vs_plan" ? "partial" : "calculated",
      value: latest.count.toLocaleString(),
      sentence:
        metric.id === "headcount_vs_plan"
          ? `Actual headcount is ${latest.count.toLocaleString()} in ${formatMonth(latest.month)}; plan headcount is not in the uploaded files, so variance versus plan cannot be calculated.`
          : `Headcount is ${latest.count.toLocaleString()} in ${formatMonth(latest.month)}${
              mom === null
                ? "."
                : `, ${Math.abs(mom)}% ${mom >= 0 ? "above" : "below"} the prior month.`
            }`,
      points: months.slice(-18).map((item) => ({
        label: item.month,
        value: item.count,
      })),
      chartTitle: "Monthly headcount",
      chartUnit: "people",
      missingFields: metric.id === "headcount_vs_plan" ? ["plan_headcount"] : [],
    });
  }

  if (
    metric.id === "overall_attrition" ||
    metric.id === "first_year_attrition" ||
    metric.id === "regrettable_attrition"
  ) {
    const dataset = datasets.find((item) => canonicalSource(item, "attrition"));
    if (!dataset) {
      return unanswerable(metric, missing.length ? missing : ["attrition"]);
    }
    const source = canonicalSource(dataset, "attrition");
    const exits = dataset.rows.filter((row) =>
      asBoolean(source ? row[source] : undefined),
    ).length;
    const rate = round((exits / Math.max(dataset.rows.length, 1)) * 100);
    return card(metric, {
      status: metric.id === "overall_attrition" ? "calculated" : "partial",
      value: `${rate}%`,
      sentence:
        metric.id === "overall_attrition"
          ? `Observed attrition in the employee-outcome file is ${rate}% (${exits.toLocaleString()} of ${dataset.rowCount.toLocaleString()} rows).`
          : `${metric.name} is only partly answerable: the file has an attrition flag but not a complete first-year or regrettable definition. Observed attrition is ${rate}%.`,
      missingFields: metric.id === "overall_attrition" ? [] : missing,
    });
  }

  if (missing.length === 0 && metric.requiredFields.length >= 2) {
    const [start, end] = metric.requiredFields;
    const values = durationValues(datasets, start, end);
    const mid = median(values);
    if (mid !== null) {
      return card(metric, {
        status: "calculated",
        value: `${round(mid)} ${metric.unit || "days"}`,
        sentence: `Median ${metric.name.toLowerCase()} is ${round(mid)} ${metric.unit || "days"} across ${values.length.toLocaleString()} complete records.`,
      });
    }
  }

  return unanswerable(metric, missing);
}

function fallbackMetrics(analysis: WorkforceAnalysis): MetricProposal[] {
  return [
    {
      id: analysis.metricName.toLowerCase().replace(/\s+/g, "_"),
      name: analysis.metricName,
      category: "Outcome",
      definition: analysis.metricDefinition,
      measurementStandard: analysis.metricDefinition,
      formula: "",
      unit: analysis.chartUnit,
      requiredFields: [],
      suggestedTarget: analysis.comparisonValid ? `${analysis.targetDays} days` : "",
      target: "",
      confidence: analysis.insight.confidence,
      status: "Proposed",
      origin: "catalog",
    },
  ];
}

export function buildMetricDashboards(
  datasets: LocalDataset[],
  brief?: StrategyBrief | null,
  analysis?: WorkforceAnalysis | null,
): MetricDashboard[] {
  const metrics = (
    brief?.metrics?.length
      ? brief.metrics
      : analysis
        ? fallbackMetrics(analysis)
        : []
  );
  const dashboards = metrics.map((metric) => buildForMetric(metric, datasets));
  const note = sampledNote(datasets);

  return dashboards.map((dashboard, index) => {
    const enriched =
      dashboard.sourceNote.startsWith("Calculated") && datasets.length > 0
        ? { ...dashboard, sourceNote: note }
        : dashboard;

    if (
      index === 0 &&
      analysis &&
      analysis.chartPoints.length > 0 &&
      enriched.points.length === 0 &&
      enriched.status !== "unanswerable" &&
      analysis.chartUnit === enriched.chartUnit
    ) {
      return {
        ...enriched,
        points: analysis.chartPoints.map((point) => ({
          label: point.stage,
          value: point.medianDays,
        })),
        chartTitle: enriched.chartTitle || analysis.chartTitle,
      };
    }
    return enriched;
  });
}

export function analysisQuestion(
  brief?: StrategyBrief | null,
  analysis?: WorkforceAnalysis | null,
) {
  if (brief) {
    return brief.intentKind === "problem"
      ? `What does the uploaded evidence say about this problem: ${brief.title}?`
      : `What does the uploaded evidence say about this strategy: ${brief.title}?`;
  }
  return (
    analysis?.insight.headline ??
    "What can the uploaded files calculate for the selected People metrics?"
  );
}
