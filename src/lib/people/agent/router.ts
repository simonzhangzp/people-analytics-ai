import type { PeopleDemoCase } from "../ask-types";
import {
  CERTIFIED_METRIC_IDS,
  METRIC_ALIASES,
  defaultGrain,
  type PeopleAgentTier,
  type PeopleSnapshotId,
  type PeopleToolCall,
} from "./types";

export interface RouterPlan {
  tier: PeopleAgentTier;
  refuse_reason?: string;
  metric_id?: string;
  job_family?: string | null;
  dimension?: string;
  snapshot_id: PeopleSnapshotId;
  tools: PeopleToolCall[];
  filters: Record<string, string | number | null>;
}

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
  /\b(why|driver|driving|explain|increasing|decreasing|concentrat|what should we investigate|locations matter)\b|为什么|驱动|上升/i;

const DEFINITION = /\b(defined|definition|formula|owner|who owns|numerator|denominator|exclusions)\b/i;
const TREND = /\b(trend|over time|24 months|time series)\b/i;
const BREAKDOWN = /\b(breakdown|by tenure|by location|by grade|tenure band)\b/i;
const QUALITY = /\b(quality tests|source health|tests ran)\b/i;
const LINEAGE = /\b(lineage|how is (this|headcount) produced)\b/i;
const SNAPSHOT = /\b(snapshot|certified run|serving run)\b/i;
const SKILLS = /\b(skill gap|critical skills|skill coverage|learning)\b/i;
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

function dimension(question: string): string | undefined {
  if (/location.?tenure.?grade|locations matter|concentrat/i.test(question)) return "location_tenure_grade";
  if (/location.?tenure/i.test(question)) return "location_tenure";
  if (/by location|location breakdown/i.test(question)) return "location_id";
  if (/tenure/i.test(question)) return "tenure_band";
  if (/by grade/i.test(question)) return "location_tenure_grade";
  if (/by region/i.test(question)) return "region";
  if (/by job family/i.test(question)) return "job_family";
  return undefined;
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
      return {
        tier: "refuse",
        refuse_reason: rule.reason,
        snapshot_id: "current_certified",
        tools: [],
        filters: {},
      };
    }
  }

  const metric = resolveMetric(trimmed);
  const family = jobFamily(trimmed);
  const dim = dimension(trimmed);

  if (INCIDENT.test(trimmed) && !VALUE.test(trimmed) && !DEFINITION.test(trimmed)) {
    return {
      tier: 1,
      metric_id: "headcount",
      snapshot_id: "incident_replay",
      job_family: family,
      tools: [
        { name: "get_quality_incidents", args: { snapshot_id: "incident_replay" } },
        { name: "get_source_health", args: { snapshot_id: "incident_replay" } },
      ],
      filters: { snapshot_id: "incident_replay" },
    };
  }

  if (DEFINITION.test(trimmed)) {
    const defMetric = metric ?? "headcount";
    return {
      tier: 1,
      metric_id: defMetric,
      snapshot_id,
      job_family: family,
      tools: [{ name: "get_metric_definition", args: { metric_id: defMetric } }],
      filters: { metric_id: defMetric },
    };
  }

  if (QUALITY.test(trimmed)) {
    return {
      tier: 1,
      snapshot_id,
      tools: [
        { name: "get_quality_tests" },
        { name: "get_serving_snapshot" },
      ],
      filters: {},
    };
  }

  if (LINEAGE.test(trimmed)) {
    return {
      tier: 1,
      metric_id: metric ?? "headcount",
      snapshot_id,
      tools: [{ name: "get_lineage", args: { metric_id: metric ?? "headcount" } }],
      filters: { metric_id: metric ?? "headcount" },
    };
  }

  if (SNAPSHOT.test(trimmed) && !VALUE.test(trimmed) && !metric) {
    return {
      tier: 1,
      snapshot_id,
      tools: [{ name: "get_serving_snapshot" }],
      filters: {},
    };
  }

  if (TREND.test(trimmed) && metric) {
    return {
      tier: 1,
      metric_id: metric,
      job_family: family,
      snapshot_id,
      tools: [
        {
          name: "get_metric_trend",
          args: { metric_id: metric, job_family: family, months: 24 },
        },
      ],
      filters: { metric_id: metric, job_family: family },
    };
  }

  if (BREAKDOWN.test(trimmed) && !CAUSAL.test(trimmed)) {
    const breakdownMetric = metric ?? "voluntary_attrition_rate";
    return {
      tier: 1,
      metric_id: breakdownMetric,
      job_family: family ?? "Engineering",
      dimension: dim ?? "tenure_band",
      snapshot_id,
      tools: [
        {
          name: "get_metric_breakdown",
          args: {
            metric_id: breakdownMetric,
            dimension: dim ?? "tenure_band",
            job_family: family ?? "Engineering",
          },
        },
      ],
      filters: { metric_id: breakdownMetric, dimension: dim ?? "tenure_band" },
    };
  }

  if (SKILLS.test(trimmed) && !CAUSAL.test(trimmed)) {
    return {
      tier: 1,
      metric_id: "skill_coverage",
      job_family: family ?? "Engineering",
      snapshot_id,
      tools: [{ name: "get_skill_coverage", args: { job_family: family ?? "Engineering" } }],
      filters: { job_family: family ?? "Engineering" },
    };
  }

  if (metric && !CAUSAL.test(trimmed)) {
    const grain = defaultGrain(metric);
    return {
      tier: 1,
      metric_id: metric,
      job_family: family,
      snapshot_id,
      tools: [
        {
          name: "get_metric",
          args: { metric_id: metric, job_family: family, grain },
        },
        { name: "get_metric_definition", args: { metric_id: metric } },
      ],
      filters: { metric_id: metric, job_family: family, grain },
    };
  }

  if (CAUSAL.test(trimmed) || demoCase === "attrition") {
    const attritionMetric = metric ?? "voluntary_attrition_rate";
    const jf = family ?? "Engineering";
    return {
      tier: 2,
      metric_id: attritionMetric,
      job_family: jf,
      dimension: dim ?? "location_tenure_grade",
      snapshot_id,
      tools: attritionSkeleton(attritionMetric, jf, /compensat|compa/i.test(trimmed)),
      filters: { metric_id: attritionMetric, job_family: jf },
    };
  }

  if (demoCase === "incident") {
    return {
      tier: 1,
      metric_id: "headcount",
      snapshot_id: "incident_replay",
      tools: [
        { name: "get_quality_incidents", args: { snapshot_id: "incident_replay" } },
        { name: "get_source_health", args: { snapshot_id: "incident_replay" } },
      ],
      filters: { snapshot_id: "incident_replay" },
    };
  }

  return {
    tier: "refuse",
    refuse_reason: "unsupported_question",
    snapshot_id: "current_certified",
    tools: [],
    filters: {},
  };
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
  const plan = routePeopleQuestion(question);
  if (plan.tier === "refuse") return null;
  return plan.tools;
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
