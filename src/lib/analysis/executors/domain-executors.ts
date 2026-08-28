import { executeGenericDomain, type GenericExecutorConfig } from "./generic";
import type { DomainExecutor } from "./types";

function executor(
  config: GenericExecutorConfig,
  declaration: Omit<DomainExecutor, "domain" | "minSampleSize" | "limitations" | "execute">,
): DomainExecutor {
  return {
    domain: config.mode,
    minSampleSize: config.minSampleSize,
    limitations: config.limitations,
    ...declaration,
    execute: (context) => executeGenericDomain(context, config),
  };
}

export const workforceExecutor = executor(
  {
    mode: "workforce",
    metricName: "Headcount / workforce composition",
    preferredFields: ["employee_id", "employee_count", "snapshot_month"],
    categoryFields: ["department", "location", "job_role", "seniority_level"],
    timeFields: ["snapshot_month", "report_period"],
    minSampleSize: 1,
    limitations: [
      "Headcount reflects observed identities or supplied aggregate counts; it does not infer unobserved employment status.",
    ],
  },
  {
    requiredRoles: ["employee_id or employee_count"],
    metricKeys: ["headcount"],
    periodStrategy: "as-of",
    branches: ["summary", "distribution", "compare-periods"],
    operations: ["summary", "distribution", "compare_periods"],
  },
);

export const retentionExecutor = executor(
  {
    mode: "retention",
    metricName: "Exit count / observable attrition",
    preferredFields: [
      "attrition",
      "term_date",
      "exit_classification",
      "employee_id",
    ],
    categoryFields: ["exit_classification", "termination_reason", "department"],
    timeFields: ["term_date", "report_period"],
    minSampleSize: 5,
    limitations: [
      "Exit classifications are descriptive unless an approved metric definition explicitly supplies inclusion rules.",
    ],
  },
  {
    requiredRoles: ["termination event/date or outcome flag"],
    metricKeys: ["retention_events", "voluntary_attrition", "total_attrition"],
    periodStrategy: "event",
    branches: ["summary", "trend", "distribution"],
    operations: ["summary", "rate", "validate_trend", "distribution"],
  },
);

export const recruitingExecutor = executor(
  {
    mode: "recruiting",
    metricName: "Recruiting activity / funnel",
    preferredFields: [
      "application_id",
      "requisition_id",
      "applications_count",
      "advertisements_count",
      "staffing_days",
      "record_count",
    ],
    categoryFields: ["department", "source", "requisition_status", "job_title"],
    timeFields: ["report_period", "application_date", "requisition_open_date"],
    minSampleSize: 1,
    limitations: [
      "Stage conversion is reported only when compatible stage fields share the same cohort.",
    ],
  },
  {
    requiredRoles: ["application/requisition identity or recruiting measure"],
    metricKeys: ["recruiting_activity", "time_to_fill", "application_to_hire_rate"],
    periodStrategy: "event",
    branches: ["summary", "funnel", "duration", "compare-periods"],
    operations: ["summary", "funnel", "duration", "compare_periods"],
  },
);

export const compensationExecutor = executor(
  {
    mode: "compensation",
    metricName: "Pay level / pay gap",
    preferredFields: [
      "pay_gap_median_pct",
      "pay_gap_mean_pct",
      "compa_ratio",
      "annual_base_salary",
      "compensation_amount",
    ],
    categoryFields: ["department", "job_role", "seniority_level", "location"],
    timeFields: ["compensation_effective_date", "snapshot_month", "report_period"],
    minSampleSize: 5,
    limitations: [
      "Pay summaries are descriptive and do not adjust for role, level, location, hours, or other legitimate explanatory factors.",
    ],
  },
  {
    requiredRoles: ["pay amount, compa-ratio, or aggregate pay-gap measure"],
    metricKeys: ["compensation_position", "compa_ratio", "pay_gap"],
    periodStrategy: "as-of",
    branches: ["summary", "distribution", "compare-periods"],
    operations: ["summary", "distribution", "segment", "compare_periods"],
  },
);

export const performanceExecutor = executor(
  {
    mode: "performance",
    metricName: "Review completion / rating distribution",
    preferredFields: [
      "performance_rating",
      "overall_performance",
      "appraisal_status",
      "talent_review_status",
    ],
    categoryFields: ["overall_performance", "appraisal_status", "placement_code"],
    timeFields: ["appraisal_completed_date", "report_period"],
    minSampleSize: 5,
    limitations: [
      "Ratings and completion status are descriptive; they are not a validated measure of employee potential.",
    ],
  },
  {
    requiredRoles: ["rating, placement, or review status"],
    metricKeys: ["performance_distribution", "review_completion"],
    periodStrategy: "event",
    branches: ["summary", "distribution"],
    operations: ["summary", "distribution", "segment"],
  },
);

