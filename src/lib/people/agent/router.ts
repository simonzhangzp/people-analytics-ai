import { CASE_FOLLOW_UPS, type PeopleDemoCase } from "../ask-types";
import {
  CERTIFIED_METRIC_IDS,
  METRIC_ALIASES,
  defaultGrain,
  type PeopleAgentTier,
  type PeopleSnapshotId,
  type PeopleToolCall,
} from "./types";

export type PeoplePlaybook =
  | "refuse"
  | "incident"
  | "definition"
  | "quality"
  | "lineage"
  | "snapshot"
  | "trend"
  | "locations"
  | "next_steps"
  | "tenure"
  | "compensation"
  | "skills"
  | "metric_value"
  | "attrition_explore";

export interface RouterPlan {
  tier: PeopleAgentTier;
  playbook: PeoplePlaybook;
  llmEligible: boolean;
  refuse_reason?: string;
  metric_id?: string;
  job_family?: string | null;
  dimension?: string;
  snapshot_id: PeopleSnapshotId;
  tools: PeopleToolCall[];
  filters: Record<string, string | number | null>;
}

const CHIP_PLAYBOOK: Record<string, PeoplePlaybook> = {
  "which locations matter most?": "locations",
  "what should we investigate next?": "next_steps",
  "show me the tenure breakdown": "tenure",
  "what about compensation?": "compensation",
  "which critical skills have the largest gaps?": "skills",
  "how is voluntary attrition defined?": "definition",
};

const REFUSE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /\b(employee[\s_-]?id|worker_id|person_id|list employees|named employees|payroll detail|salary of|email of)\b/i,
    reason: "personal_data",
  },
  {
    re: /\b(ignore min_cell|unsuppress|show n\s*<\s*10|without suppression)\b/i,
    reason: "bypass_suppression",
  },
  {
    re: /\b(ignore previous|you are now|run sql|select\s+.+\s+from|insert into|drop table|postgres|bypass rls)\b/i,
    reason: "injection",
  },
  {
    re: /\b(sql|bronze|lake path|unfreeze|thaw simulator|move pointer|alter pointer)\b/i,
    reason: "platform_mutation",
  },
];

const CAUSAL =
  /\b(why|driver|driving|explain|increasing|decreasing|concentrat)\b|为什么|驱动|上升/i;
const DEFINITION = /\b(defined|definition|formula|owner|who owns|numerator|denominator|exclusions)\b/i;
const TREND = /\b(trend|over time|24 months|time series)\b/i;
const QUALITY = /\b(quality tests|source health|tests ran)\b/i;
const LINEAGE = /\b(lineage|how is (this|headcount) produced)\b/i;
const SNAPSHOT = /\b(snapshot|certified run|serving run)\b/i;
const INCIDENT = /\b(apac|workforce change|metrics were affected|published as)\b/i;
const VALUE = /\b(what is|current|how many|how much|trust this number)\b/i;

function resolveMetric(question: string): string | undefined {
  const lower = question.toLowerCase();
  const keys = Object.keys(METRIC_ALIASES).sort((a, b) => b.length - a.length);
  const hits = keys.filter((key) => lower.includes(key));
  const unique = [...new Set(hits.map((key) => METRIC_ALIASES[key]))];
  if (unique.length === 1 && CERTIFIED_METRIC_IDS.includes(unique[0] as (typeof CERTIFIED_METRIC_IDS)[number])) {
    return unique[0];
  }
  if (/\bheadcount\b/i.test(question) && unique.length === 0) return "headcount";
  return undefined;
}

function jobFamily(question: string): string | null {
  return /\bengineering\b/i.test(question) ? "Engineering" : null;
}

function chipPlaybook(question: string): PeoplePlaybook | undefined {
  return CHIP_PLAYBOOK[question.trim().toLowerCase().replace(/\s+/g, " ")];
}

function plan(
  partial: Omit<RouterPlan, "llmEligible"> & { llmEligible?: boolean },
): RouterPlan {
  return { llmEligible: false, ...partial };
}

function engineeringAttritionTools(dimension: string): PeopleToolCall[] {
  return [
    {
      name: "get_metric",
      args: { metric_id: "voluntary_attrition_rate", job_family: "Engineering", grain: "trailing_12m" },
    },
    {
      name: "get_metric_breakdown",
      args: {
        metric_id: "voluntary_attrition_rate",
        dimension,
        job_family: "Engineering",
      },
    },
  ];
}

