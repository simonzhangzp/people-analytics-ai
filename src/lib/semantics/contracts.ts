import type { ColumnProfile } from "@/types/workbench";
import type {
  IdentityBinding,
  PeopleTableType,
  PopulationSpec,
  TableContract,
  TimeBinding,
} from "@/types/semantics";
import type { TableInference } from "./grain-inference";

const IDENTITY_PRIORITY = [
  "employee_id",
  "candidate_id",
  "application_id",
  "requisition_id",
  "appraisal_id",
  "course_id",
];

const TIME_PRIORITY_BY_TABLE: Partial<Record<PeopleTableType, string[]>> = {
  employee_snapshot: ["snapshot_month", "report_period"],
  employee_outcome: ["term_date", "snapshot_month", "report_period"],
  termination_event: ["term_date", "report_period"],
  requisition: ["requisition_open_date", "offer_accepted_at", "report_period"],
  candidate_application: ["application_date", "offer_accepted_at", "report_period"],
  compensation: [
    "compensation_effective_date",
    "compensation_snapshot_date",
    "snapshot_month",
    "report_period",
  ],
  performance_review: ["appraisal_completed_date", "report_period"],
  absence: ["absence_date", "report_period"],
  engagement_survey: ["survey_wave", "report_period"],
  learning_record: ["learning_completed_at", "report_period"],
  mobility: ["job_change_date", "report_period"],
  demographics: ["report_period", "snapshot_month"],
  aggregate_people_fact: ["report_period", "snapshot_month"],
};

const POPULATION_FIELDS = [
  "department",
  "country",
  "region",
  "location",
  "job_role",
  "seniority_level",
  "employee_type",
  "employment_status",
  "gender",
  "ethnicity",
  "demographic_category",
];

