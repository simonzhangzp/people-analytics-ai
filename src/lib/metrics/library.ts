import type {
  MetricDefinition,
  MetricExpression,
  MetricRule,
} from "@/types/workbench";

const BASELINE_APPROVED_AT = "2026-01-01T00:00:00.000Z";

const rule = (
  field: string,
  operator: MetricRule["operator"],
  value: MetricRule["value"],
  label: string,
): MetricRule => ({ field, operator, value, label });

const count = (
  entity: Extract<MetricExpression, { kind: "count" }>["entity"],
  distinctField: string,
  rules: MetricRule[] = [],
): MetricExpression => ({
  kind: "count",
  entity,
  distinctField,
  rules,
});

const ratio = (
  numerator: MetricExpression,
  denominator: MetricExpression,
  multiplier = 100,
): MetricExpression => ({
  kind: "ratio",
  numerator,
  denominator,
  multiplier,
});

export const BEGINNING_HEADCOUNT_EXPRESSION: MetricExpression = count(
  "employee",
  "employee_id",
  [
    rule(
      "active_at_period_start",
      "equals",
      true,
      "Employee was active at the beginning of the measurement period",
    ),
  ],
);

export const AVERAGE_HEADCOUNT_EXPRESSION: MetricExpression = {
  kind: "average",
  field: "period_headcount",
  rules: [
    rule(
      "is_headcount_observation",
      "equals",
      true,
      "Approved headcount observations inside the measurement period",
    ),
  ],
};

const voluntaryExitRules: MetricRule[] = [
  rule("exit_event", "equals", true, "Separation occurred in the measurement period"),
  rule(
    "termination_type",
    "in",
    ["Voluntary", "Resignation"],
    "Approved voluntary separation types",
  ),
];

const retirementAmbiguityRule = rule(
  "termination_type",
  "equals",
  "Retirement",
  "Retirement is excluded from voluntary attrition until its classification is approved",
);

const voluntaryExits = count("exit", "employee_id", voluntaryExitRules);
const allExits = count("exit", "employee_id", [
  rule("exit_event", "equals", true, "Separation occurred in the measurement period"),
]);

export const VOLUNTARY_ATTRITION_METRIC: MetricDefinition = {
  id: "metric-voluntary-attrition",
  key: "voluntary_attrition",
  name: "Voluntary Attrition",
  domain: "retention",
  description:
    "Voluntary separations during the period divided by average headcount. Retirement remains an explicit unresolved classification.",
  numerator: voluntaryExits,
  denominator: AVERAGE_HEADCOUNT_EXPRESSION,
  formula: ratio(voluntaryExits, AVERAGE_HEADCOUNT_EXPRESSION),
  inclusions: voluntaryExitRules,
  exclusions: [retirementAmbiguityRule],
  startEvent: "period_start",
  endEvent: "period_end",
  timeBasis: "Average headcount across approved observations in the period",
  sourceFields: [
    "employee_id",
    "termination_date",
    "termination_type",
    "period_headcount",
  ],
  dimensions: [
    "department",
    "tenure_band",
    "level",
    "compensation_positioning",
  ],
  status: "Needs Review",
  confidence: "Medium",
  version: 1,
};

