import type {
  ColumnProfile,
  GrainDefinition,
} from "@/types/workbench";
import type {
  PeopleDataShape,
  PeopleTableType,
} from "@/types/semantics";
import { normalizeHeader } from "@/lib/data/canonical-schema";

export interface GrainKeyStatistics {
  rowCount: number;
  nonNullRowCount: number;
  distinctKeyCount: number;
}

export interface TableInferenceInput {
  columns: Array<
    Pick<
      ColumnProfile,
      "sourceName" | "canonicalField" | "confidence" | "inferredType"
    >
  >;
  keyStatistics?: GrainKeyStatistics;
}

export interface TableInference {
  inferredType: string;
  typeConfidence: number;
  grain: GrainDefinition;
  grainConfidence: number;
  evidence: string[];
  tableType: PeopleTableType;
  dataShape: PeopleDataShape;
  domains: string[];
  alternatives: Array<{
    tableType: PeopleTableType;
    score: number;
    reason: string;
  }>;
}

interface InferenceRule {
  code: string;
  inferredType: string;
  grainLabel: string;
  keyFields: string[];
  requiredFields: string[];
  anyFields?: string[];
  sourcePatterns?: RegExp[];
  tableType: PeopleTableType;
  dataShape: PeopleDataShape;
  domains: string[];
  baseTypeConfidence: number;
  baseGrainConfidence: number;
}