export function routePeopleQuestion(
  question: string,
  demoCase?: PeopleDemoCase,
): RouterPlan {
  const trimmed = question.trim();
  const snapshot_id: PeopleSnapshotId =
    demoCase === "incident" || INCIDENT.test(trimmed) ? "incident_replay" : "current_certified";

  for (const rule of REFUSE_PATTERNS) {
    if (rule.re.test(trimmed)) {
      return plan({
        tier: "refuse",
        playbook: "refuse",
        refuse_reason: rule.reason,
        snapshot_id: "current_certified",
        tools: [],
        filters: {},
      });
    }
  }

  const chip = chipPlaybook(trimmed);
  if (chip === "locations") {
    return plan({
      tier: 1,
      playbook: "locations",
      metric_id: "voluntary_attrition_rate",
      job_family: "Engineering",
      dimension: "location_tenure_grade",
      snapshot_id: "current_certified",
      tools: engineeringAttritionTools("location_tenure_grade"),
      filters: { metric_id: "voluntary_attrition_rate", dimension: "location_tenure_grade" },
    });
  }
  if (chip === "next_steps") {
    return plan({
      tier: 1,
      playbook: "next_steps",
      metric_id: "voluntary_attrition_rate",
      job_family: "Engineering",
      dimension: "location_tenure_grade",
      snapshot_id: "current_certified",
      tools: engineeringAttritionTools("location_tenure_grade"),
      filters: { metric_id: "voluntary_attrition_rate", dimension: "location_tenure_grade" },
    });
  }
  if (chip === "tenure") {
    return plan({
      tier: 1,
      playbook: "tenure",
      metric_id: "voluntary_attrition_rate",
      job_family: "Engineering",
      dimension: "location_tenure",
      snapshot_id: "current_certified",
      tools: engineeringAttritionTools("location_tenure"),
      filters: { metric_id: "voluntary_attrition_rate", dimension: "location_tenure" },
    });
  }
  if (chip === "compensation") {
    return plan({
      tier: 1,
      playbook: "compensation",
      metric_id: "compa_ratio_median",
      job_family: "Engineering",
      snapshot_id: "current_certified",
      tools: [{ name: "get_metric", args: { metric_id: "compa_ratio_median", job_family: "Engineering" } }],
      filters: { metric_id: "compa_ratio_median", job_family: "Engineering" },
    });
  }
  if (chip === "skills") {
    return plan({
      tier: 1,
      playbook: "skills",
      metric_id: "skill_coverage",
      job_family: "Engineering",
      snapshot_id: "current_certified",
      tools: [{ name: "get_skill_coverage", args: { job_family: "Engineering" } }],
      filters: { job_family: "Engineering" },
    });
  }
  if (chip === "definition") {
    return plan({
      tier: 1,
      playbook: "definition",
      metric_id: "voluntary_attrition_rate",
      snapshot_id: "current_certified",
      tools: [{ name: "get_metric_definition", args: { metric_id: "voluntary_attrition_rate" } }],
      filters: { metric_id: "voluntary_attrition_rate" },
    });
  }

  const metric = resolveMetric(trimmed);
  const family = jobFamily(trimmed);

  if (INCIDENT.test(trimmed) && !VALUE.test(trimmed) && !DEFINITION.test(trimmed)) {
    return plan({
      tier: 1,
      playbook: "incident",
      metric_id: "headcount",
      snapshot_id: "incident_replay",
      job_family: family,
      tools: [
        { name: "get_quality_incidents", args: { snapshot_id: "incident_replay" } },
        { name: "get_source_health", args: { snapshot_id: "incident_replay" } },
      ],
      filters: { snapshot_id: "incident_replay" },
    });
  }

  if (DEFINITION.test(trimmed)) {
    const defMetric = metric ?? "headcount";
    return plan({
      tier: 1,
      playbook: "definition",
      metric_id: defMetric,
      snapshot_id,
      job_family: family,
      tools: [{ name: "get_metric_definition", args: { metric_id: defMetric } }],
      filters: { metric_id: defMetric },
    });
  }

  if (QUALITY.test(trimmed)) {
    return plan({
      tier: 1,
      playbook: "quality",
      snapshot_id,
      tools: [{ name: "get_quality_tests" }, { name: "get_serving_snapshot" }],
      filters: {},
    });
  }

  if (LINEAGE.test(trimmed)) {
    return plan({
      tier: 1,
      playbook: "lineage",
      metric_id: metric ?? "headcount",
      snapshot_id,
      tools: [{ name: "get_lineage", args: { metric_id: metric ?? "headcount" } }],
      filters: { metric_id: metric ?? "headcount" },
    });
  }

  if (SNAPSHOT.test(trimmed) && !VALUE.test(trimmed) && !metric) {
    return plan({
      tier: 1,
      playbook: "snapshot",
      snapshot_id,
      tools: [{ name: "get_serving_snapshot" }],
      filters: {},
    });
  }

  if (TREND.test(trimmed) && metric) {
    return plan({
      tier: 1,
      playbook: "trend",
      metric_id: metric,
      job_family: family,
      snapshot_id,
      tools: [{ name: "get_metric_trend", args: { metric_id: metric, job_family: family, months: 24 } }],
      filters: { metric_id: metric, job_family: family },
    });
  }

  if (metric && !CAUSAL.test(trimmed)) {
    const grain = defaultGrain(metric);
    return plan({
      tier: 1,
      playbook: "metric_value",
      metric_id: metric,
      job_family: family,
      snapshot_id,
      tools: [
        { name: "get_metric", args: { metric_id: metric, job_family: family, grain } },
        { name: "get_metric_definition", args: { metric_id: metric } },
      ],
      filters: { metric_id: metric, job_family: family, grain },
    });
  }

  if (CAUSAL.test(trimmed) || demoCase === "attrition") {
    const attritionMetric = metric ?? "voluntary_attrition_rate";
    const jf = family ?? "Engineering";
    return plan({
      tier: 2,
      playbook: "attrition_explore",
      llmEligible: true,
      metric_id: attritionMetric,
      job_family: jf,
      dimension: "location_tenure_grade",
      snapshot_id,
      tools: attritionSkeleton(attritionMetric, jf, false),
      filters: { metric_id: attritionMetric, job_family: jf },
    });
  }

  if (demoCase === "incident") {
    return plan({
      tier: 1,
      playbook: "incident",
      metric_id: "headcount",
      snapshot_id: "incident_replay",
      tools: [
        { name: "get_quality_incidents", args: { snapshot_id: "incident_replay" } },
        { name: "get_source_health", args: { snapshot_id: "incident_replay" } },
      ],
      filters: { snapshot_id: "incident_replay" },
    });
  }

  return plan({
    tier: "refuse",
    playbook: "refuse",
    refuse_reason: "unsupported_question",
    snapshot_id: "current_certified",
    tools: [],
    filters: {},
  });
}