export const TOTAL_ATTRITION_METRIC: MetricDefinition = {
  id: "metric-total-attrition",
  key: "total_attrition",
  name: "Total Attrition",
  domain: "retention",
  description:
    "All separations during the period divided by average headcount, including retirement unless an approved local definition excludes it.",
  numerator: allExits,
  denominator: AVERAGE_HEADCOUNT_EXPRESSION,
  formula: ratio(allExits, AVERAGE_HEADCOUNT_EXPRESSION),
  inclusions: [
    rule("exit_event", "equals", true, "All separation events in the measurement period"),
  ],
  exclusions: [],
  startEvent: "period_start",
  endEvent: "period_end",
  timeBasis: "Average headcount across approved observations in the period",
  sourceFields: [
    "employee_id",
    "termination_date",
    "termination_type",
    "period_headcount",
  ],
  dimensions: ["department", "tenure_band", "level"],
  status: "Approved",
  confidence: "High",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

export const HEADCOUNT_METRIC: MetricDefinition = {
  id: "metric-headcount",
  key: "headcount",
  name: "Headcount",
  domain: "workforce",
  description:
    "Distinct observed employees at the selected as-of period, or a supplied aggregate employee count.",
  formula: count("employee", "employee_id"),
  inclusions: [],
  exclusions: [],
  timeBasis: "Point-in-time period-end snapshot",
  sourceFields: ["employee_id", "employee_count", "snapshot_month"],
  dimensions: ["department", "location", "level", "employment_type"],
  status: "Approved",
  confidence: "High",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

const retentionRateNumerator = count("employee", "employee_id", [
  rule("active_at_period_end", "equals", true, "Employee remained active at period end"),
]);

const retentionRate: MetricDefinition = {
  id: "metric-retention-rate",
  key: "retention_rate",
  name: "Retention Rate",
  domain: "retention",
  description:
    "Employees from the beginning population who remain active at period end divided by beginning headcount.",
  numerator: retentionRateNumerator,
  denominator: BEGINNING_HEADCOUNT_EXPRESSION,
  formula: ratio(retentionRateNumerator, BEGINNING_HEADCOUNT_EXPRESSION),
  inclusions: [],
  exclusions: [],
  startEvent: "period_start",
  endEvent: "period_end",
  timeBasis: "Beginning population followed through period end",
  sourceFields: ["employee_id", "active_at_period_start", "active_at_period_end"],
  dimensions: ["department", "tenure_band", "level"],
  status: "Approved",
  confidence: "High",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

const timeToFill: MetricDefinition = {
  id: "metric-time-to-fill",
  key: "time_to_fill",
  name: "Time to Fill",
  domain: "recruiting",
  description:
    "Median calendar days from requisition approval to accepted offer for filled requisitions.",
  formula: {
    kind: "duration",
    startField: "requisition_approved_at",
    endField: "offer_accepted_at",
    aggregation: "median",
  },
  inclusions: [
    rule("requisition_status", "equals", "Filled", "Filled requisitions only"),
  ],
  exclusions: [
    rule("requisition_status", "equals", "Cancelled", "Cancelled requisitions"),
  ],
  startEvent: "requisition_approved_at",
  endEvent: "offer_accepted_at",
  timeBasis: "Calendar days; cohort by accepted-offer date",
  sourceFields: [
    "requisition_id",
    "requisition_approved_at",
    "offer_accepted_at",
    "requisition_status",
  ],
  dimensions: ["department", "job_family", "level", "location"],
  status: "Approved",
  confidence: "High",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

const acceptedOffers = count("application", "candidate_id", [
  rule("offer_status", "equals", "Accepted", "Accepted offers"),
]);
const extendedOffers = count("application", "candidate_id", [
  rule("offer_extended", "equals", true, "Offers extended in the period"),
]);

const offerAcceptanceRate: MetricDefinition = {
  id: "metric-offer-acceptance-rate",
  key: "offer_acceptance_rate",
  name: "Offer Acceptance Rate",
  domain: "recruiting",
  description: "Accepted offers divided by offers extended in the same reporting cohort.",
  numerator: acceptedOffers,
  denominator: extendedOffers,
  formula: ratio(acceptedOffers, extendedOffers),
  inclusions: [],
  exclusions: [],
  timeBasis: "Cohort by offer-extended date",
  sourceFields: ["candidate_id", "offer_extended", "offer_status"],
  dimensions: ["department", "job_family", "level", "source"],
  status: "Approved",
  confidence: "High",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

const recruitingHires: MetricDefinition = {
  id: "metric-recruiting-hires",
  key: "recruiting_hires",
  name: "Recruiting Hires",
  domain: "recruiting",
  description: "Distinct candidates whose employment start date falls in the period.",
  formula: count("hire", "employee_id", [
    rule("hire_event", "equals", true, "Employment start occurred in the period"),
  ]),
  inclusions: [
    rule("hire_event", "equals", true, "Employment start occurred in the period"),
  ],
  exclusions: [],
  timeBasis: "Event count by employment start date",
  sourceFields: ["employee_id", "candidate_id", "hire_date"],
  dimensions: ["department", "job_family", "level", "source"],
  status: "Approved",
  confidence: "High",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

const applications = count("application", "application_id", [
  rule("completed_application", "equals", true, "Completed applications"),
]);
const applicationHires = count("application", "application_id", [
  rule("hire_event", "equals", true, "Applications resulting in a hire"),
]);

const applicationToHireRate: MetricDefinition = {
  id: "metric-application-to-hire-rate",
  key: "application_to_hire_rate",
  name: "Application-to-Hire Rate",
  domain: "recruiting",
  description: "Completed applications resulting in a hire divided by completed applications.",
  numerator: applicationHires,
  denominator: applications,
  formula: ratio(applicationHires, applications),
  inclusions: [],
  exclusions: [],
  timeBasis: "Application cohort with sufficient outcome observation",
  sourceFields: ["application_id", "completed_application", "hire_event"],
  dimensions: ["department", "job_family", "level", "source"],
  status: "Approved",
  confidence: "Medium",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

const internalMoves = count("employee", "employee_id", [
  rule("internal_move_event", "equals", true, "Approved internal move in the period"),
]);

const internalMobilityRate: MetricDefinition = {
  id: "metric-internal-mobility-rate",
  key: "internal_mobility_rate",
  name: "Internal Mobility Rate",
  domain: "mobility",
  description: "Employees making an approved internal move divided by average headcount.",
  numerator: internalMoves,
  denominator: AVERAGE_HEADCOUNT_EXPRESSION,
  formula: ratio(internalMoves, AVERAGE_HEADCOUNT_EXPRESSION),
  inclusions: [],
  exclusions: [],
  timeBasis: "Move events over average headcount",
  sourceFields: ["employee_id", "job_change_date", "internal_move_event", "period_headcount"],
  dimensions: ["department", "job_family", "level", "move_type"],
  status: "Approved",
  confidence: "High",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

const promotions = count("employee", "employee_id", [
  rule("promotion_event", "equals", true, "Approved promotion effective in the period"),
]);

const promotionRate: MetricDefinition = {
  id: "metric-promotion-rate",
  key: "promotion_rate",
  name: "Promotion Rate",
  domain: "mobility",
  description: "Employees promoted in the period divided by average headcount.",
  numerator: promotions,
  denominator: AVERAGE_HEADCOUNT_EXPRESSION,
  formula: ratio(promotions, AVERAGE_HEADCOUNT_EXPRESSION),
  inclusions: [],
  exclusions: [],
  timeBasis: "Promotion effective date over average headcount",
  sourceFields: ["employee_id", "promotion_effective_date", "promotion_event", "period_headcount"],
  dimensions: ["department", "job_family", "level"],
  status: "Approved",
  confidence: "High",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

const internalFills = count("requisition", "requisition_id", [
  rule("fill_source", "equals", "Internal", "Requisition filled by an internal candidate"),
]);
const filledRequisitions = count("requisition", "requisition_id", [
  rule("requisition_status", "equals", "Filled", "Filled requisitions"),
]);

const internalFillRate: MetricDefinition = {
  id: "metric-internal-fill-rate",
  key: "internal_fill_rate",
  name: "Internal Fill Rate",
  domain: "mobility",
  description: "Requisitions filled internally divided by all filled requisitions.",
  numerator: internalFills,
  denominator: filledRequisitions,
  formula: ratio(internalFills, filledRequisitions),
  inclusions: [],
  exclusions: [],
  timeBasis: "Filled-requisition cohort",
  sourceFields: ["requisition_id", "fill_source", "requisition_status"],
  dimensions: ["department", "job_family", "level", "location"],
  status: "Approved",
  confidence: "High",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

const compaRatio: MetricDefinition = {
  id: "metric-compa-ratio",
  key: "compa_ratio",
  name: "Compa-Ratio",
  domain: "compensation",
  description: "Average base salary divided by the approved salary-range midpoint.",
  formula: {
    kind: "average",
    field: "compa_ratio",
    rules: [
      rule("pay_eligible", "equals", true, "Employees eligible for base-pay analysis"),
    ],
  },
  inclusions: [
    rule("pay_eligible", "equals", true, "Employees eligible for base-pay analysis"),
  ],
  exclusions: [],
  timeBasis: "Point-in-time compensation snapshot",
  sourceFields: ["employee_id", "base_salary", "salary_range_midpoint", "compa_ratio"],
  dimensions: ["department", "job_family", "level", "location"],
  status: "Approved",
  confidence: "High",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

const rangePenetration: MetricDefinition = {
  id: "metric-range-penetration",
  key: "range_penetration",
  name: "Salary Range Penetration",
  domain: "compensation",
  description:
    "Average position of base salary between the approved range minimum and maximum.",
  formula: {
    kind: "average",
    field: "range_penetration",
    rules: [
      rule("valid_salary_range", "equals", true, "Salary range has a valid minimum and maximum"),
    ],
  },
  inclusions: [
    rule("valid_salary_range", "equals", true, "Salary range has a valid minimum and maximum"),
  ],
  exclusions: [],
  timeBasis: "Point-in-time compensation snapshot",
  sourceFields: ["employee_id", "base_salary", "salary_range_min", "salary_range_max"],
  dimensions: ["department", "job_family", "level", "location"],
  status: "Approved",
  confidence: "High",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

const marketPositioning: MetricDefinition = {
  id: "metric-market-positioning",
  key: "market_positioning",
  name: "Market Positioning",
  domain: "compensation",
  description: "Average employee pay divided by the approved market reference.",
  formula: {
    kind: "average",
    field: "market_positioning",
    rules: [
      rule("market_reference_current", "equals", true, "Current approved market reference"),
    ],
  },
  inclusions: [
    rule("market_reference_current", "equals", true, "Current approved market reference"),
  ],
  exclusions: [],
  timeBasis: "Point-in-time compensation snapshot and documented benchmark vintage",
  sourceFields: ["employee_id", "base_salary", "market_reference", "benchmark_vintage"],
  dimensions: ["department", "job_family", "level", "location"],
  status: "Approved",
  confidence: "Medium",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

const totalCashCompensation: MetricDefinition = {
  id: "metric-total-cash-compensation",
  key: "total_cash_compensation",
  name: "Total Cash Compensation",
  domain: "compensation",
  description: "Average base salary plus actual cash incentive paid for the approved population.",
  formula: {
    kind: "average",
    field: "total_cash_compensation",
    rules: [
      rule("pay_eligible", "equals", true, "Employees eligible for compensation reporting"),
    ],
  },
  inclusions: [
    rule("pay_eligible", "equals", true, "Employees eligible for compensation reporting"),
  ],
  exclusions: [],
  timeBasis: "Compensation period aligned to payment date",
  sourceFields: ["employee_id", "base_salary", "cash_incentive", "total_cash_compensation"],
  dimensions: ["department", "job_family", "level", "location"],
  status: "Approved",
  confidence: "High",
  version: 1,
  approvedAt: BASELINE_APPROVED_AT,
};

function genericMetric(input: {
  key: string;
  name: string;
  domain: MetricDefinition["domain"];
  description: string;
  formula: MetricExpression;
  sourceFields: string[];
  dimensions: string[];
  timeBasis: string;
}): MetricDefinition {
  return {
    id: `metric-${input.key.replaceAll("_", "-")}`,
    key: input.key,
    name: input.name,
    domain: input.domain,
    description: input.description,
    formula: input.formula,
    inclusions: [],
    exclusions: [],
    timeBasis: input.timeBasis,
    sourceFields: input.sourceFields,
    dimensions: input.dimensions,
    status: "Approved",
    confidence: "Medium",
    version: 1,
    approvedAt: BASELINE_APPROVED_AT,
  };
}

const RETENTION_EVENTS_METRIC = genericMetric({
  key: "retention_events",
  name: "Observed Exit Evidence",
  domain: "retention",
  description:
    "Distinct observed exits; a rate is calculated only when the same table contains a valid observed population.",
  formula: count("exit", "employee_id"),
  sourceFields: ["employee_id", "term_date", "attrition", "exit_classification"],
  dimensions: ["termination_reason", "exit_classification", "department"],
  timeBasis: "Observed termination event date or supplied report period",
});

const RECRUITING_ACTIVITY_METRIC = genericMetric({
  key: "recruiting_activity",
  name: "Recruiting Activity",
  domain: "recruiting",
  description:
    "Observed application, requisition, or aggregate advertisement activity in a compatible cohort.",
  formula: count("application", "application_id"),
  sourceFields: [
    "application_id",
    "requisition_id",
    "applications_count",
    "advertisements_count",
    "staffing_days",
  ],
  dimensions: ["report_period", "department", "source"],
  timeBasis: "Observed application, requisition, or reported period",
});

const COMPENSATION_POSITION_METRIC = genericMetric({
  key: "compensation_position",
  name: "Observed Pay Position",
  domain: "compensation",
  description:
    "Mean and median of the safest available pay amount, compa-ratio, or aggregate pay-gap measure.",
  formula: {
    kind: "average",
    field: "compensation_amount",
  },
  sourceFields: [
    "compensation_amount",
    "annual_base_salary",
    "compa_ratio",
    "pay_gap_median_pct",
    "pay_gap_mean_pct",
  ],
  dimensions: ["department", "job_role", "seniority_level", "location"],
  timeBasis: "Observed compensation snapshot or reported period",
});

const PERFORMANCE_DISTRIBUTION_METRIC = genericMetric({
  key: "performance_distribution",
  name: "Performance Review Distribution",
  domain: "performance",
  description:
    "Observed review completion or rating distribution without inferring potential.",
  formula: count("review", "employee_id"),
  sourceFields: [
    "employee_id",
    "performance_rating",
    "overall_performance",
    "appraisal_status",
  ],
  dimensions: ["overall_performance", "appraisal_status", "department"],
  timeBasis: "Observed appraisal completion date or report period",
});

const ABSENCE_METRIC = genericMetric({
  key: "absence",
  name: "Observed Absence",
  domain: "absence",
  description:
    "Mean supplied absence rate, or observed absence duration when a rate is unavailable.",
  formula: {
    kind: "average",
    field: "absence_rate",
  },
  sourceFields: ["absence_rate", "absence_hours", "absence_date"],
  dimensions: ["department", "location", "report_period"],
  timeBasis: "Observed absence date or report period",
});

const ENGAGEMENT_METRIC = genericMetric({
  key: "engagement",
  name: "Observed Engagement",
  domain: "engagement",
  description:
    "Mean supplied engagement score or mean across observed numeric survey items.",
  formula: {
    kind: "average",
    field: "engagement_score",
  },
  sourceFields: ["engagement_score", "survey_wave"],
  dimensions: ["department", "location", "survey_wave"],
  timeBasis: "Observed survey wave; no trend is claimed without one",
});

const LEARNING_METRIC = genericMetric({
  key: "learning",
  name: "Learning Completion / Pass",
  domain: "learning",
  description:
    "Observed completion or pass rate, with average assessment score when available.",
  formula: count("learning_record", "course_id"),
  sourceFields: [
    "employee_id",
    "course_id",
    "learning_status",
    "pass_flag",
    "learning_score",
  ],
  dimensions: ["course_name", "learning_status", "department"],
  timeBasis: "Observed learning completion date or report period",
});

const MOBILITY_METRIC = genericMetric({
  key: "mobility",
  name: "Observed Internal Mobility",
  domain: "mobility",
  description:
    "Observed internal movement or promotion events; no rate is claimed without a workforce denominator.",
  formula: count("mobility_event", "employee_id"),
  sourceFields: ["employee_id", "move_type", "movement_count", "job_change_date"],
  dimensions: ["move_type", "department", "job_role"],
  timeBasis: "Observed movement effective date or report period",
});

const REPRESENTATION_METRIC = genericMetric({
  key: "representation",
  name: "Representation Mix",
  domain: "diversity",
  description:
    "Compliance-oriented descriptive representation with small-sample suppression.",
  formula: count("employee", "employee_id"),
  sourceFields: [
    "employee_id",
    "employee_count",
    "demographic_category",
    "gender",
    "ethnicity",
  ],
  dimensions: ["demographic_category", "gender", "ethnicity"],
  timeBasis: "Observed snapshot or reported period",
});

export const INITIAL_PEOPLE_METRIC_LIBRARY: readonly MetricDefinition[] = [
  VOLUNTARY_ATTRITION_METRIC,
  TOTAL_ATTRITION_METRIC,
  HEADCOUNT_METRIC,
  retentionRate,
  timeToFill,
  offerAcceptanceRate,
  recruitingHires,
  applicationToHireRate,
  internalMobilityRate,
  promotionRate,
  internalFillRate,
  compaRatio,
  rangePenetration,
  marketPositioning,
  totalCashCompensation,
  RETENTION_EVENTS_METRIC,
  RECRUITING_ACTIVITY_METRIC,
  COMPENSATION_POSITION_METRIC,
  PERFORMANCE_DISTRIBUTION_METRIC,
  ABSENCE_METRIC,
  ENGAGEMENT_METRIC,
  LEARNING_METRIC,
  MOBILITY_METRIC,
  REPRESENTATION_METRIC,
];

export type MetricOverrideChanges = Partial<
  Pick<
    MetricDefinition,
    | "name"
    | "description"
    | "numerator"
    | "denominator"
    | "formula"
    | "inclusions"
    | "exclusions"
    | "startEvent"
    | "endEvent"
    | "timeBasis"
    | "sourceFields"
    | "dimensions"
    | "status"
    | "confidence"
    | "version"
    | "approvedAt"
  >
>;

export interface OrganizationMetricOverride {
  organizationId: string;
  metricKey: string;
  changes: MetricOverrideChanges;
}

function cloneDefinition(definition: MetricDefinition): MetricDefinition {
  return JSON.parse(JSON.stringify(definition)) as MetricDefinition;
}

export function resolveMetricLibraryForOrganization(
  organizationId: string,
  overrides: readonly OrganizationMetricOverride[] = [],
  baseLibrary: readonly MetricDefinition[] = INITIAL_PEOPLE_METRIC_LIBRARY,
): MetricDefinition[] {
  const organizationOverrides = new Map(
    overrides
      .filter((override) => override.organizationId === organizationId)
      .map((override) => [override.metricKey, override.changes]),
  );

  return baseLibrary.map((baseDefinition) => {
    const definition = cloneDefinition(baseDefinition);
    const changes = organizationOverrides.get(definition.key);
    return changes ? cloneDefinition({ ...definition, ...changes }) : definition;
  });
}

export function getMetricDefinition(
  key: string,
  library: readonly MetricDefinition[] = INITIAL_PEOPLE_METRIC_LIBRARY,
): MetricDefinition | undefined {
  const definition = library.find((metric) => metric.key === key);
  return definition ? cloneDefinition(definition) : undefined;
}