export const absenceExecutor = executor(
  {
    mode: "absence",
    metricName: "Absence rate / incidence",
    preferredFields: ["absence_rate", "absence_hours", "absence_date"],
    categoryFields: ["department", "location"],
    timeFields: ["absence_date", "report_period"],
    minSampleSize: 2,
    limitations: [
      "Supplied rates are averaged as reported; no denominator is reconstructed when unavailable.",
    ],
  },
  {
    requiredRoles: ["absence rate, duration, or dated event"],
    metricKeys: ["absence"],
    periodStrategy: "reported-period",
    branches: ["summary", "trend"],
    operations: ["summary", "rate", "validate_trend", "compare_periods"],
  },
);

export const engagementExecutor = executor(
  {
    mode: "engagement",
    metricName: "Engagement mean / favorable score",
    preferredFields: ["engagement_score", "survey_wave"],
    categoryFields: ["department", "location", "job_role"],
    timeFields: ["survey_wave", "report_period"],
    minSampleSize: 5,
    limitations: [
      "Favorable means an observed score of 4 or higher; change this only through an approved metric definition.",
    ],
  },
  {
    requiredRoles: ["engagement score or survey item"],
    metricKeys: ["engagement"],
    periodStrategy: "survey-wave",
    branches: ["summary", "distribution", "trend"],
    operations: ["summary", "distribution", "validate_trend"],
  },
);

export const learningExecutor = executor(
  {
    mode: "learning",
    metricName: "Learning completion / pass rate",
    preferredFields: [
      "learning_status",
      "pass_flag",
      "learning_score",
      "course_id",
    ],
    categoryFields: ["course_name", "learning_status", "department"],
    timeFields: ["learning_completed_at", "report_period"],
    minSampleSize: 5,
    limitations: [
      "Completion and assessment scores do not establish on-the-job skill transfer.",
    ],
  },
  {
    requiredRoles: ["learning activity plus completion, pass, or score"],
    metricKeys: ["learning"],
    periodStrategy: "event",
    branches: ["summary", "distribution"],
    operations: ["summary", "rate", "distribution", "segment"],
  },
);

export const mobilityExecutor = executor(
  {
    mode: "mobility",
    metricName: "Promotion / internal movement",
    preferredFields: [
      "movement_count",
      "record_count",
      "move_type",
      "job_change_date",
    ],
    categoryFields: ["move_type", "department", "job_role"],
    timeFields: ["job_change_date", "report_period"],
    minSampleSize: 1,
    limitations: [
      "Movement events are reported as supplied and are not classified as promotions unless the source states that classification.",
    ],
  },
  {
    requiredRoles: ["movement type, count, or effective date"],
    metricKeys: ["mobility", "promotion_rate", "internal_mobility_rate"],
    periodStrategy: "event",
    branches: ["summary", "distribution", "trend"],
    operations: ["summary", "rate", "distribution", "compare_periods"],
  },
);

export const diversityExecutor = executor(
  {
    mode: "diversity",
    metricName: "Representation / self-identification mix",
    preferredFields: [
      "demographic_category",
      "gender",
      "ethnicity",
      "employee_count",
      "record_count",
      "employee_id",
    ],
    categoryFields: ["demographic_category", "gender", "ethnicity"],
    timeFields: ["report_period", "snapshot_month"],
    minSampleSize: 5,
    limitations: [
      "Representation is a compliance-oriented descriptive measure and is not an action-driving individual attribute.",
    ],
  },
  {
    requiredRoles: ["reviewed demographic category and population count"],
    metricKeys: ["representation"],
    periodStrategy: "reported-period",
    branches: ["summary", "distribution"],
    operations: ["summary", "distribution", "compare_periods"],
  },
);

export const DOMAIN_EXECUTORS: readonly DomainExecutor[] = [
  workforceExecutor,
  retentionExecutor,
  recruitingExecutor,
  compensationExecutor,
  performanceExecutor,
  absenceExecutor,
  engagementExecutor,
  learningExecutor,
  mobilityExecutor,
  diversityExecutor,
];
