import type {
  DatasetMetadata,
  PeopleDomain,
} from "@/types/workbench";
import type {
  CapabilityReport,
  GenericAnalysisOperation,
} from "@/types/semantics";

type SupportedDomain = CapabilityReport["domain"];

interface CapabilityDefinition {
  domain: SupportedDomain;
  metricKey: string;
  metricName: string;
  tableTypes: string[];
  anyFields: string[];
  operations: GenericAnalysisOperation[];
  requirement: string;
}

const DEFINITIONS: CapabilityDefinition[] = [
  {
    domain: "workforce",
    metricKey: "headcount",
    metricName: "Headcount / workforce composition",
    tableTypes: ["employee_roster", "employee_snapshot", "demographics"],
    anyFields: ["employee_id", "employee_count"],
    operations: ["summary", "distribution", "segment", "compare_periods"],
    requirement: "an employee identity or an aggregate employee-count measure",
  },
  {
    domain: "retention",
    metricKey: "retention_events",
    metricName: "Exit count / observable attrition",
    tableTypes: ["termination_event", "employee_outcome", "employee_snapshot"],
    anyFields: ["term_date", "attrition", "exit_classification"],
    operations: ["summary", "rate", "distribution", "validate_trend", "segment"],
    requirement: "a termination event/date or an employee outcome flag",
  },
  {
    domain: "recruiting",
    metricKey: "recruiting_activity",
    metricName: "Recruiting activity / funnel",
    tableTypes: ["requisition", "candidate_application", "aggregate_people_fact"],
    anyFields: [
      "application_id",
      "requisition_id",
      "applications_count",
      "advertisements_count",
      "staffing_days",
      "record_count",
    ],
    operations: ["summary", "funnel", "duration", "compare_periods", "segment"],
    requirement: "an application/requisition identity or a recruiting activity measure",
  },
  {
    domain: "compensation",
    metricKey: "compensation_position",
    metricName: "Pay level / pay gap",
    tableTypes: ["compensation", "aggregate_people_fact"],
    anyFields: [
      "annual_base_salary",
      "compensation_amount",
      "compa_ratio",
      "pay_gap_mean_pct",
      "pay_gap_median_pct",
    ],
    operations: ["summary", "distribution", "segment", "compare_periods"],
    requirement: "a pay amount, compa-ratio, or aggregate pay-gap measure",
  },
  {
    domain: "performance",
    metricKey: "performance_distribution",
    metricName: "Review completion / rating distribution",
    tableTypes: ["performance_review"],
    anyFields: [
      "performance_rating",
      "overall_performance",
      "appraisal_status",
      "talent_review_status",
      "placement_code",
    ],
    operations: ["summary", "distribution", "segment"],
    requirement: "a performance rating, placement, or review-status field",
  },
  {
    domain: "absence",
    metricKey: "absence",
    metricName: "Absence rate / incidence",
    tableTypes: ["absence"],
    anyFields: ["absence_rate", "absence_hours", "absence_date"],
    operations: ["summary", "rate", "validate_trend", "compare_periods"],
    requirement: "an absence rate, duration, or dated absence event",
  },
  {
    domain: "engagement",
    metricKey: "engagement",
    metricName: "Engagement mean / favorable score",
    tableTypes: ["engagement_survey"],
    anyFields: ["engagement_score", "survey_wave"],
    operations: ["summary", "distribution", "validate_trend", "segment"],
    requirement: "an engagement score, survey item, or survey wave",
  },
  {
    domain: "learning",
    metricKey: "learning",
    metricName: "Learning completion / pass rate",
    tableTypes: ["learning_record"],
    anyFields: [
      "course_id",
      "course_name",
      "learning_status",
      "learning_score",
      "pass_flag",
    ],
    operations: ["summary", "rate", "distribution", "segment"],
    requirement: "a learning activity, completion, pass, or score field",
  },
  {
    domain: "mobility",
    metricKey: "mobility",
    metricName: "Promotion / internal movement",
    tableTypes: ["mobility"],
    anyFields: ["move_type", "movement_count", "job_change_date", "record_count"],
    operations: ["summary", "rate", "distribution", "compare_periods"],
    requirement: "a movement type, count, or effective date",
  },
  {
    domain: "diversity",
    metricKey: "representation",
    metricName: "Representation / self-identification mix",
    tableTypes: ["demographics", "employee_roster", "employee_snapshot"],
    anyFields: ["gender", "ethnicity", "demographic_category", "record_count"],
    operations: ["summary", "distribution", "segment", "compare_periods"],
    requirement: "a reviewed demographic category and a valid population count",
  },
];

