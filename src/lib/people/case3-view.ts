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

export function attritionHeadline(payload: {
  t12m: unknown;
  rate: unknown;
  prior?: unknown;
  where?: string;
}) {
  const t12m = Number(payload.t12m);
  const t12mLabel = Number.isFinite(t12m) ? `${(t12m * 100).toFixed(1)}%` : "n/a";
  const current = Number(payload.rate);
  const previous = Number(payload.prior);
  const where = payload.where || "a small set of locations";
  const deltaPp =
    Number.isFinite(current) && Number.isFinite(previous) ? (current - previous) * 100 : null;
  if (deltaPp == null) {
    return `Engineering trailing-12m annualized voluntary attrition is ${t12mLabel}, concentrated primarily in ${where}.`;
  }
  if (Math.abs(deltaPp) < 0.25) {
    return `Engineering trailing-12m annualized voluntary attrition is ${t12mLabel}. Month view is roughly unchanged versus last month, concentrated primarily in ${where}.`;
  }
  const deltaLabel = `${deltaPp >= 0 ? "+" : ""}${deltaPp.toFixed(1)} pp`;
  return `Engineering trailing-12m annualized voluntary attrition is ${t12mLabel}. Month view ${deltaLabel} versus last month, concentrated primarily in ${where}.`;
}

export function visibleBreakdownCells(cells: Record<string, unknown>[]) {
  return cells.filter((row) => row.suppressed !== true && Number.isFinite(Number(row.value)));
}

export function rankVisibleCells(cells: Record<string, unknown>[]) {
  return [...visibleBreakdownCells(cells)].sort((a, b) => Number(b.value) - Number(a.value));
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
    const termsRaw = Number(row.terms_vol);
    const value = Number(row.value);
    const terms = Number.isFinite(termsRaw)
      ? termsRaw
      : Number.isFinite(value) && n > 0
        ? trailing
          ? value * n
          : (value * n) / 12
        : 0;
    const current = byLocation.get(location) ?? { terms: 0, n: 0 };
    current.terms += terms;
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

export function normalizeTrendPoints(raw: unknown): Array<{ as_of: string; value: number }> {
  const rows = Array.isArray(raw) ? raw : [];
  const points: Array<{ as_of: string; value: number }> = [];
  for (const row of rows) {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const asOf = isoDate(record.as_of);
    const value = Number(record.value);
    if (!asOf || !Number.isFinite(value)) continue;
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
