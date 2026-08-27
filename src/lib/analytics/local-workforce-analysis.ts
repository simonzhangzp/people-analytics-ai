import {
  analysisQuestion,
  buildMetricDashboards,
  targetDaysFromBrief,
} from "@/lib/analytics/metric-dashboards";
import { assessReadiness, canonicalSource } from "@/lib/data/local-profiler";
import type {
  CellValue,
  CountSegment,
  LocalDataset,
  WorkforceAnalysis,
} from "@/types/local-data";
import type { StrategyBrief } from "@/types/strategy";

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
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function durationDays(start: Date | null, end: Date | null) {
  if (!start || !end) return null;
  const value = (end.getTime() - start.getTime()) / DAY_MS;
  if (value < 0 || value > 730) return null;
  return value;
}

function valueFor(
  dataset: LocalDataset,
  row: LocalDataset["rows"][number],
  canonicalField: string,
) {
  const source = canonicalSource(dataset, canonicalField);
  return source ? row[source] : undefined;
}

function countReached(
  dataset: LocalDataset,
  dateField: string,
  booleanField: string,
) {
  return dataset.rows.filter(
    (row) =>
      Boolean(asDate(valueFor(dataset, row, dateField))) ||
      asBoolean(valueFor(dataset, row, booleanField)),
  ).length;
}

function buildFunnel(dataset: LocalDataset) {
  const stages = [
    { stage: "Applications", count: dataset.rows.length },
    {
      stage: "Reviewed",
      count: countReached(dataset, "reviewed_at", "reviewed"),
    },
    {
      stage: "Interviewed",
      count: countReached(dataset, "interviewed_at", "interviewed"),
    },
    {
      stage: "Offers",
      count: countReached(dataset, "offer_extended_at", "offer_extended"),
    },
    {
      stage: "Hires",
      count: dataset.rows.filter(
        (row) =>
          Boolean(asDate(valueFor(dataset, row, "hire_date"))) ||
          asBoolean(valueFor(dataset, row, "hired")),
      ).length,
    },
  ];

  return stages.map((stage, index) => ({
    ...stage,
    conversionFromPrior:
      index === 0
        ? 100
        : round((stage.count / Math.max(stages[index - 1].count, 1)) * 100),
    conversionFromApplication: round(
      (stage.count / Math.max(stages[0].count, 1)) * 100,
    ),
  }));
}

function buildStageDurations(dataset: LocalDataset) {
  const pairs = [
    ["Application → Review", "application_date", "reviewed_at"],
    ["Review → Interview", "reviewed_at", "interviewed_at"],
    ["Interview → Offer", "interviewed_at", "offer_extended_at"],
    ["Offer → Hire", "offer_extended_at", "hire_date"],
  ] as const;

  return pairs.flatMap(([stage, startField, endField]) => {
    const values = dataset.rows.flatMap((row) => {
      const duration = durationDays(
        asDate(valueFor(dataset, row, startField)),
        asDate(valueFor(dataset, row, endField)),
      );
      return duration === null ? [] : [duration];
    });
    if (values.length === 0) return [];
    return [
      {
        stage,
        medianDays: round(median(values)),
        sampleSize: values.length,
      },
    ];
  });
}

function buildDurationRows(
  dataset: LocalDataset,
  startField: "requisition_open_date" | "application_date",
  endField: "offer_accepted_at" | "hire_date",
) {
  return dataset.rows.flatMap((row) => {
    const duration = durationDays(
      asDate(valueFor(dataset, row, startField)),
      asDate(valueFor(dataset, row, endField)),
    );
    return duration === null ? [] : [{ row, duration }];
  });
}

