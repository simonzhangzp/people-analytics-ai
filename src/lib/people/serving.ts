import { createClient } from "@supabase/supabase-js";
import { PEOPLE_RPC } from "./tables";

export class PeopleServingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeopleServingError";
  }
}

export function peopleServingConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

function servingClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new PeopleServingError("People serving is not configured.");
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function peopleRpc<T = Record<string, unknown>>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const client = servingClient();
  const filtered = Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== undefined),
  );
  const { data, error } = await client.rpc(name as never, filtered as never);
  if (error) {
    throw new PeopleServingError(error.message);
  }
  return data as T;
}

export const peopleServing = {
  getMetric: (
    metricId: string,
    options: { asOf?: string; jobFamily?: string; orgId?: string; locationId?: string } = {},
  ) =>
    peopleRpc(PEOPLE_RPC.getMetric, {
      p_metric_id: metricId,
      p_as_of: options.asOf ?? null,
      p_job_family: options.jobFamily ?? null,
      p_org_id: options.orgId ?? null,
      p_location_id: options.locationId ?? null,
    }),
  getMetricTrend: (metricId: string, options: { months?: number; jobFamily?: string } = {}) =>
    peopleRpc(PEOPLE_RPC.getMetricTrend, {
      p_metric_id: metricId,
      p_months: options.months ?? 12,
      p_job_family: options.jobFamily ?? null,
    }),
  getMetricBreakdown: (
    metricId: string,
    dimension: string,
    options: { jobFamily?: string } = {},
  ) =>
    peopleRpc(PEOPLE_RPC.getMetricBreakdown, {
      p_metric_id: metricId,
      p_dimension: dimension,
      p_job_family: options.jobFamily ?? null,
    }),
  getMetricDefinition: (metricId: string) =>
    peopleRpc(PEOPLE_RPC.getMetricDefinition, { p_metric_id: metricId }),
  getWorkforceOverview: (jobFamily?: string) =>
    peopleRpc(PEOPLE_RPC.getWorkforceOverview, { p_job_family: jobFamily ?? null }),
  getRetentionAnalysis: (jobFamily = "Engineering") =>
    peopleRpc(PEOPLE_RPC.getRetentionAnalysis, { p_job_family: jobFamily }),
  getMobilityAnalysis: (jobFamily?: string) =>
    peopleRpc(PEOPLE_RPC.getMobilityAnalysis, { p_job_family: jobFamily ?? null }),
  getRecruitingAnalysis: (jobFamily?: string) =>
    peopleRpc(PEOPLE_RPC.getRecruitingAnalysis, { p_job_family: jobFamily ?? null }),
  getLearningAnalysis: (jobFamily?: string) =>
    peopleRpc(PEOPLE_RPC.getLearningAnalysis, { p_job_family: jobFamily ?? null }),
  getSkillGap: (jobFamily = "Engineering") =>
    peopleRpc(PEOPLE_RPC.getSkillGap, { p_job_family: jobFamily }),
  getLearningRecommendations: (jobFamily = "Engineering", skillId?: string) =>
    peopleRpc(PEOPLE_RPC.getLearningRecommendations, {
      p_job_family: jobFamily,
      p_skill_id: skillId ?? null,
    }),
  getQualityIncidents: (snapshotId: "current" | "incident_replay" = "current") =>
    peopleRpc(PEOPLE_RPC.getQualityIncidents, { p_snapshot_id: snapshotId }),
  getSourceHealth: (snapshotId: "current" | "incident_replay" = "current") =>
    peopleRpc(PEOPLE_RPC.getSourceHealth, { p_snapshot_id: snapshotId }),
  traceLineage: (metricId: string, snapshotId: "current" | "incident_replay" = "current") =>
    peopleRpc(PEOPLE_RPC.traceMetricLineage, {
      p_metric_id: metricId,
      p_snapshot_id: snapshotId,
    }),
  getDataFoundation: () => peopleRpc(PEOPLE_RPC.getDataFoundation),
  getPlatformFacts: () => peopleRpc(PEOPLE_RPC.getPlatformFacts),
  getServingSnapshot: (snapshotId: "current" | "incident_replay" = "current") =>
    peopleRpc(PEOPLE_RPC.getServingSnapshot, { p_snapshot_id: snapshotId }),
  listQualityTests: async (snapshotId: "current" | "incident_replay" = "current") => {
    const payload = await peopleRpc<{ tests?: QualityTestRow[] }>(PEOPLE_RPC.getQualityTests, {
      p_snapshot_id: snapshotId,
    });
    return payload.tests ?? [];
  },
};

export type QualityTestRow = {
  test_name: string;
  test_group?: string | null;
  status: string;
  observed_value?: string | number | null;
  expected_value?: string | number | null;
  details?: unknown;
  source_name?: string | null;
  checked_at?: string | null;
};
