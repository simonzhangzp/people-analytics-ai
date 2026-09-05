import "server-only";

import { DEFAULT_IDENTITY } from "./demo-identities";
import {
  CERTIFIED_AS_OF,
  PARITY_HEADCOUNT,
  PEOPLE_DATA_DOMAINS,
  SERVING_FRESHNESS_LABEL,
  WORKFORCE_HISTORY_YEARS,
} from "./parity-home";
import { peopleGetMetricFor, peopleV2Query } from "./v2-client";

export {
  CERTIFIED_AS_OF,
  PARITY_HEADCOUNT,
  PEOPLE_DATA_DOMAINS,
  SERVING_FRESHNESS_LABEL,
  WORKFORCE_HISTORY_YEARS,
};

export type HomePlatformFacts = {
  headcount: number | null;
  certifiedMetrics: number | null;
  qualityTests: number | null;
  freshness: string;
  asOf: string;
  years: number;
  domains: number;
};

function asCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadHomePlatformFacts(): Promise<HomePlatformFacts> {
  const [metric, metrics, tests] = await Promise.all([
    peopleGetMetricFor(DEFAULT_IDENTITY, "headcount", {
      grain: "month",
      asOf: CERTIFIED_AS_OF,
    }),
    peopleV2Query<{ n: number }>("select count(*)::int as n from people_v2.people_metric"),
    peopleV2Query<{ n: number }>("select count(*)::int as n from people_v2.people_quality_test"),
  ]);
  return {
    headcount: asCount(metric.value),
    certifiedMetrics: asCount(metrics[0]?.n),
    qualityTests: asCount(tests[0]?.n),
    freshness: SERVING_FRESHNESS_LABEL,
    asOf: CERTIFIED_AS_OF,
    years: WORKFORCE_HISTORY_YEARS,
    domains: PEOPLE_DATA_DOMAINS,
  };
}

export function emptyHomePlatformFacts(): HomePlatformFacts {
  return {
    headcount: null,
    certifiedMetrics: null,
    qualityTests: null,
    freshness: SERVING_FRESHNESS_LABEL,
    asOf: CERTIFIED_AS_OF,
    years: WORKFORCE_HISTORY_YEARS,
    domains: PEOPLE_DATA_DOMAINS,
  };
}

export function assertFactsMatchParity(facts: HomePlatformFacts) {
  if (facts.headcount !== PARITY_HEADCOUNT) {
    throw new Error(
      `Homepage certified headcount ${String(facts.headcount)} does not match parity ${PARITY_HEADCOUNT}`,
    );
  }
  if (facts.asOf !== CERTIFIED_AS_OF) {
    throw new Error(`Homepage as_of ${facts.asOf} does not match ${CERTIFIED_AS_OF}`);
  }
  if (facts.freshness !== SERVING_FRESHNESS_LABEL) {
    throw new Error(`Homepage freshness label drifted from ${SERVING_FRESHNESS_LABEL}`);
  }
}
