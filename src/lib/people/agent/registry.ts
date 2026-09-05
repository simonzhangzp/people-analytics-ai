import "server-only";

import { asList, asRecord, isoDate } from "../format";
import { MICROSOFT_LEARN_CATALOG } from "../learn-catalog";
import {
  peopleDescribeEntity,
  peopleGetHealth,
  peopleGetIncidents,
  peopleGetJoinPaths,
  peopleGetLineage,
  peopleGetMetricBreakdown,
  peopleGetMetricFor,
  peopleGetMetricRow,
  peopleGetMetricTrend,
  peopleGetPointer,
  peopleGetQualityCatalog,
  peopleGetReplayValues,
  peopleGetServingRun,
  peopleGetSkillCoverageFor,
  peopleGetGlossaryTerm,
  peopleGetIdentityRow,
  peopleListEntities,
  peopleListMetrics,
  peopleLogCatalogAccess,
} from "../v2-client";
import { PEOPLE_TOOL_NAMES, type PeopleRegistryToolName, type PeopleToolCall } from "./types";

export { PEOPLE_TOOL_NAMES };

const SENSITIVITY_RANK: Record<string, number> = {
  public: 1,
  internal: 2,
  confidential: 3,
  restricted: 4,
};

function argString(args: PeopleToolCall["args"], key: string): string | undefined {
  const value = args?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function argNumber(args: PeopleToolCall["args"], key: string): number | undefined {
  const value = args?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function summarize(result: unknown): Record<string, unknown> {
  const row = asRecord(result);
  const cells = asList(row.cells);
  const suppressed = cells.filter((cell) => cell.suppressed === true).length;
  return {
    metric_id: row.metric_id ?? null,
    value: typeof row.value === "number" ? row.value : null,
    denied: row.denied === true,
    as_of: isoDate(row.as_of) || null,
    cell_count: cells.length || null,
    cells_suppressed: suppressed || Number(row.cells_suppressed ?? 0) || null,
    row_count: Array.isArray(row.rows) ? row.rows.length : Array.isArray(row.tests) ? row.tests.length : null,
  };
}

async function withCatalogLog<T>(
  identityId: string,
  rpc: string,
  purpose: string,
  traceId: string | undefined,
  metricId: string | null | undefined,
  filters: Record<string, unknown>,
  work: () => Promise<T>,
): Promise<T> {
  const result = await work();
  const rows = Array.isArray(result)
    ? result.length
    : Array.isArray(asRecord(result as object).rows)
      ? asList(asRecord(result as object).rows).length
      : 1;
  try {
    await peopleLogCatalogAccess({
      identityId,
      rpc,
      metricId,
      filters,
      rows,
      purpose,
      traceId: traceId ?? null,
    });
  } catch {
    /* access_log must not fail the tool */
  }
  return result;
}

export async function executeRegistryTool(input: {
  call: PeopleToolCall;
  identityId: string;
  purpose: "agent" | "mcp";
  traceId?: string;
  allowReplay?: boolean;
}): Promise<{ ok: true; result: unknown; summary: Record<string, unknown>; rpc: string } | { ok: false; error: string; rpc: string }> {
  const { call, identityId, purpose, traceId } = input;
  const args = call.args ?? {};
  const metricId = argString(args, "metric_id");
  const jobFamily = argString(args, "job_family") ?? null;
  const grain = argString(args, "grain");
  const dimension = argString(args, "dimension");
  const snapshot = argString(args, "snapshot_id");
  const replay = snapshot === "incident_replay";
  if (replay && !input.allowReplay) {
    return { ok: false, error: "incident_replay is not in scope for this caller", rpc: call.name };
  }

  try {
    switch (call.name) {
      case "list_metrics": {
        const rows = await withCatalogLog(identityId, "people_list_metrics", purpose, traceId, null, {}, () =>
          peopleListMetrics(identityId),
        );
        const ident = await peopleGetIdentityRow(identityId);
        const max = SENSITIVITY_RANK[String(ident.sensitivity_max ?? "internal")] ?? 2;
        const filtered = rows.filter(
          (row) => (SENSITIVITY_RANK[String(row.sensitivity ?? "internal")] ?? 2) <= max,
        );
        return { ok: true, result: { metrics: filtered }, summary: { row_count: filtered.length }, rpc: "people_metric" };
      }
      case "get_metric": {
        if (!metricId) return { ok: false, error: "metric_id is required", rpc: "people_get_metric_for" };
        const payload = await peopleGetMetricFor(identityId, metricId, {
          grain: grain ?? undefined,
          jobFamily,
        });
        const health = await peopleGetHealth(metricId);
        const merged = {
          ...payload,
          metric_version: 1,
          quality_status: String(health.status ?? "unknown"),
          health_reason: health.reason ?? null,
          asOf: isoDate(payload.as_of) || isoDate(payload.asOf),
          as_of: isoDate(payload.as_of) || isoDate(payload.asOf),
        };
        return { ok: true, result: merged, summary: summarize(merged), rpc: "people_get_metric_for" };
      }
      case "get_metric_trend": {
        if (!metricId) return { ok: false, error: "metric_id is required", rpc: "people_get_metric_trend" };
        const payload = await peopleGetMetricTrend(identityId, metricId, {
          months: argNumber(args, "months") ?? 24,
          jobFamily,
        });
        return { ok: true, result: payload, summary: summarize(payload), rpc: "people_get_metric_trend" };
      }
      case "get_metric_breakdown": {
        if (!metricId) return { ok: false, error: "metric_id is required", rpc: "people_get_metric_breakdown" };
        const payload = await peopleGetMetricBreakdown(identityId, metricId, dimension ?? "tenure_band", {
          jobFamily,
        });
        return { ok: true, result: payload, summary: summarize(payload), rpc: "people_get_metric_breakdown" };
      }
      case "get_metric_definition": {
        if (!metricId) return { ok: false, error: "metric_id is required", rpc: "people_metric" };
        const row = await withCatalogLog(
          identityId,
          "people_get_metric_definition",
          purpose,
          traceId,
          metricId,
          {},
          () => peopleGetMetricRow(metricId),
        );
        const health = await peopleGetHealth(metricId);
        return {
          ok: true,
          result: { ...row, version: 1, quality_status: health.status },
          summary: { metric_id: metricId },
          rpc: "people_metric",
        };
      }
      case "list_entities": {
        const payload = await peopleListEntities(identityId);
        await peopleLogCatalogAccess({
          identityId,
          rpc: "people_list_entities",
          purpose,
          traceId: traceId ?? null,
          rows: asList(payload.entities).length,
        });
        return { ok: true, result: payload, summary: { row_count: asList(payload.entities).length }, rpc: "people_list_entities" };
      }
      case "describe_entity": {
        const entityId = argString(args, "entity_id") ?? "worker";
        const payload = await peopleDescribeEntity(identityId, entityId);
        await peopleLogCatalogAccess({
          identityId,
          rpc: "people_describe_entity",
          purpose,
          traceId: traceId ?? null,
          filters: { entity_id: entityId },
          rows: asList(payload.attributes).length,
        });
        return { ok: true, result: payload, summary: { entity_id: entityId }, rpc: "people_describe_entity" };
      }
      case "get_join_paths": {
        const payload = await peopleGetJoinPaths(identityId);
        await peopleLogCatalogAccess({
          identityId,
          rpc: "people_get_join_paths",
          purpose,
          traceId: traceId ?? null,
          rows: asList(payload.allowed_edges).length,
        });
        return { ok: true, result: payload, summary: summarize(payload), rpc: "people_get_join_paths" };
      }
      case "get_glossary_term": {
        const term = argString(args, "term") ?? metricId ?? "headcount";
        const rules = await withCatalogLog(
          identityId,
          "people_get_glossary_term",
          purpose,
          traceId,
          metricId,
          { term },
          () => peopleGetGlossaryTerm(identityId, term),
        );
        return {
          ok: true,
          result: { term, rules, found: rules.length > 0 },
          summary: { row_count: rules.length },
          rpc: "people_business_rule",
        };
      }
      case "get_lineage": {
        const rows = await withCatalogLog(
          identityId,
          "people_get_lineage",
          purpose,
          traceId,
          metricId,
          { metric_id: metricId ?? null },
          () => peopleGetLineage(metricId),
        );
        return { ok: true, result: { lineage: rows, metric_id: metricId ?? null }, summary: { row_count: rows.length }, rpc: "people_lineage" };
      }
      case "get_source_health": {
        const pointerId = replay ? "incident_replay" : "current_certified";
        const pointer = await peopleGetPointer(pointerId);
        const health = await peopleGetHealth(metricId ?? "headcount");
        const payload = {
          snapshot_id: pointerId,
          pointer,
          metric_id: metricId ?? "headcount",
          quality_status: replay ? "blocked" : String(health.status ?? "unknown"),
          health_reason: replay
            ? "Incident replay: downstream Headcount reporting is blocked until the extract is complete."
            : health.reason,
        };
        await peopleLogCatalogAccess({
          identityId,
          rpc: "people_get_source_health",
          purpose,
          traceId: traceId ?? null,
          metricId: metricId ?? "headcount",
          filters: { snapshot_id: pointerId },
        });
        return { ok: true, result: payload, summary: { quality_status: payload.quality_status }, rpc: "people_serving_pointer" };
      }
      case "get_quality_tests": {
        const tests = await withCatalogLog(
          identityId,
          "people_get_quality_tests",
          purpose,
          traceId,
          null,
          { run_id: "data-v1" },
          () => peopleGetQualityCatalog("data-v1"),
        );
        return { ok: true, result: { tests, run_id: "data-v1" }, summary: { row_count: tests.length }, rpc: "people_quality_test" };
      }
      case "get_quality_incidents": {
        const incidents = await withCatalogLog(
          identityId,
          "people_get_quality_incidents",
          purpose,
          traceId,
          null,
          { snapshot_id: snapshot ?? null },
          () => peopleGetIncidents(),
        );
        const replayValues = replay ? await peopleGetReplayValues() : [];
        return {
          ok: true,
          result: { incidents, replay_values: replayValues, snapshot_id: snapshot ?? "current_certified" },
          summary: { row_count: incidents.length },
          rpc: "people_quality_incident",
        };
      }
      case "get_serving_snapshot": {
        const pointer = await peopleGetPointer(replay ? "incident_replay" : "current_certified");
        const run = await peopleGetServingRun("data-v1");
        const payload = {
          pointer,
          run,
          run_id: "data-v1",
          snapshot_id: replay ? "incident_replay" : "current_certified",
        };
        await peopleLogCatalogAccess({
          identityId,
          rpc: "people_get_serving_snapshot",
          purpose,
          traceId: traceId ?? null,
        });
        return { ok: true, result: payload, summary: { run_id: "data-v1" }, rpc: "people_serving_run" };
      }
      case "get_skill_coverage": {
        const family = jobFamily ?? "Engineering";
        const payload = await peopleGetSkillCoverageFor(identityId, family);
        const learn = MICROSOFT_LEARN_CATALOG.slice(0, 5).map((item) => ({
          title: item.title,
          url: item.url,
        }));
        const result = { ...payload, learn };
        await peopleLogCatalogAccess({
          identityId,
          rpc: "people_get_skill_coverage_for",
          purpose,
          traceId: traceId ?? null,
          filters: { job_family: family },
          rows: asList(payload.rows).length,
        });
        return { ok: true, result, summary: { row_count: asList(payload.rows).length }, rpc: "people_get_skill_coverage_for" };
      }
      default: {
        const neverName: never = call.name;
        return { ok: false, error: `unknown tool: ${String(neverName)}`, rpc: "unknown" };
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "tool failed",
      rpc: call.name,
    };
  }
}

export function mcpToolDescriptors(): Array<{
  name: PeopleRegistryToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  const metric = {
    type: "object",
    properties: {
      metric_id: { type: "string" },
      job_family: { type: "string" },
      grain: { type: "string", enum: ["trailing_12m", "month"] },
    },
  };
  return [
    { name: "list_metrics", description: "Certified metrics visible to the current identity.", inputSchema: { type: "object", properties: {} } },
    { name: "get_metric", description: "Scalar certified metric value. Denied metrics return value=null.", inputSchema: metric },
    { name: "get_metric_trend", description: "Monthly trend for a certified metric.", inputSchema: { type: "object", properties: { metric_id: { type: "string" }, job_family: { type: "string" }, months: { type: "number" } } } },
    { name: "get_metric_breakdown", description: "Aggregate breakdown with automatic min-cell suppression.", inputSchema: { type: "object", properties: { metric_id: { type: "string" }, dimension: { type: "string" }, job_family: { type: "string" } } } },
    { name: "get_metric_definition", description: "Business definition, formula, owner, and version.", inputSchema: { type: "object", properties: { metric_id: { type: "string" } } } },
    { name: "list_entities", description: "Ontology entities filtered by sensitivity.", inputSchema: { type: "object", properties: {} } },
    { name: "describe_entity", description: "Attributes for one entity. PII fields hidden at this access level.", inputSchema: { type: "object", properties: { entity_id: { type: "string" } } } },
    { name: "get_join_paths", description: "Allowed and denied join edges. No SQL.", inputSchema: { type: "object", properties: {} } },
    { name: "get_glossary_term", description: "Business-rule glossary term.", inputSchema: { type: "object", properties: { term: { type: "string" } } } },
    { name: "get_lineage", description: "Lineage edges for a metric or object.", inputSchema: { type: "object", properties: { metric_id: { type: "string" } } } },
    { name: "get_source_health", description: "Pointer and metric health for the current certified snapshot.", inputSchema: { type: "object", properties: { metric_id: { type: "string" } } } },
    { name: "get_quality_tests", description: "Quality tests for the data-v1 run.", inputSchema: { type: "object", properties: {} } },
    { name: "get_quality_incidents", description: "Historical quality incidents. Not current certified values.", inputSchema: { type: "object", properties: {} } },
    { name: "get_serving_snapshot", description: "Current certified serving pointer and run.", inputSchema: { type: "object", properties: {} } },
    { name: "get_skill_coverage", description: "Job-family skill coverage aggregates. No worker lists.", inputSchema: { type: "object", properties: { job_family: { type: "string" } } } },
  ];
}
