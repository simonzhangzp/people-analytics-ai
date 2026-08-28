import { VOLUNTARY_ATTRITION_METRIC } from "@/lib/metrics";
import type {
  AIIntervention,
  AnalysisPlan,
  AnalysisQuestion,
  ExecutiveStory,
  Insight,
  MetricAmbiguity,
  MetricDefinition,
  MetricPatch,
} from "@/types/workbench";

export function createVoluntaryAttritionMetric(): MetricDefinition {
  return JSON.parse(JSON.stringify(VOLUNTARY_ATTRITION_METRIC)) as MetricDefinition;
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

export function createDemoAnalysisPlan(
  question: AnalysisQuestion,
  metricId: string,
): AnalysisPlan {
  return {
    id: `plan-${question.id}`,
    questionId: question.id,
    summary:
      "Validate the change first, then test which workforce cohorts account for it and whether compensation positioning is associated. Do not infer causation.",
    createdAt: new Date().toISOString(),
    steps: [
      {
        id: "step-trend",
        objective: "Validate the Engineering voluntary attrition increase",
        operation: "validate_trend",
        metricId,
        dimensions: ["period"],
        status: "planned",
      },
      {
        id: "step-tenure",
        objective: "Measure which tenure cohorts contribute to the increase",
        operation: "contribution",
        metricId,
        dimensions: ["tenure_band"],
        status: "planned",
      },
      {
        id: "step-level",
        objective: "Check whether the change is concentrated at specific levels",
        operation: "segment",
        metricId,
        dimensions: ["seniority_level"],
        status: "planned",
      },
      {
        id: "step-compensation",
        objective: "Compare compensation positioning with observed exit incidence",
        operation: "association",
        metricId,
        dimensions: ["compa_ratio"],
        status: "planned",
      },
      {
        id: "step-manager",
        objective: "Test manager effectiveness as an alternative explanation",
        operation: "data_gap",
        dimensions: ["manager_effectiveness"],
        status: "blocked",
        blockedReason:
          "Manager effectiveness data is absent, so this hypothesis cannot be tested.",
      },
    ],
  };
}

const sourceIds = [
  "demo-headcount",
  "demo-terminations",
  "demo-compensation",
];

export function createDemoInsight(
  branch: Insight["branchKey"],
  questionId: string,
  metricId: string,
): Insight {
  if (branch === "tenure") {
    return {
      id: "insight-demo-tenure",
      questionId,
      branchKey: "tenure",
      headline: "Employees with 2–4 years tenure account for 68% of the increase",
      finding:
        "The cohort contributed 61 of 90 incremental voluntary exits, making it the first segment to investigate rather than assuming a workforce-wide shift.",
      metricIds: [metricId],
      filters: { department: "Engineering" },
      period: "Jan–Jun 2026",
      comparisonPeriod: "Jul–Dec 2025",
      population: "Engineering employees active at the beginning of each six-month period",
      evidence: [
        {
          id: "tenure-increment",
          label: "Incremental exits",
          value: "61 of 90",
          detail: "2–4 year cohort",
          sourceDatasetIds: sourceIds.slice(0, 2),
        },
        {
          id: "tenure-share",
          label: "Share of increase",
          value: "68%",
          detail: "67.8%, rounded",
          sourceDatasetIds: sourceIds.slice(0, 2),
        },
        {
          id: "tenure-current",
          label: "Current exits",
          value: "120",
          detail: "vs 59 in comparison",
          sourceDatasetIds: sourceIds.slice(0, 2),
        },
      ],
      chartSpec: {
        kind: "bar",
        title: "Contribution to incremental voluntary exits",
        unit: "people",
        data: [
          { label: "2–4 years", value: 61 },
          { label: "Other tenure", value: 29 },
        ],
      },
      confidence: "High",
      limitations: [
        "Cohort concentration does not establish why employees left.",
        "Tenure bands are based on the beginning-of-period snapshot.",
      ],
      suggestedFollowUps: [
        { key: "level", label: "Break down by level", available: true },
        {
          key: "compensation",
          label: "Compare compensation",
          available: true,
        },
      ],
      selectedForExecutiveStory: false,
      validated: true,
    };
  }

  if (branch === "level") {
    return {
      id: "insight-demo-level",
      questionId,
      branchKey: "level",
      headline: "The increase is concentrated among Engineering levels 5–6",
      finding:
        "L5–L6 represents the largest increase in voluntary exits and overlaps materially with the 2–4 year tenure cohort.",
      metricIds: [metricId],
      filters: { department: "Engineering" },
      period: "Jan–Jun 2026",
      comparisonPeriod: "Jul–Dec 2025",
      population: "Engineering voluntary exits",
      evidence: [
        {
          id: "level-current",
          label: "Current L5–L6 exits",
          value: "219",
          sourceDatasetIds: ["demo-terminations"],
        },
        {
          id: "level-previous",
          label: "Comparison exits",
          value: "111",
          sourceDatasetIds: ["demo-terminations"],
        },
      ],
      chartSpec: {
        kind: "bar",
        title: "Voluntary exits by level",
        unit: "people",
        data: [
          { label: "L5–L6", value: 219 },
          { label: "L4", value: 28 },
          { label: "L7+", value: 27 },
        ],
      },
      confidence: "High",
      limitations: ["Level concentration is descriptive, not a causal explanation."],
      suggestedFollowUps: [
        {
          key: "compensation",
          label: "Compare compensation",
          available: true,
        },
      ],
      selectedForExecutiveStory: false,
      validated: true,
    };
  }

  if (branch === "compensation") {
    return {
      id: "insight-demo-compensation",
      questionId,
      branchKey: "compensation",
      headline: "Lower compensation positioning is associated with higher exit incidence",
      finding:
        "Within the 2–4 year Engineering cohort, employees below 0.95 compa ratio show materially higher observed voluntary exit incidence than peers at or above 0.95.",
      metricIds: [metricId],
      filters: {
        department: "Engineering",
        tenure_band: "2–4 years",
      },
      period: "Jan–Jun 2026",
      population: "Engineering employees with 2–4 years tenure and a current compensation record",
      evidence: [
        {
          id: "comp-below",
          label: "Below 0.95 midpoint",
          value: "33.8%",
          detail: "Observed exit incidence",
          sourceDatasetIds: sourceIds,
        },
        {
          id: "comp-at-above",
          label: "At / above 0.95",
          value: "10.4%",
          detail: "Observed exit incidence",
          sourceDatasetIds: sourceIds,
        },
        {
          id: "comp-gap",
          label: "Observed gap",
          value: "+23.4pp",
          sourceDatasetIds: sourceIds,
        },
      ],
      chartSpec: {
        kind: "bar",
        title: "Observed exit incidence by compensation positioning",
        unit: "percent",
        data: [
          { label: "Below 0.95", value: 33.8 },
          { label: "0.95 or above", value: 10.4 },
        ],
      },
      confidence: "Medium",
      limitations: [
        "This is an observed association, not evidence that compensation caused exits.",
        "Performance, promotion opportunity, and manager effectiveness were not controlled.",
      ],
      suggestedFollowUps: [
        {
          key: "organization",
          label: "Test manager effectiveness",
          available: false,
          unavailableReason:
            "Manager effectiveness data is absent, so this hypothesis cannot be tested.",
        },
      ],
      selectedForExecutiveStory: false,
      validated: true,
    };
  }

  return {
    id: "insight-demo-trend",
    questionId,
    branchKey: "trend",
    headline: "Engineering voluntary attrition increased 4.5 percentage points",
    finding:
      "After treating retirement separately and using beginning headcount, the six-month rate rose from 9.2% to 13.7%.",
    metricIds: [metricId],
    filters: { department: "Engineering" },
    period: "Jan–Jun 2026",
    comparisonPeriod: "Jul–Dec 2025",
    population: "Engineering employees active at the beginning of each six-month period",
    evidence: [
      {
        id: "trend-current",
        label: "Current rate",
        value: "13.7%",
        detail: "274 voluntary exits / 2,000 beginning HC",
        sourceDatasetIds: sourceIds.slice(0, 2),
      },
      {
        id: "trend-previous",
        label: "Comparison rate",
        value: "9.2%",
        detail: "184 voluntary exits / 2,000 beginning HC",
        sourceDatasetIds: sourceIds.slice(0, 2),
      },
      {
        id: "trend-change",
        label: "Validated change",
        value: "+4.5pp",
        detail: "90 additional voluntary exits",
        sourceDatasetIds: sourceIds.slice(0, 2),
      },
    ],
    chartSpec: {
      kind: "line",
      title: "Engineering voluntary attrition rate",
      unit: "percent",
      data: [
        { label: "Jul–Dec 2025", value: 9.2 },
        { label: "Jan–Jun 2026", value: 13.7 },
      ],
    },
    confidence: "High",
    limitations: [
      "The comparison is descriptive and does not establish a causal driver.",
      "Manager effectiveness data is absent.",
    ],
    suggestedFollowUps: [
      { key: "tenure", label: "Break down by tenure", available: true },
      { key: "level", label: "Break down by level", available: true },
    ],
    selectedForExecutiveStory: false,
    validated: true,
  };
}

export function createInitialInterventions(isDemo: boolean): AIIntervention[] {
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

export function buildFallbackExecutiveStory(
  workspaceId: string,
  insights: Insight[],
  audience: ExecutiveStory["audience"],
  purpose: ExecutiveStory["purpose"],
  slideCount: 3 | 5,
): ExecutiveStory {
  const selected = insights.filter(
    (insight) => insight.validated && insight.selectedForExecutiveStory,
  );
  if (selected.length === 0) {
    throw new Error("Select at least one validated finding.");
  }
  const trend = selected.find((item) => item.branchKey === "trend") ?? selected[0];
  const tenure =
    selected.find((item) => item.branchKey === "tenure") ?? selected.at(1) ?? trend;
  const compensation =
    selected.find((item) => item.branchKey === "compensation") ??
    selected.at(2) ??
    tenure;
  const insightSlide = (
    id: string,
    index: number,
    kicker: string,
    insight: Insight,
  ) => ({
    id,
    index,
    kicker,
    headline: insight.headline,
    insightIds: [insight.id],
    chartSpec: insight.chartSpec,
    evidence: insight.evidence
      .slice(0, 3)
      .map((item) => `${item.label}: ${item.value}`),
    sourceNote: `Approved metric v2 · ${insight.population}${
      insight.period ? ` · ${insight.period}` : ""
    }`,
    limitation: insight.limitations[0],
  });
  const fiveSlides = [
    {
      id: "story-context",
      index: 1,
      kicker: `${audience} · ${purpose}`,
      headline:
        "Engineering attrition requires a targeted retention response—not a workforce-wide intervention",
      insightIds: selected.map((item) => item.id),
      evidence: [
        "Voluntary attrition increased 4.5 percentage points",
        "68% of the increase is in 2–4 year tenure",
        "Lower compensation positioning is associated with higher exits",
      ],
      sourceNote: "Validated Workbench findings only",
      limitation: "The analysis is descriptive and does not establish causation.",
    },
    insightSlide("story-trend", 2, "Validate the change", trend),
    insightSlide("story-tenure", 3, "Locate the concentration", tenure),
    insightSlide(
      "story-compensation",
      4,
      "Test an observed association",
      compensation,
    ),
    {
      id: "story-action",
      index: 5,
      kicker: "Recommended next action",
      headline:
        "Review L5–L6 pay positioning and career movement for the 2–4 year cohort",
      insightIds: selected.map((item) => item.id),
      evidence: [
        "Prioritize the identified cohort",
        "Validate with exit themes and promotion history",
        "Add manager effectiveness before making a causal claim",
      ],
      sourceNote: "Recommendation based on validated findings; owner and timing require leadership approval",
      limitation:
        "Manager effectiveness, promotion opportunity, and employee sentiment are missing.",
    },
  ];
  const threeSlides = [
    {
      ...fiveSlides[0],
      index: 1,
    },
    insightSlide("story-evidence", 2, "Evidence", tenure),
    {
      ...fiveSlides[4],
      index: 3,
    },
  ];
  return {
    id: `story-${workspaceId}-${Date.now()}`,
    workspaceId,
    audience,
    purpose,
    slideCount,
    slides: slideCount === 5 ? fiveSlides : threeSlides,
    status: "Approved",
    createdAt: new Date().toISOString(),
  };
}

