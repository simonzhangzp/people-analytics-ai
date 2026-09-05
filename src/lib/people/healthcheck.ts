import "server-only";

import { peopleRpcJson } from "./v2-client";
import { peopleV2Configured } from "./v2-config";

export type PeopleHealthcheckStatus = {
  consecutiveDays: number;
  lastRunDate: string | null;
  lastOk: boolean | null;
  frozenAsOf: string;
};

const EMPTY: PeopleHealthcheckStatus = {
  consecutiveDays: 0,
  lastRunDate: null,
  lastOk: null,
  frozenAsOf: "2026-08-31",
};

export async function loadHealthcheckStatus(): Promise<PeopleHealthcheckStatus> {
  if (!peopleV2Configured()) return EMPTY;
  try {
    const payload = await peopleRpcJson(`select people_v2.people_healthcheck_status() as payload`);
    const last = payload.last_run_date;
    return {
      consecutiveDays: Number(payload.consecutive_days) || 0,
      lastRunDate: last == null ? null : String(last).slice(0, 10),
      lastOk: typeof payload.last_ok === "boolean" ? payload.last_ok : null,
      frozenAsOf: String(payload.frozen_as_of ?? "2026-08-31"),
    };
  } catch {
    return EMPTY;
  }
}

export async function runServingHealthcheck(): Promise<Record<string, unknown>> {
  return peopleRpcJson(`select people_v2.people_run_serving_healthcheck() as payload`);
}
