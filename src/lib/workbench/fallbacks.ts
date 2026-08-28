import { VOLUNTARY_ATTRITION_METRIC } from "@/lib/metrics";
import type {
  AIIntervention,
  MetricAmbiguity,
  MetricDefinition,
  MetricPatch,
} from "@/types/workbench";

export function createVoluntaryAttritionMetric(): MetricDefinition {
  return JSON.parse(
    JSON.stringify(VOLUNTARY_ATTRITION_METRIC),
  ) as MetricDefinition;
}

export function createRetirementAmbiguity(metricId: string): MetricAmbiguity {
  return {
    id: "ambiguity-retirement",
    metricId,
    question: "Should retirement count as voluntary attrition?",
    whyItMatters:
      "Retirement is employee-initiated, but combining it with preventable resignation changes the rate and the action leaders may take.",
    options: [
      {
        id: "separate-retirement",
        label: "Treat retirement separately",
        value: "separate",
      },
      {
        id: "include-retirement",
        label: "Include retirement as voluntary",
        value: "include",
      },
    ],
    status: "Open",
  };
}

export function createRetirementMetricPatch(
  metric: MetricDefinition,
  instruction = "Treat retirement separately and use beginning headcount.",
): MetricPatch {
  const voluntaryOnly = [
    {
      field: "termination_type",
      operator: "in" as const,
      value: ["Voluntary", "Resignation"],
      label: "Approved voluntary separation types; retirement is not voluntary",
    },
  ];
  const denominator = {
    kind: "count" as const,
    entity: "employee" as const,
    distinctField: "employee_id",
    rules: [
      {
        field: "active_at_period_start",
        operator: "equals" as const,
        value: true,
        label: "Active at beginning of period",
      },
    ],
  };
  const nextDefinition: MetricDefinition = {
    ...metric,
    numerator: {
      kind: "count",
      entity: "exit",
      distinctField: "employee_id",
      rules: voluntaryOnly,
    },
    denominator,
    formula: {
      kind: "ratio",
      numerator: {
        kind: "count",
        entity: "exit",
        distinctField: "employee_id",
        rules: voluntaryOnly,
      },
      denominator,
      multiplier: 100,
    },
    inclusions: voluntaryOnly,
    exclusions: [
      {
        field: "termination_type",
        operator: "equals",
        value: "Retirement",
        label: "Retirement is excluded from voluntary attrition by approved policy",
      },
    ],
    timeBasis: "Beginning headcount",
    description:
      "Voluntary resignations during the period divided by active headcount at the beginning of the period. Retirement is reported separately.",
    status: "Needs Review",
    confidence: "High",
    version: metric.version,
    approvedAt: undefined,
  };
  return {
    metricId: metric.id,
    summary: instruction,
    items: [
      {
        field: "inclusions",
        label: "Exit classification",
        before: "Voluntary resignation or retirement",
        after: "Voluntary resignation only; retirement reported separately",
      },
      {
        field: "timeBasis",
        label: "Denominator time basis",
        before: metric.timeBasis ?? "Average headcount",
        after: "Active headcount at the beginning of each period",
      },
    ],
    nextDefinition,
    status: "Ready to apply",
  };
}

export function createInitialInterventions(
  isDemo: boolean,
): AIIntervention[] {
  return [
    {
      id: "ai-privacy-boundary",
      kind: "Recommendation",
      title: "I will work from safe metadata",
      body:
        "Column names, types, cardinality, date ranges, definitions, and aggregates are sufficient for co-design. Employee-level rows remain local.",
      createdAt: new Date().toISOString(),
    },
    ...(isDemo
      ? [
          {
            id: "ai-demo-context",
            kind: "Proposal" as const,
            title: "Start by validating the attrition change",
            body:
              "The demo contains related headcount, termination, and compensation files. First confirm the voluntary attrition definition; then calculate the trend.",
            createdAt: new Date().toISOString(),
          },
        ]
      : []),
  ];
}
