import { asList, asRecord } from "../format";
import { aggregateVisibleBy } from "../case3-view";
import type { PeopleAnswerContract, PeopleCriticResult, PeopleObservedFact } from "./types";

const EPS = 1e-6;

function extractPercents(text: string): number[] {
  const out: number[] = [];
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    out.push(Number(match[1]) / 100);
  }
  return out;
}

function toolRatesAndCounts(evidence: unknown[]): { rates: number[]; counts: number[] } {
  const rates: number[] = [];
  const counts: number[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const row = asRecord(value);
    if (row.denied === true || row.suppressed === true) return;
    if (row.value != null && row.value !== "") {
      const n = typeof row.value === "number" ? row.value : Number(row.value);
      if (Number.isFinite(n)) {
        if (row.unit === "rate" || (n > 0 && n <= 1.5 && row.unit !== "count")) rates.push(n);
        else counts.push(n);
      }
    }
    if (row.coverage_ratio != null && row.coverage_ratio !== "") {
      const ratio =
        typeof row.coverage_ratio === "number" ? row.coverage_ratio : Number(row.coverage_ratio);
      if (Number.isFinite(ratio)) rates.push(ratio);
    }
    visit(row.cells);
    visit(row.rows);
    visit(row.points);
  };
  evidence.forEach(visit);
  for (const item of evidence) {
    const cells = asList(asRecord(item).cells);
    if (!cells.length) continue;
    for (const key of ["location_id", "tenure_band"] as const) {
      for (const agg of aggregateVisibleBy(cells, key)) {
        rates.push(agg.rate);
      }
    }
  }
  return { rates, counts };
}

function closeTo(value: number, pool: number[]): boolean {
  return pool.some((item) => Math.abs(item - value) <= Math.max(EPS, Math.abs(item) * 0.02));
}

export function criticCheck(input: {
  observed: { headline: string; facts: PeopleObservedFact[] };
  evidence: unknown[];
}): PeopleCriticResult {
  const failures: string[] = [];
  const { rates, counts } = toolRatesAndCounts(input.evidence);
  if (rates.length) {
    for (const rate of extractPercents(input.observed.headline)) {
      if (!closeTo(rate, rates)) {
        failures.push(`headline percent ${(rate * 100).toFixed(1)}% is not in tool results`);
      }
    }
  }
  for (const fact of input.observed.facts) {
    if (typeof fact.value !== "number" || fact.denied === true || fact.suppressed === true) continue;
    const isRate = fact.unit === "rate" || (fact.value >= 0 && fact.value <= 1.5);
    const pool = isRate ? rates : counts;
    if (pool.length && !closeTo(fact.value, pool) && !closeTo(fact.value, [...rates, ...counts])) {
      failures.push(`fact value ${fact.value} is not in tool results`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function applyCritic(answer: PeopleAnswerContract, critic: PeopleCriticResult): PeopleAnswerContract {
  if (critic.ok) return { ...answer, critic };
  const withheld = "Tool results and narrative did not reconcile — answer withheld";
  return {
    ...answer,
    critic,
    withheld: true,
    error_state: "critic",
    supported: false,
    headline: withheld,
    facts: [],
    interpretation: [],
    observed: { headline: withheld, facts: [] },
    hypotheses: [],
  };
}
