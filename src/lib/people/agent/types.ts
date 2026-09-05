export const PEOPLE_TOOL_NAMES = [
  "list_metrics",
  "get_metric",
  "get_metric_trend",
  "get_metric_breakdown",
  "get_metric_definition",
  "list_entities",
  "describe_entity",
  "get_join_paths",
  "get_glossary_term",
  "get_lineage",
  "get_source_health",
  "get_quality_tests",
  "get_quality_incidents",
  "get_serving_snapshot",
  "get_skill_coverage",
] as const;

export type PeopleRegistryToolName = (typeof PEOPLE_TOOL_NAMES)[number];

export const PEOPLE_TOOL_SET = new Set<string>(PEOPLE_TOOL_NAMES);

export type PeopleAgentTier = 1 | 2 | "refuse";

export type PeopleSnapshotId = "current_certified" | "incident_replay";

export interface PeopleToolCall {
  name: PeopleRegistryToolName;
  args?: Record<string, string | number | null | undefined>;
}

export interface PeopleObservedFact {
  text: string;
  metric_id?: string;
  filters: Record<string, string | number | null>;
  as_of?: string;
  asOf?: string;
  grain?: string;
  value?: number | null;
  unit?: string;
  denied?: boolean;
  suppressed?: boolean;
}

export interface PeopleCriticResult {
  ok: boolean;
  failures: string[];
}

export interface PeopleAskTraceTool {
  seq: number;
  name: string;
  args: Record<string, unknown>;
  latency_ms: number;
  ok: boolean;
  rpc?: string;
  error?: string;
}

export interface PeopleAskTrace {
  tools: PeopleAskTraceTool[];
  latency_ms: number;
  llm_skipped: string | null;
  llm_calls: number;
}

export type PeopleErrorState = "rpc" | "critic" | null;

export interface PeopleAnswerContract {
  question: string;
  supported: boolean;
  headline: string;
  facts: string[];
  interpretation: string[];
  quality_status: string;
  freshness: unknown;
  definition?: unknown;
  evidence: unknown[];
  lineage?: unknown;
  tools_used: string[];
  trace_id: string;
  tier: PeopleAgentTier;
  identity_id: string;
  snapshot: {
    pointer_id: PeopleSnapshotId;
    run_id: string;
    as_of: string;
  };
  observed: {
    headline: string;
    facts: PeopleObservedFact[];
  };
  hypotheses: string[];
  suppressed_cells: Array<{
    dimension?: string;
    key?: string;
    n?: number | null;
    min_cell?: number;
  }>;
  skills_used: string[];
  critic: PeopleCriticResult;
  error_state: PeopleErrorState;
  withheld: boolean;
  llm_skipped: string | null;
  trace: PeopleAskTrace;
}

export const METRIC_ALIASES: Record<string, string> = {
  headcount: "headcount",
  "average headcount": "average_headcount",
  average_headcount: "average_headcount",
  hires: "hires",
  rehires: "rehires",
  "voluntary attrition": "voluntary_attrition_rate",
  "voluntary attrition rate": "voluntary_attrition_rate",
  voluntary_attrition: "voluntary_attrition_rate",
  voluntary_attrition_rate: "voluntary_attrition_rate",
  attrition: "voluntary_attrition_rate",
  "involuntary attrition": "involuntary_attrition_rate",
  involuntary_attrition_rate: "involuntary_attrition_rate",
  "regrettable attrition": "regrettable_attrition_rate",
  regrettable_attrition: "regrettable_attrition_rate",
  regrettable_attrition_rate: "regrettable_attrition_rate",
  "promotion rate": "promotion_rate",
  promotion_rate: "promotion_rate",
  "internal mobility": "internal_mobility_rate",
  "internal mobility rate": "internal_mobility_rate",
  internal_mobility_rate: "internal_mobility_rate",
  "span of control": "span_of_control",
  span_of_control: "span_of_control",
  "manager turnover": "manager_turnover",
  manager_turnover: "manager_turnover",
  compensation: "compa_ratio_median",
  "compa-ratio": "compa_ratio_median",
  "compa ratio": "compa_ratio_median",
  compa_ratio: "compa_ratio_median",
  compa_ratio_median: "compa_ratio_median",
  engagement: "engagement_score",
  engagement_score: "engagement_score",
  "training hours": "training_hours",
  training_hours: "training_hours",
  "skill coverage": "skill_coverage",
  "skill gap": "skill_coverage",
  skill_coverage: "skill_coverage",
  "quality of hire": "quality_of_hire",
  quality_of_hire: "quality_of_hire",
  "time to fill": "time_to_fill",
  time_to_fill: "time_to_fill",
  "time in stage": "time_in_stage",
  time_in_stage: "time_in_stage",
  "applications per opening": "applications_per_opening",
  applications_per_opening: "applications_per_opening",
  "offer acceptance": "offer_acceptance",
  offer_acceptance: "offer_acceptance",
  "recruiter load": "recruiter_load",
  recruiter_load: "recruiter_load",
};

export const CERTIFIED_METRIC_IDS = [
  "headcount",
  "average_headcount",
  "hires",
  "rehires",
  "voluntary_attrition_rate",
  "involuntary_attrition_rate",
  "regrettable_attrition_rate",
  "promotion_rate",
  "internal_mobility_rate",
  "span_of_control",
  "manager_turnover",
  "compa_ratio_median",
  "engagement_score",
  "training_hours",
  "skill_coverage",
  "quality_of_hire",
  "time_to_fill",
  "time_in_stage",
  "applications_per_opening",
  "offer_acceptance",
  "recruiter_load",
] as const;

export const RATE_METRICS = new Set([
  "voluntary_attrition_rate",
  "involuntary_attrition_rate",
  "regrettable_attrition_rate",
  "promotion_rate",
  "internal_mobility_rate",
  "engagement_score",
  "skill_coverage",
  "quality_of_hire",
  "offer_acceptance",
]);

export function defaultGrain(metricId: string): "trailing_12m" | "month" {
  return RATE_METRICS.has(metricId) && metricId !== "engagement_score" && metricId !== "skill_coverage"
    ? "trailing_12m"
    : "month";
}