const RULES: InferenceRule[] = [
  {
    code: "COMPENSATION_HISTORY",
    inferredType: "Compensation History",
    grainLabel: "Employee × Compensation Effective Date",
    keyFields: ["employee_id", "compensation_effective_date"],
    requiredFields: ["employee_id", "compensation_effective_date"],
    anyFields: [
      "compensation_amount",
      "annual_base_salary",
      "compa_ratio",
      "salary_midpoint",
    ],
    tableType: "compensation",
    dataShape: "row-level",
    domains: ["compensation"],
    baseTypeConfidence: 96,
    baseGrainConfidence: 93,
  },
  {
    code: "COMPENSATION_SNAPSHOT",
    inferredType: "Compensation Snapshot",
    grainLabel: "Employee × Compensation Snapshot",
    keyFields: ["employee_id", "compensation_snapshot_date"],
    requiredFields: ["employee_id", "compensation_snapshot_date"],
    anyFields: [
      "compensation_amount",
      "annual_base_salary",
      "compa_ratio",
      "salary_midpoint",
    ],
    tableType: "compensation",
    dataShape: "row-level",
    domains: ["compensation"],
    baseTypeConfidence: 95,
    baseGrainConfidence: 92,
  },
  {
    code: "COMPENSATION_MONTHLY_SNAPSHOT",
    inferredType: "Compensation Snapshot",
    grainLabel: "Employee × Snapshot Month",
    keyFields: ["employee_id", "snapshot_month"],
    requiredFields: ["employee_id", "snapshot_month"],
    anyFields: [
      "compensation_amount",
      "annual_base_salary",
      "compa_ratio",
      "salary_midpoint",
    ],
    tableType: "compensation",
    dataShape: "row-level",
    domains: ["compensation"],
    baseTypeConfidence: 94,
    baseGrainConfidence: 92,
  },
  {
    code: "EMPLOYEE_MONTHLY_SNAPSHOT",
    inferredType: "Employee Monthly Snapshot",
    grainLabel: "Employee × Snapshot Month",
    keyFields: ["employee_id", "snapshot_month"],
    requiredFields: ["employee_id", "snapshot_month"],
    tableType: "employee_snapshot",
    dataShape: "row-level",
    domains: ["workforce", "retention", "diversity"],
    baseTypeConfidence: 96,
    baseGrainConfidence: 94,
  },
  {
    code: "TERMINATION_EVENT",
    inferredType: "Termination Event",
    grainLabel: "Employee × Termination Date",
    keyFields: ["employee_id", "term_date"],
    requiredFields: ["employee_id", "term_date"],
    tableType: "termination_event",
    dataShape: "row-level",
    domains: ["retention"],
    baseTypeConfidence: 95,
    baseGrainConfidence: 92,
  },
  {
    code: "EMPLOYEE_OUTCOME",
    inferredType: "Employee Outcome",
    grainLabel: "Employee",
    keyFields: ["employee_id"],
    requiredFields: ["employee_id", "attrition"],
    tableType: "employee_outcome",
    dataShape: "row-level",
    domains: ["retention", "workforce"],
    baseTypeConfidence: 94,
    baseGrainConfidence: 88,
  },
  {
    code: "APPLICATION_EVENT",
    inferredType: "Candidate Application",
    grainLabel: "Application",
    keyFields: ["application_id"],
    requiredFields: ["application_id"],
    anyFields: [
      "candidate_id",
      "application_date",
      "reviewed",
      "interviewed",
      "offer_extended",
      "hired",
    ],
    tableType: "candidate_application",
    dataShape: "row-level",
    domains: ["recruiting"],
    baseTypeConfidence: 93,
    baseGrainConfidence: 91,
  },
  {
    code: "REQUISITION",
    inferredType: "Requisition",
    grainLabel: "Requisition",
    keyFields: ["requisition_id"],
    requiredFields: ["requisition_id"],
    anyFields: [
      "requisition_open_date",
      "requisition_status",
      "target_hires",
      "staffing_days",
    ],
    tableType: "requisition",
    dataShape: "row-level",
    domains: ["recruiting", "mobility"],
    baseTypeConfidence: 92,
    baseGrainConfidence: 90,
  },
  {
    code: "RECRUITING_AGGREGATE",
    inferredType: "Recruiting Aggregate",
    grainLabel: "Reporting Period × Recruiting Category",
    keyFields: ["report_period", "department"],
    requiredFields: [],
    anyFields: [
      "applications_count",
      "advertisements_count",
      "staffing_days",
      "record_count",
    ],
    sourcePatterns: [
      /staff/i,
      /advert/i,
      /application/i,
      /recruit/i,
      /appl_?su[bm]+itted/i,
      /days_cat/i,
    ],
    tableType: "aggregate_people_fact",
    dataShape: "aggregate",
    domains: ["recruiting"],
    baseTypeConfidence: 87,
    baseGrainConfidence: 72,
  },
  {
    code: "PAY_GAP_AGGREGATE",
    inferredType: "Pay Gap Aggregate",
    grainLabel: "Reporting Entity × Period",
    keyFields: ["report_period", "department"],
    requiredFields: [],
    anyFields: ["pay_gap_mean_pct", "pay_gap_median_pct"],
    sourcePatterns: [/pay.*gap/i, /hourly.*percent/i, /quartile/i],
    tableType: "aggregate_people_fact",
    dataShape: "aggregate",
    domains: ["compensation", "diversity"],
    baseTypeConfidence: 94,
    baseGrainConfidence: 75,
  },
  {
    code: "PERFORMANCE_REVIEW",
    inferredType: "Performance Review",
    grainLabel: "Employee × Review",
    keyFields: ["employee_id", "appraisal_id"],
    requiredFields: ["employee_id"],
    anyFields: [
      "performance_rating",
      "overall_performance",
      "appraisal_status",
      "talent_review_status",
      "placement_code",
    ],
    sourcePatterns: [/performance/i, /appraisal/i, /rating/i, /nine.*box/i],
    tableType: "performance_review",
    dataShape: "row-level",
    domains: ["performance"],
    baseTypeConfidence: 93,
    baseGrainConfidence: 84,
  },
  {
    code: "ABSENCE",
    inferredType: "Absence Record",
    grainLabel: "Employee or Population × Absence Period",
    keyFields: ["employee_id", "absence_date", "report_period"],
    requiredFields: [],
    anyFields: ["absence_rate", "absence_hours", "absence_date"],
    sourcePatterns: [/absen/i, /sickness/i, /lost.*hour/i],
    tableType: "absence",
    dataShape: "aggregate",
    domains: ["absence"],
    baseTypeConfidence: 92,
    baseGrainConfidence: 76,
  },
  {
    code: "ENGAGEMENT_SURVEY",
    inferredType: "Engagement Survey",
    grainLabel: "Respondent or Population × Survey Wave",
    keyFields: ["employee_id", "survey_wave", "report_period"],
    requiredFields: [],
    anyFields: ["engagement_score", "survey_wave"],
    sourcePatterns: [/^q_?\d+$/i, /engagement/i, /favourable|favorable/i],
    tableType: "engagement_survey",
    dataShape: "row-level",
    domains: ["engagement"],
    baseTypeConfidence: 91,
    baseGrainConfidence: 78,
  },
  {
    code: "LEARNING_RECORD",
    inferredType: "Learning Record",
    grainLabel: "Learner × Learning Activity",
    keyFields: ["employee_id", "course_id", "learning_completed_at"],
    requiredFields: [],
    anyFields: [
      "course_id",
      "course_name",
      "learning_status",
      "learning_score",
      "pass_flag",
    ],
    sourcePatterns: [/training/i, /learning/i, /course/i, /completion/i],
    tableType: "learning_record",
    dataShape: "row-level",
    domains: ["learning"],
    baseTypeConfidence: 92,
    baseGrainConfidence: 82,
  },
  {
    code: "MOBILITY",
    inferredType: "Internal Mobility",
    grainLabel: "Employee or Population × Movement",
    keyFields: ["employee_id", "job_change_date", "report_period"],
    requiredFields: [],
    anyFields: [
      "move_type",
      "movement_count",
      "job_change_date",
      "record_count",
    ],
    sourcePatterns: [
      /mobility/i,
      /movement/i,
      /promotion/i,
      /appointment/i,
      /^mob_type/i,
    ],
    tableType: "mobility",
    dataShape: "aggregate",
    domains: ["mobility"],
    baseTypeConfidence: 91,
    baseGrainConfidence: 77,
  },
  {
    code: "DEMOGRAPHICS",
    inferredType: "Workforce Demographics",
    grainLabel: "Population × Demographic Category × Period",
    keyFields: ["report_period", "demographic_category", "gender", "ethnicity"],
    requiredFields: [],
    anyFields: [
      "demographic_category",
      "gender",
      "ethnicity",
      "record_count",
    ],
    sourcePatterns: [
      /employment.*equity/i,
      /designated.*group/i,
      /demographic/i,
      /^ee_/i,
    ],
    tableType: "demographics",
    dataShape: "aggregate",
    domains: ["diversity", "workforce"],
    baseTypeConfidence: 90,
    baseGrainConfidence: 74,
  },
  {
    code: "EMPLOYEE_ROSTER",
    inferredType: "Employee Roster",
    grainLabel: "Employee",
    keyFields: ["employee_id"],
    requiredFields: ["employee_id"],
    tableType: "employee_roster",
    dataShape: "row-level",
    domains: ["workforce", "diversity"],
    baseTypeConfidence: 82,
    baseGrainConfidence: 86,
  },
];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function keyEvidence(
  statistics: GrainKeyStatistics | undefined,
): { evidence: string[]; confidenceAdjustment: number } {
  if (!statistics || statistics.rowCount === 0) {
    return {
      evidence: ["Key uniqueness has not yet been measured."],
      confidenceAdjustment: -5,
    };
  }

  const coverage = statistics.nonNullRowCount / statistics.rowCount;
  const uniqueness =
    statistics.distinctKeyCount / Math.max(statistics.nonNullRowCount, 1);
  const evidence = [
    `Proposed keys are ${(coverage * 100).toFixed(1)}% populated.`,
    `Proposed keys are ${(uniqueness * 100).toFixed(1)}% unique across populated rows.`,
  ];
  const confidenceAdjustment =
    (coverage - 0.95) * 20 + (uniqueness - 0.95) * 35;

  return { evidence, confidenceAdjustment };
}

