import { isoDate } from "./format";

export function previousMonthEnd(asOf: string): string {
  const iso = isoDate(asOf);
  if (!iso) return "";
  const [year, month] = iso.split("-").map(Number);
  if (!year || !month) return "";
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

export const CASE3_SCENARIO_START = "2026-03";
export const CASE3_TREND_MONTHS = 24;
export const TOP_BREAKDOWN_ROWS = 8;

export function finiteRate(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function attritionHeadline(payload: {
  t12m: unknown;
  rate: unknown;
  prior?: unknown;
  where?: string;
  asOf?: string;
}) {
  const t12m = finiteRate(payload.t12m);
  const t12mLabel = t12m == null ? "n/a" : `${(t12m * 100).toFixed(1)}%`;
  const current = finiteRate(payload.rate);
  const previous = finiteRate(payload.prior);
  const monthLabel = current == null ? "n/a" : `${(current * 100).toFixed(1)}%`;
  const asOf = isoDate(payload.asOf) || "2026-08-31";
  const priorMonth = (previousMonthEnd(asOf) || "2026-07-31").slice(0, 7);
  const where = payload.where || "a small set of locations";
  const deltaPp = current != null && previous != null ? (current - previous) * 100 : null;
  const monthClause =
    deltaPp == null
      ? ""
      : Math.abs(deltaPp) < 0.25
        ? `The month view is ${monthLabel}, roughly unchanged from ${priorMonth}.`
        : `The month view is ${monthLabel}, ${deltaPp >= 0 ? "up" : "down"} ${Math.abs(deltaPp).toFixed(1)} pp from ${priorMonth}.`;
  return `Engineering trailing-12m annualized voluntary attrition is ${t12mLabel} (as-of ${asOf}).${monthClause ? ` ${monthClause}` : ""} Concentrated in ${where} among cells visible at this access level.`;
}

export function visibleBreakdownCells(cells: Record<string, unknown>[]) {
  return cells.filter((row) => row.suppressed !== true && finiteRate(row.value) != null);
}

export function rankVisibleCells(cells: Record<string, unknown>[]) {
  return [...visibleBreakdownCells(cells)].sort((a, b) => Number(b.value) - Number(a.value));
}

function cellTerms(row: Record<string, unknown>, n: number, trailing: boolean): number {
  const termsRaw = finiteRate(row.terms_vol);
  if (termsRaw != null) return termsRaw;
  const value = finiteRate(row.value);
  if (value == null || n <= 0) return 0;
  return trailing ? value * n : (value * n) / 12;
}

function isTrailing12m(row: Record<string, unknown>) {
  return (
    row.grain === "trailing_12m" ||
    String(row.window ?? "").includes("trailing-12m") ||
    Number.isFinite(Number(row.avg_hc))
  );
}

/** Location concentration from cells still visible after this identity's min-cell rule. */
export function concentrationLocationFromVisible(cells: Record<string, unknown>[]): string | undefined {
  const visible = visibleBreakdownCells(cells);
  const trailing = visible.some(isTrailing12m);
  const byLocation = new Map<string, { terms: number; n: number }>();
  for (const row of visible) {
    const location = String(row.location_id ?? "").trim();
    if (!location) continue;
    const n = Number(row.avg_hc ?? row.n ?? 0);
    const current = byLocation.get(location) ?? { terms: 0, n: 0 };
    current.terms += cellTerms(row, n, trailing);
    current.n += n;
    byLocation.set(location, current);
  }
  let best: { location: string; rate: number } | undefined;
  for (const [location, agg] of byLocation) {
    if (agg.n <= 0) continue;
    const rate = trailing ? agg.terms / agg.n : (agg.terms * 12) / agg.n;
    if (!best || rate > best.rate) best = { location, rate };
  }
  return best?.location;
}

export function aggregateVisibleBy(
  cells: Record<string, unknown>[],
  keyName: "location_id" | "tenure_band",
): Array<{ key: string; rate: number; n: number }> {
  const visible = visibleBreakdownCells(cells);
  const trailing = visible.some(isTrailing12m);
  const groups = new Map<string, { terms: number; n: number }>();
  for (const row of visible) {
    const key = String(row[keyName] ?? "").trim();
    if (!key) continue;
    const n = Number(row.avg_hc ?? row.n ?? 0);
    const current = groups.get(key) ?? { terms: 0, n: 0 };
    current.terms += cellTerms(row, n, trailing);
    current.n += n;
    groups.set(key, current);
  }
  const out: Array<{ key: string; rate: number; n: number }> = [];
  for (const [key, agg] of groups) {
    if (agg.n <= 0) continue;
    out.push({
      key,
      n: agg.n,
      rate: trailing ? agg.terms / agg.n : (agg.terms * 12) / agg.n,
    });
  }
  return out.sort((a, b) => b.rate - a.rate);
}

export function normalizeTrendPoints(raw: unknown): Array<{ as_of: string; value: number }> {
  const rows = Array.isArray(raw) ? raw : [];
  const points: Array<{ as_of: string; value: number }> = [];
  for (const row of rows) {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const asOf = isoDate(record.as_of);
    const value = finiteRate(record.value);
    if (!asOf || value == null) continue;
    points.push({ as_of: asOf, value });
  }
  return points.sort((a, b) => a.as_of.localeCompare(b.as_of));
}

export function trendChartModel(raw: unknown) {
  const points = normalizeTrendPoints(raw);
  if (points.length === 0) {
    return {
      status: "error" as const,
      points: [],
      message:
        "Trend data is unavailable for Engineering voluntary attrition (trailing-12m). The serving RPC returned no usable points.",
    };
  }
  const scenario = points.find((point) => point.as_of.startsWith(CASE3_SCENARIO_START));
  return {
    status: "ok" as const,
    points,
    scenarioAsOf: scenario?.as_of ?? null,
    message: null,
  };
}