function normalizedScore(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

function identityEntity(
  canonicalField: string,
): IdentityBinding["entity"] {
  if (canonicalField === "candidate_id") return "candidate";
  if (canonicalField === "requisition_id") return "requisition";
  if (canonicalField === "application_id") return "application";
  if (canonicalField === "employee_id") return "employee";
  return "event";
}

export function inferIdentityBinding(
  columns: readonly ColumnProfile[],
): IdentityBinding | undefined {
  const candidates = columns
    .filter(
      (column) =>
        column.canonicalField &&
        IDENTITY_PRIORITY.includes(column.canonicalField),
    )
    .sort(
      (left, right) =>
        IDENTITY_PRIORITY.indexOf(left.canonicalField ?? "") -
        IDENTITY_PRIORITY.indexOf(right.canonicalField ?? ""),
    );
  const column = candidates[0];
  if (!column?.canonicalField) return undefined;
  const coverage = 1 - normalizedScore(column.nullPct);
  const uniqueness = normalizedScore(column.distinctPct);
  return {
    sourceName: column.sourceName,
    canonicalField: column.canonicalField,
    entity: identityEntity(column.canonicalField),
    coverage,
    uniqueness,
    confidence: Math.max(
      0,
      Math.min(
        1,
        normalizedScore(column.confidence) * 0.5 +
          coverage * 0.25 +
          uniqueness * 0.25,
      ),
    ),
  };
}

function timeGrain(column: ColumnProfile): TimeBinding["grain"] {
  const values = `${column.min ?? ""} ${column.max ?? ""}`;
  if (/\bq[1-4]\b/i.test(values) || /quarter/i.test(column.sourceName)) {
    return "quarter";
  }
  if (/^\s*\d{4}\s+\d{4}\s*$/.test(values) || /year/i.test(column.sourceName)) {
    return "year";
  }
  if (/month/i.test(column.sourceName) || /^\d{4}-\d{2}\b/.test(String(column.min))) {
    return "month";
  }
  return column.inferredType === "date" ? "day" : "unknown";
}

export function inferTimeBinding(
  tableType: PeopleTableType,
  columns: readonly ColumnProfile[],
): TimeBinding | undefined {
  const priority = TIME_PRIORITY_BY_TABLE[tableType] ?? ["report_period"];
  const candidates = columns
    .filter(
      (column) =>
        column.inferredType === "date" ||
        column.semanticRole === "period" ||
        priority.includes(column.canonicalField ?? ""),
    )
    .sort((left, right) => {
      const leftIndex = priority.indexOf(left.canonicalField ?? "");
      const rightIndex = priority.indexOf(right.canonicalField ?? "");
      return (
        (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
      );
    });
  const column = candidates[0];
  if (!column) return undefined;
  const canonicalField = column.canonicalField;
  const role =
    canonicalField === "snapshot_month" ||
    canonicalField === "compensation_snapshot_date"
      ? "as_of_date"
      : canonicalField === "report_period" || canonicalField === "survey_wave"
        ? "period"
        : "event_date";
  return {
    sourceName: column.sourceName,
    canonicalField,
    role,
    min: column.min === undefined ? undefined : String(column.min),
    max: column.max === undefined ? undefined : String(column.max),
    distinctCount: column.distinctCount,
    grain: timeGrain(column),
    confidence: normalizedScore(column.confidence ?? 80),
  };
}

export function inferPopulationSpecs(
  datasetId: string,
  columns: readonly ColumnProfile[],
): PopulationSpec[] {
  return [
    {
      id: `${datasetId}:population:all`,
      label: "All records in the approved dataset",
      confidence: 1,
      status: "Approved",
      evidence: ["No population filter is applied by default."],
    },
    ...columns
      .filter((column) =>
        POPULATION_FIELDS.includes(column.canonicalField ?? ""),
      )
      .map((column) => ({
        id: `${datasetId}:population:${column.sourceName}`,
        label: `Filter by ${column.semanticMeaning ?? column.sourceName}`,
        sourceField: column.sourceName,
        confidence: normalizedScore(column.confidence ?? 75),
        status: "Needs Review" as const,
        evidence: [
          `${column.distinctCount.toLocaleString("en-US")} distinct values; values remain local until selected.`,
        ],
      })),
  ];
}

export function inferDateWindows(
  datasetId: string,
  time: TimeBinding | undefined,
) {
  if (!time || (!time.min && !time.max)) return [];
  return [
    {
      id: `${datasetId}:window:observed`,
      label:
        time.min && time.max && time.min !== time.max
          ? `${time.min} – ${time.max}`
          : (time.min ?? time.max ?? "Observed period"),
      start: time.min,
      end: time.max,
      basis:
        time.role === "as_of_date"
          ? ("as_of" as const)
          : time.role === "period"
            ? ("reported_period" as const)
            : ("event_range" as const),
      sourceField: time.sourceName,
      status: "Approved" as const,
    },
  ];
}

export function buildTableContract(input: {
  datasetId: string;
  columns: readonly ColumnProfile[];
  inference: TableInference;
}): TableContract {
  const { datasetId, columns, inference } = input;
  const identity = inferIdentityBinding(columns);
  const time = inferTimeBinding(inference.tableType, columns);
  const confidence = normalizedScore(inference.typeConfidence);
  const dateWindows = inferDateWindows(datasetId, time);
  const closeAlternative = inference.alternatives[1];

  return {
    datasetId,
    tableType: inference.tableType,
    dataShape: inference.dataShape,
    domains: [...inference.domains],
    confidence,
    identity,
    time,
    populationCandidates: inferPopulationSpecs(datasetId, columns),
    dateWindows,
    alternatives: inference.alternatives,
    status:
      confidence >= 0.85 &&
      (!closeAlternative || confidence - closeAlternative.score >= 0.03)
        ? "Approved"
        : "Needs Review",
    evidence: [
      ...inference.evidence,
      identity
        ? `Identity candidate ${identity.sourceName} is ${(identity.coverage * 100).toFixed(1)}% populated and ${(identity.uniqueness * 100).toFixed(1)}% unique.`
        : "No person or event identity is required or safely inferred for this table.",
      time
        ? `Time role ${time.role} is bound to ${time.sourceName}.`
        : "No time field was inferred; trend analysis is unavailable.",
    ],
  };
}