export function inferTableGrain(
  input: TableInferenceInput,
): TableInference {
  const canonicalSources = new Map<string, TableInferenceInput["columns"][number]>();
  for (const column of input.columns) {
    if (column.canonicalField && !canonicalSources.has(column.canonicalField)) {
      canonicalSources.set(column.canonicalField, column);
    }
  }

  const normalizedSources = input.columns.map((column) => ({
    column,
    normalized: normalizeHeader(column.sourceName),
  }));
  const scoredRules = RULES.flatMap((candidate) => {
    const requiredMatch = candidate.requiredFields.every((field) =>
      canonicalSources.has(field),
    );
    if (!requiredMatch) return [];
    const matchedAny = (candidate.anyFields ?? []).filter((field) =>
      canonicalSources.has(field),
    );
    const matchedPatterns = (candidate.sourcePatterns ?? []).filter((pattern) =>
      normalizedSources.some(({ normalized }) => pattern.test(normalized)),
    );
    const onlyGenericCount =
      matchedAny.length > 0 &&
      matchedAny.every((field) => field === "record_count");
    if (
      (candidate.anyFields?.length || candidate.sourcePatterns?.length) &&
      (matchedAny.length + matchedPatterns.length === 0 ||
        (onlyGenericCount && matchedPatterns.length === 0))
    ) {
      return [];
    }
    const score = clampScore(
      candidate.baseTypeConfidence +
        Math.min(5, matchedAny.length) * 1.2 +
        Math.min(4, matchedPatterns.length) * 0.8,
    );
    return [
      {
        rule: candidate,
        score,
        reason: [
          candidate.requiredFields.length
            ? `required ${candidate.requiredFields.join(", ")}`
            : "no fixed identifier required",
          matchedAny.length ? `roles ${matchedAny.join(", ")}` : "",
          matchedPatterns.length
            ? `${matchedPatterns.length} header pattern${matchedPatterns.length === 1 ? "" : "s"}`
            : "",
        ]
          .filter(Boolean)
          .join("; "),
      },
    ];
  });
  scoredRules.sort(
    (left, right) =>
      right.score - left.score ||
      right.rule.requiredFields.length - left.rule.requiredFields.length,
  );
  const selected = scoredRules[0];
  const rule = selected?.rule;

  if (!rule) {
    const evidence = [
      "No deterministic people-data grain rule matched the canonical fields.",
    ];
    return {
      inferredType: "People Dataset",
      typeConfidence: 25,
      grain: {
        label: "Unknown — review required",
        keys: [],
        evidence,
      },
      grainConfidence: 20,
      evidence,
      tableType: "unknown",
      dataShape: "aggregate",
      domains: [],
      alternatives: [],
    };
  }

  const matchedFields = [
    ...rule.requiredFields,
    ...(rule.anyFields ?? []).filter((field) => canonicalSources.has(field)),
  ];
  const matchedColumns = matchedFields
    .map((field) => canonicalSources.get(field))
    .filter(
      (
        column,
      ): column is TableInferenceInput["columns"][number] => Boolean(column),
    );
  const mappingConfidence =
    matchedColumns.length > 0
      ? matchedColumns.reduce(
          (total, column) => total + (column.confidence ?? 75),
          0,
        ) / matchedColumns.length
      : 75;
  const keys = rule.keyFields
    .map((field) => canonicalSources.get(field)?.sourceName)
    .filter((field): field is string => Boolean(field));
  const measured = keyEvidence(input.keyStatistics);
  const evidence = [
    `Rule ${rule.code} matched canonical fields: ${rule.requiredFields.join(", ")}.`,
    `Scored ${selected.score}% against all supported table contracts (${selected.reason}).`,
    `Canonical mapping confidence averages ${mappingConfidence.toFixed(1)}%.`,
    ...measured.evidence,
  ];

  return {
    inferredType: rule.inferredType,
    typeConfidence: clampScore(selected.score + (mappingConfidence - 90) * 0.2),
    grain: {
      label: rule.grainLabel,
      keys,
      evidence,
    },
    grainConfidence: clampScore(
      rule.baseGrainConfidence + measured.confidenceAdjustment,
    ),
    evidence,
    tableType: rule.tableType,
    dataShape:
      rule.dataShape === "aggregate" && canonicalSources.has("employee_id")
        ? "row-level"
        : rule.dataShape,
    domains: [...rule.domains],
    alternatives: scoredRules.slice(0, 4).map((candidate) => ({
      tableType: candidate.rule.tableType,
      score: candidate.score / 100,
      reason: candidate.reason,
    })),
  };
}
