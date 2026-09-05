import "server-only";

import { Pool, type QueryResultRow } from "pg";
import { PEOPLE_REF } from "./refs";
import { DEFAULT_IDENTITY } from "./demo-identities";

export { DEFAULT_IDENTITY, DEMO_IDENTITIES } from "./demo-identities";
export { peopleV2Configured } from "./v2-config";

const BLOCKED = ["fyvivwgyisrtmehzjqlv", "kgxbomcmgkwlmzyevqjw"];

export class PeopleV2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeopleV2Error";
  }
}

function assertEnv(): { url: string; ref: string } {
  const url = process.env.PEOPLE_DB_URL?.trim() ?? "";
  const ref = process.env.PEOPLE_SERVING_REF?.trim() ?? "";
  if (!url || !ref) {
    throw new PeopleV2Error("People v2 serving is not configured.");
  }
  if (ref !== PEOPLE_REF) {
    throw new PeopleV2Error("PEOPLE_SERVING_REF does not match the dedicated People project.");
  }
  for (const blocked of BLOCKED) {
    if (url.includes(blocked) || ref.includes(blocked)) {
      throw new PeopleV2Error("Blocked Supabase project ref in People v2 connection.");
    }
  }
  if (url.includes("NEXT_PUBLIC_SUPABASE") || process.env.PEOPLE_V2_USE_ANON === "1") {
    throw new PeopleV2Error("v2 path must not use NEXT_PUBLIC_SUPABASE or anon keys.");
  }
  const portMatch = url.match(/:(\d+)\b/);
  const port = portMatch ? Number(portMatch[1]) : 0;
  if (port && port !== 6543) {
    throw new PeopleV2Error("People v2 must use the transaction pooler on port 6543.");
  }
  if (!/[?&]sslmode=require(?:&|$)/i.test(url) && !url.includes("sslmode=require")) {
    throw new PeopleV2Error("People v2 must set sslmode=require.");
  }
  return { url, ref };
}

let pool: Pool | null = null;
let poolPromise: Promise<Pool> | null = null;

const POOLER_HOSTS = [
  "aws-0-us-east-1.pooler.supabase.com",
  "aws-1-us-east-1.pooler.supabase.com",
];

function poolConfig(url: string, host: string) {
  const parsed = new URL(url);
  return {
    host,
    port: Number(parsed.port || 6543),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    max: 3,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 8_000,
    ssl: { rejectUnauthorized: false },
  };
}

async function ensurePool(): Promise<Pool> {
  if (pool) return pool;
  if (poolPromise) return poolPromise;
  poolPromise = (async () => {
    const { url } = assertEnv();
    const preferred = new URL(url).hostname;
    const hosts = [preferred, ...POOLER_HOSTS].filter(
      (host, index, all) => Boolean(host) && all.indexOf(host) === index,
    );
    let last: unknown;
    for (const host of hosts) {
      const candidate = new Pool(poolConfig(url, host));
      try {
        const client = await candidate.connect();
        client.release();
        pool = candidate;
        return candidate;
      } catch (error) {
        last = error;
        await candidate.end().catch(() => undefined);
      }
    }
    throw last instanceof Error ? last : new PeopleV2Error("People v2 pooler connect failed.");
  })();
  try {
    return await poolPromise;
  } catch (error) {
    poolPromise = null;
    throw error;
  }
}

