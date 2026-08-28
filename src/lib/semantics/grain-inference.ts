import type {
  ColumnProfile,
  GrainDefinition,
} from "@/types/workbench";

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
}

interface InferenceRule {
  code: string;
  inferredType: string;
  grainLabel: string;
  keyFields: string[];
  requiredFields: string[];
  baseTypeConfidence: number;
  baseGrainConfidence: number;
}

const RULES: InferenceRule[] = [
  {
    code: "COMPENSATION_HISTORY",
    inferredType: "Compensation History",
    grainLabel: "Employee × Compensation Effective Date",
    keyFields: ["employee_id", "compensation_effective_date"],
    requiredFields: [
      "employee_id",
      "compensation_amount",
      "compensation_effective_date",
    ],
    baseTypeConfidence: 96,
    baseGrainConfidence: 93,
  },
  {
    code: "COMPENSATION_SNAPSHOT",
    inferredType: "Compensation Snapshot",
    grainLabel: "Employee × Compensation Snapshot",
    keyFields: ["employee_id", "compensation_snapshot_date"],
    requiredFields: [
      "employee_id",
      "compensation_amount",
      "compensation_snapshot_date",
    ],
    baseTypeConfidence: 95,
    baseGrainConfidence: 92,
  },
  {
    code: "COMPENSATION_MONTHLY_SNAPSHOT",
    inferredType: "Compensation Snapshot",
    grainLabel: "Employee × Snapshot Month",
    keyFields: ["employee_id", "snapshot_month"],
    requiredFields: [
      "employee_id",
      "compensation_amount",
      "snapshot_month",
    ],
    baseTypeConfidence: 94,
    baseGrainConfidence: 92,
  },
  {
    code: "EMPLOYEE_MONTHLY_SNAPSHOT",
    inferredType: "Employee Monthly Snapshot",
    grainLabel: "Employee × Snapshot Month",
    keyFields: ["employee_id", "snapshot_month"],
    requiredFields: ["employee_id", "snapshot_month"],
    baseTypeConfidence: 96,
    baseGrainConfidence: 94,
  },
  {
    code: "TERMINATION_EVENT",
    inferredType: "Termination Event",
    grainLabel: "Employee × Termination Date",
    keyFields: ["employee_id", "term_date"],
    requiredFields: ["employee_id", "term_date"],
    baseTypeConfidence: 95,
    baseGrainConfidence: 92,
  },
  {
    code: "EMPLOYEE_ROSTER",
    inferredType: "Employee Roster",
    grainLabel: "Employee",
    keyFields: ["employee_id"],
    requiredFields: ["employee_id"],
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

  const rule = RULES.find((candidate) =>
    candidate.requiredFields.every((field) => canonicalSources.has(field)),
  );

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
    };
  }

  const matchedColumns = rule.requiredFields.map(
    (field) => canonicalSources.get(field)!,
  );
  const mappingConfidence =
    matchedColumns.reduce(
      (total, column) => total + (column.confidence ?? 75),
      0,
    ) / matchedColumns.length;
  const keys = rule.keyFields
    .map((field) => canonicalSources.get(field)?.sourceName)
    .filter((field): field is string => Boolean(field));
  const measured = keyEvidence(input.keyStatistics);
  const evidence = [
    `Rule ${rule.code} matched canonical fields: ${rule.requiredFields.join(", ")}.`,
    `Canonical mapping confidence averages ${mappingConfidence.toFixed(1)}%.`,
    ...measured.evidence,
  ];

  return {
    inferredType: rule.inferredType,
    typeConfidence: clampScore(
      rule.baseTypeConfidence + (mappingConfidence - 90) * 0.2,
    ),
    grain: {
      label: rule.grainLabel,
      keys,
      evidence,
    },
    grainConfidence: clampScore(
      rule.baseGrainConfidence + measured.confidenceAdjustment,
    ),
    evidence,
  };
}
