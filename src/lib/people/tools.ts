import { peopleServing } from "./serving";

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

export async function runPeopleTool(call: PeopleToolCall): Promise<unknown> {
  const args = call.args ?? {};
  const snapshot =
    args.snapshot_id === "incident_replay" ? "incident_replay" : "current";
  const jobFamily = typeof args.job_family === "string" ? args.job_family : undefined;
  const metricId = typeof args.metric_id === "string" ? args.metric_id : undefined;
  const skillId = typeof args.skill_id === "string" ? args.skill_id : undefined;
  const dimension = typeof args.dimension === "string" ? args.dimension : "job_family";

  switch (call.name) {
    case "get_metric_definition":
      if (!metricId) throw new Error("metric_id is required");
      return peopleServing.getMetricDefinition(metricId);
    case "get_metric_value":
      if (!metricId) throw new Error("metric_id is required");
      return peopleServing.getMetric(metricId, { jobFamily });
    case "get_metric_trend":
      if (!metricId) throw new Error("metric_id is required");
      return peopleServing.getMetricTrend(metricId, { jobFamily });
    case "breakdown_metric":
      if (!metricId) throw new Error("metric_id is required");
      return peopleServing.getMetricBreakdown(metricId, dimension, { jobFamily });
    case "get_source_health":
      return peopleServing.getSourceHealth(snapshot);
    case "get_quality_incidents":
      return peopleServing.getQualityIncidents(snapshot);
    case "trace_lineage":
      if (!metricId) throw new Error("metric_id is required");
      return peopleServing.traceLineage(metricId, snapshot);
    case "get_workforce_analysis":
      return peopleServing.getRetentionAnalysis(jobFamily ?? "Engineering");
    case "get_skill_gap":
      return peopleServing.getSkillGap(jobFamily ?? "Engineering");
    case "get_learning_recommendations":
      return peopleServing.getLearningRecommendations(jobFamily ?? "Engineering", skillId);
    default:
      throw new Error("Unsupported People tool");
  }
}