export async function peopleV2Query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  identityId: string = DEFAULT_IDENTITY,
): Promise<T[]> {
  const client = await (await ensurePool()).connect();
  try {
    await client.query("begin");
    await client.query("select people_v2.people_assert_identity($1)", [identityId || DEFAULT_IDENTITY]);
    const result = await client.query<T>(sql, params);
    await client.query("commit");
    return result.rows;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    client.release();
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
    return {};
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function peopleGetMetricFor(
  identityId: string,
  metricId: string,
  options: { asOf?: string | null; grain?: string; jobFamily?: string | null } = {},
): Promise<Record<string, unknown>> {
  const rows = await peopleV2Query<{ payload: Record<string, unknown> }>(
    `select people_v2.people_get_metric_for($1, $2, $3::date, $4, $5) as payload`,
    [
      identityId || DEFAULT_IDENTITY,
      metricId,
      options.asOf ?? null,
      options.grain ?? "trailing_12m",
      options.jobFamily ?? null,
    ],
  );
  return asRecord(rows[0]?.payload);
}

export async function peopleGetMetricBreakdown(
  identityId: string,
  metricId: string,
  dimension: string,
  options: { asOf?: string | null; jobFamily?: string | null } = {},
): Promise<Record<string, unknown>> {
  const rows = await peopleV2Query<{ payload: Record<string, unknown> }>(
    `select people_v2.people_get_metric_breakdown($1, $2, $3, $4::date, $5) as payload`,
    [
      identityId || DEFAULT_IDENTITY,
      metricId,
      dimension,
      options.asOf ?? null,
      options.jobFamily ?? null,
    ],
  );
  return asRecord(rows[0]?.payload);
}

export async function peopleGetMetricTrend(
  identityId: string,
  metricId: string,
  options: { months?: number; jobFamily?: string | null } = {},
): Promise<Record<string, unknown>> {
  const rows = await peopleV2Query<{ payload: Record<string, unknown> }>(
    `select people_v2.people_get_metric_trend($1, $2, $3, $4) as payload`,
    [identityId || DEFAULT_IDENTITY, metricId, options.months ?? 24, options.jobFamily ?? null],
  );
  return asRecord(rows[0]?.payload);
}

export async function peopleGetCase3Signals(
  identityId: string,
  asOf?: string | null,
): Promise<Record<string, unknown>> {
  const rows = await peopleV2Query<{ payload: Record<string, unknown> }>(
    `select people_v2.people_get_case3_signals($1, $2::date) as payload`,
    [identityId || DEFAULT_IDENTITY, asOf ?? null],
  );
  return asRecord(rows[0]?.payload);
}

function formulaPart(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  const record = asRecord(value);
  const expression = record.expression;
  if (typeof expression === "string" && expression.trim()) return expression.trim();
  return "";
}

function metricFormula(numerator: unknown, denominator: unknown): string {
  const num = formulaPart(numerator);
  let den = formulaPart(denominator);
  if (den === "average_headcount") den = "average certified headcount";
  if (num && den) return `${num} / ${den}`;
  return num || den;
}

export async function peopleGetMetricRow(metricId: string): Promise<Record<string, unknown>> {
  const rows = await peopleV2Query(
    `select metric_id, grain_table, numerator, denominator, min_cell, sensitivity, status, yaml_path
     from people_v2.people_metric where metric_id = $1`,
    [metricId],
  );
  const row = asRecord(rows[0]);
  const attrition = metricId === "voluntary_attrition_rate";
  return {
    ...row,
    owner: "People Analytics",
    annualized: attrition,
    time_logic: attrition ? "trailing-12m (annualized)" : "month (as-of)",
    window: attrition ? "trailing-12m (annualized)" : "month (as-of)",
    business_definition:
      metricId === "headcount"
        ? "Certified workers as of month-end. Employment type and status follow BR-WF certified rules. Window is the as-of month, not a trailing average."
        : attrition
          ? "Voluntary terminations in the trailing 12 months divided by average certified headcount, annualized. Month grain is a secondary view."
          : String(row.numerator ?? metricId),
    formula: metricFormula(row.numerator, row.denominator),
    formula_sql: metricFormula(row.numerator, row.denominator),
  };
}

export async function peopleGetLineage(metricId?: string): Promise<Record<string, unknown>[]> {
  if (metricId) {
    return peopleV2Query(
      `select lineage_id, from_object, to_object, via, note
       from people_v2.people_lineage
       where to_object ilike $1 or from_object ilike $1 or note ilike $1
       order by lineage_id`,
      [`%${metricId}%`],
    );
  }
  return peopleV2Query(
    `select lineage_id, from_object, to_object, via, note
     from people_v2.people_lineage order by lineage_id`,
  );
}

export async function peopleGetHealth(metricId: string): Promise<Record<string, unknown>> {
  const rows = await peopleV2Query(
    `select metric_id, status, reason, as_of from people_v2.people_metric_health where metric_id = $1`,
    [metricId],
  );
  return asRecord(rows[0]);
}

export async function peopleGetServingRun(runId = "data-v1"): Promise<Record<string, unknown>> {
  const rows = await peopleV2Query(
    `select run_id, started_at, finished_at, certified, notes, simulator_code_sha, seed
     from people_v2.people_serving_run where run_id = $1`,
    [runId],
  );
  return asRecord(rows[0]);
}

export async function peopleGetQualityCatalog(runId = "data-v1"): Promise<Record<string, unknown>[]> {
  return peopleV2Query(
    `select t.test_name, t.test_id, t.test_group, t.layer, t.object_name, t.test_type, t.blocking,
            coalesce(r.status, t.last_status) as status,
            coalesce(t.last_run_at, null) as last_run_at,
            r.observed_value, r.expected_value, r.details
     from people_v2.people_quality_test t
     left join people_v2.people_quality_result r
       on r.test_name = t.test_name and r.run_id = $1
     order by t.layer, t.test_group, t.test_name`,
    [runId],
  );
}

export async function peopleGetPointer(pointerId: string): Promise<Record<string, unknown>> {
  const rows = await peopleV2Query(
    `select pointer_id, as_of, extract_id, moved, notes
     from people_v2.people_serving_pointer where pointer_id = $1`,
    [pointerId],
  );
  return asRecord(rows[0]);
}

export async function peopleGetIncidents(): Promise<Record<string, unknown>[]> {
  return peopleV2Query(
    `select incident_id, extract_date, source_object, status, isolated, details
     from people_v2.people_quality_incident order by extract_date desc`,
  );
}

export async function peopleGetReplayValues(): Promise<Record<string, unknown>[]> {
  return peopleV2Query(
    `select replay_id, extract_date, metric_id, value_bad, value_expected
     from people_v2.people_replay_metric_value order by extract_date`,
  );
}

export async function peopleGetSkillCoverage(jobFamily: string): Promise<Record<string, unknown>[]> {
  return peopleV2Query(
    `select * from people_v2.people_mart_skill_coverage_monthly
     where job_family = $1
       and month_end = (select max(month_end) from people_v2.people_mart_skill_coverage_monthly)
     order by coverage_ratio
     limit 8`,
    [jobFamily],
  );
}

export async function peopleRpcJson(
  sql: string,
  params: unknown[] = [],
  identityId: string = DEFAULT_IDENTITY,
): Promise<Record<string, unknown>> {
  const rows = await peopleV2Query<{ payload: unknown }>(sql, params, identityId);
  return asRecord(rows[0]?.payload);
}

export async function peopleTryConsumeLlm(
  ipHash: string,
  route: string,
  country?: string | null,
): Promise<Record<string, unknown>> {
  return peopleRpcJson(
    `select people_v2.people_try_consume_llm($1, $2, $3) as payload`,
    [ipHash, route, country ?? null],
  );
}

export async function peopleCompleteLlmCall(input: {
  callId: number;
  traceId?: string | null;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  ok?: boolean;
  latencyMs?: number | null;
}): Promise<void> {
  await peopleV2Query(
    `select people_v2.people_complete_llm_call($1, $2::uuid, $3, $4, $5, $6, $7)`,
    [
      input.callId,
      input.traceId ?? null,
      input.model ?? null,
      input.tokensIn ?? null,
      input.tokensOut ?? null,
      input.ok ?? true,
      input.latencyMs ?? null,
    ],
  );
}

export async function peopleWriteAgentTrace(input: {
  traceId: string;
  identityId: string;
  question: string;
  tier: string;
  snapshotId?: string | null;
  latencyMs?: number | null;
  llmCalls?: number;
  criticOk?: boolean | null;
  llmSkipped?: string | null;
  answerSummary?: unknown;
}): Promise<void> {
  await peopleV2Query(
    `select people_v2.people_write_agent_trace($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      input.traceId,
      input.identityId,
      input.question,
      input.tier,
      input.snapshotId ?? null,
      input.latencyMs ?? null,
      input.llmCalls ?? 0,
      input.criticOk ?? null,
      input.llmSkipped ?? null,
      input.answerSummary == null ? null : JSON.stringify(input.answerSummary),
    ],
    input.identityId,
  );
}

export async function peopleWriteAgentToolCall(input: {
  traceId: string;
  seq: number;
  toolName: string;
  args?: unknown;
  resultSummary?: unknown;
  latencyMs?: number | null;
  rpc?: string | null;
  ok?: boolean;
  error?: string | null;
  identityId?: string;
}): Promise<void> {
  await peopleV2Query(
    `select people_v2.people_write_agent_tool_call($1::uuid, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)`,
    [
      input.traceId,
      input.seq,
      input.toolName,
      JSON.stringify(input.args ?? {}),
      input.resultSummary == null ? null : JSON.stringify(input.resultSummary),
      input.latencyMs ?? null,
      input.rpc ?? null,
      input.ok ?? true,
      input.error ?? null,
    ],
    input.identityId,
  );
}

export async function peopleLogCatalogAccess(input: {
  identityId: string;
  rpc: string;
  metricId?: string | null;
  filters?: unknown;
  rows?: number;
  purpose?: string;
  traceId?: string | null;
}): Promise<void> {
  await peopleV2Query(
    `select people_v2.people_log_catalog_access($1, $2, $3, $4::jsonb, $5, $6, $7)`,
    [
      input.identityId,
      input.rpc,
      input.metricId ?? null,
      JSON.stringify(input.filters ?? {}),
      input.rows ?? 0,
      input.purpose ?? "agent",
      input.traceId ?? null,
    ],
    input.identityId,
  );
}

export async function peopleListEntities(identityId: string): Promise<Record<string, unknown>> {
  return peopleRpcJson(`select people_v2.people_list_entities($1) as payload`, [identityId], identityId);
}

export async function peopleDescribeEntity(
  identityId: string,
  entityId: string,
): Promise<Record<string, unknown>> {
  return peopleRpcJson(
    `select people_v2.people_describe_entity($1, $2) as payload`,
    [identityId, entityId],
    identityId,
  );
}

export async function peopleGetJoinPaths(identityId: string): Promise<Record<string, unknown>> {
  return peopleRpcJson(`select people_v2.people_get_join_paths($1) as payload`, [identityId], identityId);
}

export async function peopleGetSkillCoverageFor(
  identityId: string,
  jobFamily: string,
): Promise<Record<string, unknown>> {
  return peopleRpcJson(
    `select people_v2.people_get_skill_coverage_for($1, $2) as payload`,
    [identityId, jobFamily],
    identityId,
  );
}

export async function peopleListMetrics(identityId: string): Promise<Record<string, unknown>[]> {
  return peopleV2Query(
    `select m.metric_id, m.status, m.sensitivity, m.min_cell, m.grain_table, v.version, h.status as health_status, h.reason as health_reason
     from people_v2.people_metric m
     left join people_v2.people_metric_version v
       on v.metric_id = m.metric_id
      and v.version = (select max(version) from people_v2.people_metric_version x where x.metric_id = m.metric_id)
     left join people_v2.people_metric_health h on h.metric_id = m.metric_id
     where m.status = 'certified'
     order by m.metric_id`,
    [],
    identityId,
  );
}

export async function peopleGetGlossaryTerm(
  identityId: string,
  term: string,
): Promise<Record<string, unknown>[]> {
  return peopleV2Query(
    `select rule_id, domain, kind, statement, params
     from people_v2.people_business_rule
     where rule_id ilike $1 or statement ilike $1 or domain ilike $1
     order by rule_id
     limit 8`,
    [`%${term}%`],
    identityId,
  );
}

export async function peopleGetIdentityRow(identityId: string): Promise<Record<string, unknown>> {
  const rows = await peopleV2Query(
    `select identity_id, role, sensitivity_max, grain_max, label
     from people_v2.people_policy_demo_identity where identity_id = $1`,
    [identityId],
    identityId,
  );
  return asRecord(rows[0]);
}
