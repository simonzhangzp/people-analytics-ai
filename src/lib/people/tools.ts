import { DEFAULT_IDENTITY } from "./demo-identities";
import {
  peopleGetCase3Signals,
  peopleGetHealth,
  peopleGetIncidents,
  peopleGetLineage,
  peopleGetMetricBreakdown,
  peopleGetMetricFor,
  peopleGetMetricRow,
  peopleGetMetricTrend,
  peopleGetPointer,
  peopleGetSkillCoverage,
} from "./v2-client";

export type PeopleToolName =
  | "get_metric_definition"
  | "get_metric_value"
  | "get_metric_trend"
  | "breakdown_metric"
  | "get_source_health"
  | "get_quality_incidents"
  | "trace_lineage"
  | "get_workforce_analysis"
  | "get_skill_gap"
  | "get_learning_recommendations";

export interface PeopleToolCall {
  name: PeopleToolName;
  args?: Record<string, string | number | undefined>;
}

const METRIC_ALIAS: Record<string, string> = {
  voluntary_attrition: "voluntary_attrition_rate",
  compa_ratio: "compa_ratio_median",
};

function metricId(raw: string | undefined): string {
  if (!raw) throw new Error("metric_id is required");
  return METRIC_ALIAS[raw] ?? raw;
}

export async function runPeopleTool(call: PeopleToolCall): Promise<unknown> {
  const args = call.args ?? {};
  const identity = DEFAULT_IDENTITY;
  const jobFamily = typeof args.job_family === "string" ? args.job_family : undefined;
  const metric = typeof args.metric_id === "string" ? metricId(args.metric_id) : undefined;
  const skillId = typeof args.skill_id === "string" ? args.skill_id : undefined;
  const dimension = typeof args.dimension === "string" ? args.dimension : "job_family";
  const replay = args.snapshot_id === "incident_replay";

  switch (call.name) {
    case "get_metric_definition":
      return peopleGetMetricRow(metricId(metric));
    case "get_metric_value":
      return peopleGetMetricFor(identity, metricId(metric), { jobFamily: jobFamily ?? null });
    case "get_metric_trend":
      return peopleGetMetricTrend(identity, metricId(metric), { jobFamily: jobFamily ?? null });
    case "breakdown_metric":
      return peopleGetMetricBreakdown(identity, metricId(metric), dimension, {
        jobFamily: jobFamily ?? null,
      });
    case "get_source_health":
      return replay
        ? {
            snapshot_id: "incident_replay",
            pointer: await peopleGetPointer("incident_replay"),
            quality_status: "failed",
          }
        : { snapshot_id: "current_certified", pointer: await peopleGetPointer("current_certified") };
    case "get_quality_incidents":
      return { incidents: await peopleGetIncidents() };
    case "trace_lineage":
      return { lineage: await peopleGetLineage(metric), snapshot_id: replay ? "incident_replay" : "current" };
    case "get_workforce_analysis":
      return {
        metric: await peopleGetMetricFor(identity, "voluntary_attrition_rate", {
          grain: "month",
          jobFamily: jobFamily ?? "Engineering",
        }),
        signals: await peopleGetCase3Signals(identity),
        health: await peopleGetHealth("voluntary_attrition_rate"),
      };
    case "get_skill_gap":
      return { gaps: await peopleGetSkillCoverage(jobFamily ?? "Engineering") };
    case "get_learning_recommendations":
      return {
        recommendations: [],
        note: "Learning recommendations stay on the v1 RPC until Phase 4 agent upgrade.",
        skill_id: skillId ?? null,
      };
    default:
      throw new Error("Unsupported People tool");
  }
}