function buildSegments(
  dataset: LocalDataset,
  durationRows: ReturnType<typeof buildDurationRows>,
) {
  const groupField =
    canonicalSource(dataset, "department") ??
    canonicalSource(dataset, "job_title") ??
    canonicalSource(dataset, "location");
  if (!groupField) return [];

  const groups = new Map<string, number[]>();
  for (const item of durationRows) {
    const key = String(item.row[groupField] ?? "Unknown");
    const current = groups.get(key) ?? [];
    current.push(item.duration);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .filter(([, values]) => values.length >= 5)
    .map(([segment, values]) => ({
      segment,
      medianDays: round(median(values)),
      hires: values.length,
    }))
    .sort((a, b) => b.medianDays - a.medianDays)
    .slice(0, 6);
}

function buildSources(dataset: LocalDataset) {
  const sourceField = canonicalSource(dataset, "source");
  if (!sourceField) return [];

  const groups = new Map<string, { applications: number; hires: number }>();
  for (const row of dataset.rows) {
    const source = String(row[sourceField] ?? "Unknown");
    const current = groups.get(source) ?? { applications: 0, hires: 0 };
    current.applications += 1;
    if (
      Boolean(asDate(valueFor(dataset, row, "hire_date"))) ||
      asBoolean(valueFor(dataset, row, "hired"))
    ) {
      current.hires += 1;
    }
    groups.set(source, current);
  }

  return [...groups.entries()]
    .map(([source, values]) => ({
      source,
      ...values,
      hireRate: round((values.hires / Math.max(values.applications, 1)) * 100),
    }))
    .sort((a, b) => b.hireRate - a.hireRate)
    .slice(0, 8);
}

function monthKey(value: CellValue | undefined) {
  const date = asDate(value);
  if (date) return date.toISOString().slice(0, 7);
  if (typeof value === "string" && value.length >= 7) return value.slice(0, 7);
  return null;
}

function formatMonthLabel(month: string) {
  const [year, mon] = month.split("-");
  if (!year || !mon) return month;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(mon) - 1, 1)));
}

function shiftMonth(month: string, delta: number) {
  const [year, mon] = month.split("-").map(Number);
  if (!year || !mon) return null;
  return new Date(Date.UTC(year, mon - 1 + delta, 1)).toISOString().slice(0, 7);
}

function uniqueEmployeeCount(dataset: LocalDataset) {
  if (dataset.aggregates?.uniqueEmployees) return dataset.aggregates.uniqueEmployees;
  const source = canonicalSource(dataset, "employee_id");
  if (!source) return dataset.rowCount;
  return new Set(dataset.rows.map((row) => String(row[source] ?? ""))).size;
}

