import type {
  AnalysisPlan,
  AnalysisQuestion,
  AnalysisStep,
} from "@/types/workbench";

export interface AttritionPlanOptions {
  id?: string;
  createdAt?: string | Date;
  metricId?: string;
  availableFields?: readonly string[];
}

function iso(value: string | Date | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function hasField(fields: readonly string[], ...candidates: string[]): boolean {
  const normalized = new Set(fields.map((field) => field.trim().toLowerCase()));
  return candidates.some((candidate) => normalized.has(candidate.toLowerCase()));
}

/**
 * Produces the fixed diagnostic path used by the attrition workbench. The
 * manager branch is blocked unless manager evidence is explicitly available.
 */
export function createAttritionAnalysisPlan(
  question: AnalysisQuestion,
  options: AttritionPlanOptions = {},
): AnalysisPlan {
  const metricId =
    options.metricId ??
    question.metricIds[0] ??
    "metric-unresolved";
  const availableFields = options.availableFields ?? [];
  const managerAvailable = hasField(
    availableFields,
    "manager_id",
    "managerId",
  );

  const coreSteps: AnalysisStep[] = [
    {
      id: "attrition-trend",
      objective:
        "Validate the voluntary attrition trend and compare the two approved periods.",
      operation: "validate_trend",
      metricId,
      dimensions: ["period"],
      status: "planned",
    },
    {
      id: "attrition-tenure-contribution",
      objective:
        "Decompose the percentage-point change by tenure band.",
      operation: "contribution",
      metricId,
      dimensions: ["tenure_band"],
      status: "planned",
    },
    {
      id: "attrition-level-contribution",
      objective:
        "Decompose the percentage-point change by employee level.",
      operation: "contribution",
      metricId,
      dimensions: ["level"],
      status: "planned",
    },
    {
      id: "attrition-compensation-association",
      objective:
        "Measure the observed association between compensation positioning and exit rate.",
      operation: "association",
      metricId,
      dimensions: ["compensation_positioning"],
      status: "planned",
    },
  ];

  const managerStep: AnalysisStep = managerAvailable
    ? {
        id: "attrition-manager-segment",
        objective:
          "Compare manager-group exit rates while preserving minimum group-size controls.",
        operation: "segment",
        metricId,
        dimensions: ["manager_id"],
        status: "planned",
      }
    : {
        id: "attrition-manager-data-gap",
        objective:
          "Document the missing manager hierarchy needed for manager-level diagnosis.",
        operation: "data_gap",
        metricId,
        dimensions: ["manager_id"],
        status: "blocked",
        blockedReason:
          "Manager analysis is blocked because manager_id is not available in the approved evidence.",
      };

  return {
    id: options.id ?? `${question.id}-attrition-plan`,
    questionId: question.id,
    summary:
      "Validate trend, decompose tenure and level contributions, test compensation association, then surface the manager evidence gap.",
    steps: [...coreSteps, managerStep],
    createdAt: iso(options.createdAt),
  };
}