function canonicalFields(metadata: DatasetMetadata): Set<string> {
  return new Set(
    metadata.columns.flatMap((column) =>
      column.canonicalField ? [column.canonicalField] : [],
    ),
  );
}

function matchesDefinition(
  metadata: DatasetMetadata,
  definition: CapabilityDefinition,
): boolean {
  const contract = metadata.tableContract;
  const fields = canonicalFields(metadata);
  const tableMatch =
    Boolean(contract) &&
    definition.tableTypes.includes(contract?.tableType ?? "") &&
    (contract?.domains.includes(definition.domain) ?? false);
  const fieldMatch = definition.anyFields.some(
    (field) => fields.has(field) && (field !== "record_count" || tableMatch),
  );
  const surveyItemMatch =
    definition.domain === "engagement" &&
    metadata.columns.some((column) => /^q_?\d+$/i.test(column.sourceName));
  return Boolean((tableMatch && (fieldMatch || surveyItemMatch)) || fieldMatch || surveyItemMatch);
}

function confidenceFor(
  datasets: DatasetMetadata[],
): CapabilityReport["confidence"] {
  const score = Math.max(
    ...datasets.map((metadata) => metadata.tableContract?.confidence ?? 0),
    0,
  );
  if (score >= 0.9) return "High";
  if (score >= 0.7) return "Medium";
  return "Low";
}

export function buildCapabilityReports(
  datasets: readonly DatasetMetadata[],
): CapabilityReport[] {
  return DEFINITIONS.map((definition) => {
    const matched = datasets.filter((metadata) =>
      matchesDefinition(metadata, definition),
    );
    const firstContract = matched[0]?.tableContract;
    const population =
      firstContract?.populationCandidates[0] ?? {
        id: `capability:${definition.domain}:population:all`,
        label: "All records in the approved dataset",
        confidence: matched.length ? 0.8 : 0,
        status: matched.length ? ("Approved" as const) : ("Needs Review" as const),
        evidence: matched.length
          ? ["No population filter is applied by default."]
          : ["No compatible dataset is attached."],
      };
    const currentWindow = matched
      .flatMap((metadata) => metadata.tableContract?.dateWindows ?? [])
      .at(0);
    const runnable = matched.length > 0;

    return {
      id: `capability:${definition.domain}:${definition.metricKey}`,
      domain: definition.domain,
      metricKey: definition.metricKey,
      metricName: definition.metricName,
      runnable,
      datasetIds: matched.map((metadata) => metadata.id),
      supportedOperations: runnable ? definition.operations : ["data_gap"],
      missing: runnable
        ? []
        : [`Needs ${definition.requirement}.`],
      assumptions: runnable
        ? [
            "The default population is all observed records; no hidden business-unit filter is applied.",
            ...(currentWindow
              ? [`The period label comes from ${currentWindow.sourceField}.`]
              : ["No period comparison will be claimed without an observed time field."]),
          ]
        : [],
      confidence: confidenceFor(matched),
      population,
      currentWindow,
    };
  });
}

const QUESTION_HINTS: Record<SupportedDomain, RegExp> = {
  workforce: /headcount|workforce|staff|employee|员工|人数|人力/,
  retention: /attrition|turnover|retention|exit|termination|离职|流失|留任/,
  recruiting: /recruit|hire|candidate|application|vacan|招聘|候选|录用/,
  compensation: /pay|salary|compensation|wage|reward|薪酬|工资|薪资/,
  performance: /performance|rating|review|appraisal|绩效|评级/,
  absence: /absence|sickness|leave|absent|缺勤|病假|请假/,
  engagement: /engagement|survey|pulse|sentiment|敬业|调查|满意/,
  learning: /learning|training|course|skill|培训|学习|课程/,
  mobility: /mobility|promotion|movement|transfer|晋升|流动|调动/,
  diversity: /diversity|representation|gender|ethnic|equity|多元|性别|族裔|代表性/,
};

export function selectCapabilityForQuestion(
  question: string,
  reports: readonly CapabilityReport[],
): CapabilityReport | undefined {
  const normalized = question.trim();
  const hintedDomains = (Object.entries(QUESTION_HINTS) as Array<
    [SupportedDomain, RegExp]
  >)
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([domain]) => domain);
  return (
    hintedDomains
      .map((domain) => reports.find((report) => report.domain === domain))
      .find(Boolean) ??
    reports.find((report) => report.runnable)
  );
}

export function capabilityDomain(
  report: CapabilityReport,
): PeopleDomain {
  return report.domain;
}