export function attritionSkeleton(
  metricId: string,
  jobFamily: string,
  includeCompa: boolean,
): PeopleToolCall[] {
  const tools: PeopleToolCall[] = [
    {
      name: "get_metric",
      args: { metric_id: metricId, job_family: jobFamily, grain: "trailing_12m" },
    },
    {
      name: "get_metric",
      args: { metric_id: metricId, grain: "trailing_12m" },
    },
    {
      name: "get_metric_trend",
      args: { metric_id: metricId, job_family: jobFamily, months: 24 },
    },
    {
      name: "get_metric_breakdown",
      args: {
        metric_id: metricId,
        dimension: "location_tenure_grade",
        job_family: jobFamily,
      },
    },
    { name: "get_skill_coverage", args: { job_family: jobFamily } },
  ];
  if (includeCompa) {
    tools.push({
      name: "get_metric",
      args: { metric_id: "compa_ratio_median", job_family: jobFamily },
    });
  }
  return tools;
}

export function matchPeoplePlaybook(question: string): PeopleToolCall[] | null {
  const routed = routePeopleQuestion(question);
  if (routed.tier === "refuse") return null;
  return routed.tools;
}

export function case3ChipPlaybooks(): Record<string, PeoplePlaybook> {
  const out: Record<string, PeoplePlaybook> = {};
  for (const chip of CASE_FOLLOW_UPS.attrition) {
    const routed = routePeopleQuestion(chip, "attrition");
    out[chip] = routed.playbook;
  }
  return out;
}

export function filterRegistryTools(calls: unknown): PeopleToolCall[] {
  if (!Array.isArray(calls)) return [];
  const out: PeopleToolCall[] = [];
  for (const item of calls) {
    if (!item || typeof item !== "object") continue;
    const row = item as { name?: unknown; args?: unknown };
    if (typeof row.name !== "string") continue;
    if (!PEOPLE_TOOL_SET_LOCAL.has(row.name)) continue;
    const args =
      row.args && typeof row.args === "object" && !Array.isArray(row.args)
        ? (row.args as Record<string, string | number | null | undefined>)
        : {};
    out.push({ name: row.name as PeopleToolCall["name"], args });
    if (out.length >= 6) break;
  }
  return out;
}

const PEOPLE_TOOL_SET_LOCAL = new Set([
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
]);