function resolveMonthlyHeadcount(dataset: LocalDataset) {
  if (dataset.aggregates?.monthlyHeadcount?.length) {
    return dataset.aggregates.monthlyHeadcount;
  }
  const field = canonicalSource(dataset, "snapshot_month");
  if (!field) return [];
  const counts = new Map<string, number>();
  for (const row of dataset.rows) {
    const month = monthKey(row[field]);
    if (month) counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}

function percent(part: number, whole: number) {
  return round((part / Math.max(whole, 1)) * 100);
}

function segmentsFromCounts(items: CountSegment[] | undefined, whole: number) {
  return (items ?? []).slice(0, 6).map((item) => ({
    segment: item.segment,
    medianDays: percent(item.count, whole),
    hires: item.count,
  }));
}

function funnelFromStatus(statusCounts: Record<string, number> | undefined) {
  const entries = Object.entries(statusCounts ?? {}).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  return entries.map(([stage, count], index) => ({
    stage,
    count,
    conversionFromPrior:
      index === 0 ? 100 : percent(count, entries[index - 1][1]),
    conversionFromApplication: percent(count, total),
  }));
}

function strategyGapAction(population: string) {
  return {
    title: "Close the Time to Fill evidence gap before changing the hiring process",
    evidence:
      "The uploaded files answer workforce counts and mix, not requisition-open to accepted-offer duration.",
    hypothesis:
      "Adding requisition open dates and application-stage timestamps will make the approved hiring-speed metric calculable.",
    owner: "People Analytics + TA Operations",
    population,
    successMetric: "Recruiting event completeness",
    guardrail: "Do not treat headcount or mix as Time to Fill",
    duration: "2–4 weeks",
  };
}

function actionForStage(
  stage: string | undefined,
  medianDays: number,
  population: string,
) {
  const reduction = Math.max(1, round(medianDays * 0.2));

  if (stage === "Application → Review") {
    return {
      title: `Pilot a 48-hour application review SLA for ${population}`,
      hypothesis: `A daily triage queue and explicit review ownership will reduce median review time by at least ${reduction} days.`,
      owner: "TA Operations + Hiring Managers",
      successMetric: "Median Application Review Time",
    };
  }
  if (stage === "Review → Interview") {
    return {
      title: `Pilot centralized interview scheduling for ${population}`,
      hypothesis: `Centralized scheduling and reserved interview blocks will reduce median scheduling time by at least ${reduction} days.`,
      owner: "TA Operations",
      successMetric: "Median Review-to-Interview Time",
    };
  }
  if (stage === "Interview → Offer") {
    return {
      title: `Introduce a two-day interview-to-offer decision SLA for ${population}`,
      hypothesis: `A structured debrief and named decision owner will reduce median interview-to-offer time by at least ${reduction} days.`,
      owner: "TA Leadership + Hiring Managers",
      successMetric: "Median Interview-to-Offer Time",
    };
  }
  if (stage === "Offer → Hire") {
    return {
      title: `Redesign offer close and preboarding for ${population}`,
      hypothesis: `Earlier offer follow-up and preboarding coordination will reduce median offer-to-hire time by at least ${reduction} days.`,
      owner: "Recruiting + People Operations",
      successMetric: "Median Offer-to-Hire Time",
    };
  }
  return {
    title: "Add requisition and stage timestamps before changing the hiring process",
    hypothesis:
      "Improved event capture will identify the actual process bottleneck and prevent action based on incomplete evidence.",
    owner: "People Analytics + TA Operations",
    successMetric: "Recruiting Event Completeness",
  };
}

function analyzeRecruiting(
  datasets: LocalDataset[],
  candidate: LocalDataset,
  targetDays: number,
): WorkforceAnalysis {
  const hasTimeToFill =
    Boolean(canonicalSource(candidate, "requisition_open_date")) &&
    Boolean(canonicalSource(candidate, "offer_accepted_at"));
  const metricName = hasTimeToFill ? "Time to Fill" : "Time to Hire";
  const startField = hasTimeToFill ? "requisition_open_date" : "application_date";
  const endField = hasTimeToFill ? "offer_accepted_at" : "hire_date";
  const durationRows = buildDurationRows(candidate, startField, endField);
  const currentDays =
    durationRows.length > 0
      ? round(median(durationRows.map((item) => item.duration)))
      : null;
  const gapDays = currentDays === null ? null : round(currentDays - targetDays);
  const stageDurations = buildStageDurations(candidate).sort(
    (a, b) => b.medianDays - a.medianDays,
  );
  const funnel = buildFunnel(candidate);
  const segments = buildSegments(candidate, durationRows);
  const sources = buildSources(candidate);
  const readiness = assessReadiness(datasets);
  const primaryStage = stageDurations[0];
  const slowestSegment = segments[0];
  const hireStep = funnel.find((step) => step.stage === "Hires");
  const actionTemplate = actionForStage(
    primaryStage?.stage,
    primaryStage?.medianDays ?? 0,
    slowestSegment?.segment ?? "priority roles",
  );
  const employeeDataset = datasets.find(
    (dataset) => dataset.entity === "Employee Outcome",
  );

  const insightHeadline =
    currentDays === null
      ? "The uploaded data cannot calculate a complete hiring-cycle duration"
      : hasTimeToFill
        ? `Median Time to Fill is ${currentDays} days—${Math.abs(gapDays ?? 0)} days ${gapDays && gapDays > 0 ? "above" : "below"} target`
        : `Median Time to Hire is ${currentDays} days; ${primaryStage?.stage ?? "stage timing"} is the longest measured stage`;

  const evidence = [
    `${durationRows.length.toLocaleString()} completed hires support the ${metricName} calculation.`,
    primaryStage
      ? `${primaryStage.stage} has a ${primaryStage.medianDays}-day median across ${primaryStage.sampleSize.toLocaleString()} records.`
      : "Stage timestamps are insufficient for bottleneck analysis.",
    slowestSegment
      ? `${slowestSegment.segment} has the longest segment median at ${slowestSegment.medianDays} days across ${slowestSegment.hires.toLocaleString()} hires.`
      : "No reliable department or role segment is available.",
    hireStep
      ? `${hireStep.count.toLocaleString()} hires represent ${hireStep.conversionFromApplication}% of applications.`
      : "Hire conversion could not be calculated.",
  ];

  const limitation = hasTimeToFill
    ? employeeDataset
      ? "Post-hire outcomes are present, but candidate-to-employee linkage is unavailable."
      : "Post-hire Quality of Hire outcomes are not available."
    : "Requisition open and accepted-offer timestamps are unavailable, so the approved Time to Fill metric cannot be calculated. Time to Hire is shown as an observed proxy, not a substitute definition.";

  const action = {
    title: actionTemplate.title,
    evidence: primaryStage
      ? `${primaryStage.stage} is the longest measured stage at ${primaryStage.medianDays} days median.`
      : "The current event coverage is insufficient to isolate a process bottleneck.",
    hypothesis: actionTemplate.hypothesis,
    owner: actionTemplate.owner,
    population: slowestSegment?.segment ?? "Priority hiring population",
    successMetric: actionTemplate.successMetric,
    guardrail: "Offer Acceptance Rate and Candidate Experience",
    duration: "4–6 weeks",
  };

  const storySlides = [
    {
      id: 1,
      kicker: "Executive answer",
      headline: insightHeadline,
      visual: "summary" as const,
      facts: [
        currentDays === null ? "Duration unavailable" : `${currentDays} days observed`,
        `${durationRows.length.toLocaleString()} completed hires`,
        hasTimeToFill ? "Time to Fill" : "Time to Hire proxy",
      ],
    },
    {
      id: 2,
      kicker: "Where time is spent",
      headline: primaryStage
        ? `${primaryStage.stage} is the longest measured stage`
        : "Stage-level timestamps need improvement",
      visual: "bar" as const,
      facts: stageDurations.slice(0, 3).map(
        (stage) => `${stage.stage}: ${stage.medianDays} days`,
      ),
    },
    {
      id: 3,
      kicker: "Where the delay concentrates",
      headline: slowestSegment
        ? `${slowestSegment.segment} has the longest hiring-cycle median`
        : "Segment concentration cannot be assessed",
      visual: "segments" as const,
      facts: segments
        .slice(0, 3)
        .map((segment) => `${segment.segment}: ${segment.medianDays} days`),
    },
    {
      id: 4,
      kicker: "Evidence boundary",
      headline: hasTimeToFill
        ? "The strategy metric is answerable, but post-hire linkage remains incomplete"
        : "The data answers Time to Hire—not the approved Time to Fill definition",
      visual: "answerability" as const,
      facts: [
        `Answerability: ${readiness.answerability}%`,
        `${readiness.canAnswer.length} questions answerable`,
        `${readiness.cannotAnswer.length} evidence gaps`,
      ],
    },
    {
      id: 5,
      kicker: "Recommended decision",
      headline: action.title,
      visual: "actions" as const,
      facts: [action.duration, action.successMetric, `Guardrail: ${action.guardrail}`],
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    sourceDatasetNames: datasets.map((dataset) => dataset.name),
    question: "",
    dashboards: [],
    metricName,
    metricDefinition: hasTimeToFill
      ? "Requisition open date to accepted offer date"
      : "Application date to hire/start date",
    headlineValue: currentDays === null ? "—" : `${currentDays} days`,
    valueCaption: `${durationRows.length.toLocaleString()} completed cycles`,
    currentDays,
    targetDays,
    comparisonValid: hasTimeToFill,
    gapDays,
    sampleSize: durationRows.length,
    chartTitle: "Measured stage duration",
    chartUnit: "days",
    chartPoints: stageDurations.map((stage) => ({
      stage: stage.stage,
      medianDays: stage.medianDays,
    })),
    stageDurations,
    funnelTitle: "Recruiting funnel",
    segmentTitle: "Longest segment medians",
    funnel,
    segments,
    sources,
    readiness,
    insight: {
      headline: insightHeadline,
      evidence,
      limitation,
      confidence: hasTimeToFill && durationRows.length >= 100 ? "High" : "Medium",
      metricVersion: `${metricName} · Calculated locally from uploaded files`,
    },
    storySlides,
    action,
    sourceNote: `Calculated locally from ${datasets.map((dataset) => dataset.name).join(", ")}. Raw rows were not uploaded.`,
  };
}

function analyzeHeadcount(
  datasets: LocalDataset[],
  snapshot: LocalDataset,
): WorkforceAnalysis {
  const roster = datasets.find((dataset) => dataset.entity === "Employee Roster");
  const hireExtract = datasets.find(
    (dataset) => dataset.entity === "Employee Hire Extract",
  );
  const months = resolveMonthlyHeadcount(snapshot);
  const latest = months[months.length - 1];
  const prior = months.length > 1 ? months[months.length - 2] : undefined;
  const yearAgoMonth = latest ? shiftMonth(latest.month, -12) : null;
  const yearAgo = yearAgoMonth
    ? months.find((item) => item.month === yearAgoMonth)
    : undefined;
  const latestCount = latest?.count ?? uniqueEmployeeCount(snapshot);
  const momChange =
    latest && prior ? round(((latest.count - prior.count) / Math.max(prior.count, 1)) * 100) : null;
  const yoyChange =
    latest && yearAgo
      ? round(((latest.count - yearAgo.count) / Math.max(yearAgo.count, 1)) * 100)
      : null;
  const uniqueEmployees = uniqueEmployeeCount(snapshot);
  const readiness = assessReadiness(datasets);
  const latestLabel = latest ? formatMonthLabel(latest.month) : "latest snapshot";
  const chartPoints = months.slice(-24).map((item) => ({
    stage: item.month,
    medianDays: item.count,
  }));
  const mixSource = roster ?? snapshot;
  const mixField =
    snapshot.aggregates?.latestMonthSegmentField ??
    (roster?.aggregates?.mixCounts?.department ? "department" : undefined) ??
    (mixSource.aggregates?.mixCounts
      ? Object.keys(mixSource.aggregates.mixCounts)[0]
      : undefined);
  const mixItems =
    snapshot.aggregates?.latestMonthSegments?.length
      ? snapshot.aggregates.latestMonthSegments
      : mixField
        ? mixSource.aggregates?.mixCounts?.[mixField]
        : undefined;
  const mixWhole =
    mixItems?.reduce((sum, item) => sum + item.count, 0) ?? latestCount;
  const segments = segmentsFromCounts(mixItems, mixWhole);
  const funnel = funnelFromStatus(snapshot.aggregates?.statusCounts);
  const topSegment = segments[0];
  const recentHireYears = (snapshot.aggregates?.hireYearCounts ??
    hireExtract?.aggregates?.hireYearCounts ??
    [])
    .slice(-3);
  const recentHires = recentHireYears.reduce((sum, item) => sum + item.count, 0);

  const momText =
    momChange === null
      ? "month-over-month change is not available"
      : `${Math.abs(momChange)}% ${momChange >= 0 ? "above" : "below"} the prior month`;
  const insightHeadline = latest
    ? `Headcount is ${latestCount.toLocaleString()} in ${latestLabel}, ${momText}`
    : `The snapshot extract covers ${uniqueEmployees.toLocaleString()} unique employees`;

  const evidence = [
    latest
      ? `${latestCount.toLocaleString()} employee-month rows are counted in ${latestLabel}.`
      : `${snapshot.rowCount.toLocaleString()} snapshot rows were profiled.`,
    `${uniqueEmployees.toLocaleString()} unique employee IDs appear across ${months.length || 1} month${months.length === 1 ? "" : "s"}.`,
    yoyChange === null
      ? "A same-month comparison from 12 months earlier is not available."
      : `Year-over-year headcount is ${Math.abs(yoyChange)}% ${yoyChange >= 0 ? "higher" : "lower"} than ${formatMonthLabel(yearAgoMonth ?? "")}.`,
    topSegment
      ? `${topSegment.segment} is the largest ${mixField ?? "segment"} at ${topSegment.medianDays}% (${topSegment.hires.toLocaleString()}).`
      : "Country or department mix is not available in the snapshot extract.",
    recentHires > 0
      ? `${recentHires.toLocaleString()} unique employees have a latest hire year of ${recentHireYears.map((item) => item.year).join(", ")}.`
      : "Hire-date recency could not be summarized.",
  ];

  const limitation =
    "These files are employee snapshots and roster extracts. They do not contain requisition open, application, or accepted-offer dates, so the approved Time to Fill definition cannot be calculated. Protected attributes such as sex are not used as action drivers.";

  const action = strategyGapAction(topSegment?.segment ?? `${latestLabel} population`);
  if (yoyChange !== null && Math.abs(yoyChange) >= 3) {
    action.evidence = `${action.evidence} Latest snapshot headcount is ${latestCount.toLocaleString()}, ${Math.abs(yoyChange)}% ${yoyChange >= 0 ? "above" : "below"} the same month a year earlier.`;
  }

  const storySlides = [
    {
      id: 1,
      kicker: "Executive answer",
      headline: insightHeadline,
      visual: "summary" as const,
      facts: [
        `${latestCount.toLocaleString()} headcount`,
        latestLabel,
        yoyChange === null ? "YoY unavailable" : `${yoyChange > 0 ? "+" : ""}${yoyChange}% YoY`,
      ],
    },
    {
      id: 2,
      kicker: "How the count moved",
      headline:
        months.length > 1
          ? `Monthly headcount is available for ${months.length} months`
          : "Only one snapshot month is available",
      visual: "bar" as const,
      facts: months.slice(-3).map(
        (item) => `${formatMonthLabel(item.month)}: ${item.count.toLocaleString()}`,
      ),
    },
    {
      id: 3,
      kicker: "Where the workforce concentrates",
      headline: topSegment
        ? `${topSegment.segment} is the largest observed group`
        : "Composition fields are limited in the snapshot extract",
      visual: "segments" as const,
      facts: segments
        .slice(0, 3)
        .map((segment) => `${segment.segment}: ${segment.hires.toLocaleString()} (${segment.medianDays}%)`),
    },
    {
      id: 4,
      kicker: "Evidence boundary",
      headline: "The data answers headcount—not the approved Time to Fill definition",
      visual: "answerability" as const,
      facts: [
        `Answerability: ${readiness.answerability}%`,
        `${readiness.canAnswer.length} questions answerable`,
        `${readiness.cannotAnswer.length} evidence gaps`,
      ],
    },
    {
      id: 5,
      kicker: "Recommended decision",
      headline: action.title,
      visual: "actions" as const,
      facts: [action.duration, action.successMetric, `Guardrail: ${action.guardrail}`],
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    sourceDatasetNames: datasets.map((dataset) => dataset.name),
    question: "",
    dashboards: [],
    metricName: "Headcount",
    metricDefinition: "Employee × month snapshot rows counted as monthly headcount",
    headlineValue: latestCount.toLocaleString(),
    valueCaption: latest ? `Snapshot · ${latestLabel}` : "Unique employees in extract",
    currentDays: null,
    targetDays: 45,
    comparisonValid: false,
    gapDays: null,
    sampleSize: latestCount,
    chartTitle: "Monthly headcount",
    chartUnit: "people",
    chartPoints,
    stageDurations: chartPoints.map((point) => ({
      stage: point.stage,
      medianDays: point.medianDays,
      sampleSize: point.medianDays,
    })),
    funnelTitle: "Workforce status mix",
    segmentTitle: mixField
      ? `Largest ${mixField.replace(/_/g, " ")} groups`
      : "Largest observed groups",
    funnel,
    segments,
    sources: [],
    readiness,
    insight: {
      headline: insightHeadline,
      evidence,
      limitation,
      confidence: months.length >= 12 ? "High" : "Medium",
      metricVersion: "Headcount · Calculated locally from uploaded files",
    },
    storySlides,
    action,
    sourceNote: `Calculated locally from ${datasets.map((dataset) => dataset.name).join(", ")}. Raw rows were not uploaded.${snapshot.aggregates?.sampled ? " Large files were counted in full and inspected from a local sample." : ""}`,
  };
}

function analyzeWorkforceMix(
  datasets: LocalDataset[],
  primary: LocalDataset,
): WorkforceAnalysis {
  const readiness = assessReadiness(datasets);
  const employees = uniqueEmployeeCount(primary);
  const mixField = ["department", "region", "tenure_band", "country", "job_title"].find(
    (field) => (primary.aggregates?.mixCounts?.[field]?.length ?? 0) > 0,
  );
  const mixItems = mixField ? primary.aggregates?.mixCounts?.[mixField] : undefined;
  const mixWhole = mixItems?.reduce((sum, item) => sum + item.count, 0) ?? employees;
  const segments = segmentsFromCounts(mixItems, mixWhole);
  const topSegment = segments[0];
  const hireYears = primary.aggregates?.hireYearCounts ?? [];
  const chartPoints = (hireYears.length
    ? hireYears.map((item) => ({ stage: item.year, medianDays: item.count }))
    : segments.map((item) => ({ stage: item.segment, medianDays: item.hires }))
  ).slice(-16);
  const latestHireYear = hireYears[hireYears.length - 1];
  const insightHeadline = topSegment
    ? `${employees.toLocaleString()} employees; ${topSegment.segment} is ${topSegment.medianDays}% of the largest ${mixField?.replace(/_/g, " ")} group`
    : `${employees.toLocaleString()} employees are present in the uploaded extract`;

  const evidence = [
    `${employees.toLocaleString()} unique employee IDs were counted.`,
    topSegment
      ? `${topSegment.segment} has ${topSegment.hires.toLocaleString()} rows (${topSegment.medianDays}%).`
      : "Department, region, or tenure columns were not available for a mix breakdown.",
    latestHireYear
      ? `${latestHireYear.count.toLocaleString()} employees have a latest hire year of ${latestHireYear.year}.`
      : "A hire-year distribution is not available.",
    primary.aggregates?.dateRangeStart && primary.aggregates.dateRangeEnd
      ? `Observed dates run ${formatMonthLabel(primary.aggregates.dateRangeStart)}–${formatMonthLabel(primary.aggregates.dateRangeEnd)}.`
      : "No full-file date range was aggregated.",
  ];

  const action = strategyGapAction(topSegment?.segment ?? "Current employee extract");
  const storySlides = [
    {
      id: 1,
      kicker: "Executive answer",
      headline: insightHeadline,
      visual: "summary" as const,
      facts: [
        `${employees.toLocaleString()} employees`,
        mixField ? mixField.replace(/_/g, " ") : "Mix unavailable",
        latestHireYear ? `Latest hire year ${latestHireYear.year}` : "Hire year unavailable",
      ],
    },
    {
      id: 2,
      kicker: hireYears.length ? "When people were hired" : "How the extract is distributed",
      headline: hireYears.length
        ? "Hire-year counts are available for current employees"
        : "The extract supports a one-time workforce mix view",
      visual: "bar" as const,
      facts: chartPoints.slice(-3).map((point) => `${point.stage}: ${point.medianDays.toLocaleString()}`),
    },
    {
      id: 3,
      kicker: "Where the workforce concentrates",
      headline: topSegment
        ? `${topSegment.segment} is the largest observed group`
        : "Composition fields are limited",
      visual: "segments" as const,
      facts: segments
        .slice(0, 3)
        .map((segment) => `${segment.segment}: ${segment.hires.toLocaleString()} (${segment.medianDays}%)`),
    },
    {
      id: 4,
      kicker: "Evidence boundary",
      headline: "The extract answers workforce mix—not Time to Fill or monthly headcount trend",
      visual: "answerability" as const,
      facts: [
        `Answerability: ${readiness.answerability}%`,
        `${readiness.canAnswer.length} questions answerable`,
        `${readiness.cannotAnswer.length} evidence gaps`,
      ],
    },
    {
      id: 5,
      kicker: "Recommended decision",
      headline: action.title,
      visual: "actions" as const,
      facts: [action.duration, action.successMetric, `Guardrail: ${action.guardrail}`],
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    sourceDatasetNames: datasets.map((dataset) => dataset.name),
    question: "",
    dashboards: [],
    metricName: "Workforce mix",
    metricDefinition: "Unique employees and categorical mix from the uploaded extract",
    headlineValue: employees.toLocaleString(),
    valueCaption: "Unique employees in extract",
    currentDays: null,
    targetDays: 45,
    comparisonValid: false,
    gapDays: null,
    sampleSize: employees,
    chartTitle: hireYears.length ? "Employees by latest hire year" : "Largest groups",
    chartUnit: "people",
    chartPoints,
    stageDurations: chartPoints.map((point) => ({
      stage: point.stage,
      medianDays: point.medianDays,
      sampleSize: point.medianDays,
    })),
    funnelTitle: "Workforce attributes",
    segmentTitle: mixField
      ? `Largest ${mixField.replace(/_/g, " ")} groups`
      : "Largest observed groups",
    funnel: funnelFromStatus(
      mixItems
        ? Object.fromEntries(mixItems.map((item) => [item.segment, item.count]))
        : undefined,
    ),
    segments,
    sources: [],
    readiness,
    insight: {
      headline: insightHeadline,
      evidence,
      limitation:
        "This extract does not include monthly snapshots or recruiting stage events. The approved Time to Fill metric cannot be calculated. Sex and other protected attributes are not used as action drivers.",
      confidence: employees >= 100 ? "Medium" : "Low",
      metricVersion: "Workforce mix · Calculated locally from uploaded files",
    },
    storySlides,
    action,
    sourceNote: `Calculated locally from ${datasets.map((dataset) => dataset.name).join(", ")}. Raw rows were not uploaded.`,
  };
}

export function analyzeLocalWorkforceData(
  datasets: LocalDataset[],
  targetDays = 45,
  brief?: StrategyBrief | null,
): WorkforceAnalysis {
  const resolvedTarget = brief ? targetDaysFromBrief(brief, targetDays) : targetDays;
  const candidate = datasets.find(
    (dataset) => dataset.entity === "Candidate Application",
  );
  const snapshot = datasets.find((dataset) => dataset.entity === "Employee Snapshot");
  const roster = datasets.find((dataset) => dataset.entity === "Employee Roster");
  const hireExtract = datasets.find(
    (dataset) => dataset.entity === "Employee Hire Extract",
  );
  const primary = roster ?? hireExtract;

  const result = candidate
    ? analyzeRecruiting(datasets, candidate, resolvedTarget)
    : snapshot
      ? analyzeHeadcount(datasets, snapshot)
      : primary
        ? analyzeWorkforceMix(datasets, primary)
        : null;

  if (!result) {
    throw new Error(
      "Upload a recruiting file, employee snapshot, roster, or hire extract before running analysis.",
    );
  }

  result.question = analysisQuestion(brief, result);
  result.dashboards = buildMetricDashboards(datasets, brief, result);
  return result;
}
