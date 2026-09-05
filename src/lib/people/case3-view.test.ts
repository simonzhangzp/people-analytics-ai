import { describe, expect, it } from "vitest";
import {
  concentrationLocationFromVisible,
  normalizeTrendPoints,
  previousMonthEnd,
  rankVisibleCells,
  trendChartModel,
  visibleBreakdownCells,
} from "./case3-view";
import { attritionHeadline } from "./case3-view";

const visitorCells = [
  { location_id: "AMER-NYC", tenure_band: "1–3y", grade_id: "G5", n: 7200, terms_vol: 90, value: 0.15, suppressed: false },
  { location_id: "APAC-SIN", tenure_band: "<1y", grade_id: "G7", n: 4493, terms_vol: 95, value: 0.254, suppressed: false },
  { location_id: "EMEA-LON", tenure_band: "1–3y", grade_id: "G5", n: 4046, terms_vol: 51, value: 0.151, suppressed: false },
  { location_id: "EMEA-LON", tenure_band: "<1y", grade_id: "G3", n: 6, terms_vol: 1, value: 2.0, suppressed: true },
];

const analystCells = visitorCells.map((row) => ({ ...row, suppressed: false }));

describe("Case 3 visible-cell concentration", () => {
  it("ignores suppressed cells when ranking and locating concentration", () => {
    expect(visibleBreakdownCells(visitorCells)).toHaveLength(3);
    expect(rankVisibleCells(visitorCells)[0]?.location_id).toBe("APAC-SIN");
    expect(concentrationLocationFromVisible(visitorCells)).toBe("APAC-SIN");
  });

  it("does not let a tiny unsuppressed cell flip the headline location", () => {
    expect(rankVisibleCells(analystCells)[0]?.location_id).toBe("EMEA-LON");
    expect(concentrationLocationFromVisible(analystCells)).toBe("APAC-SIN");
  });

  it("renders an error model when the trend series is empty", () => {
    const empty = trendChartModel([]);
    expect(empty.status).toBe("error");
    expect(empty.points).toHaveLength(0);
    expect(empty.message).toMatch(/no usable points/i);
    expect(normalizeTrendPoints([{ as_of: "2026-08-31", value: "bad" }])).toHaveLength(0);
  });

  it("keeps 24 finite points and marks the 2026-03 scenario month", () => {
    const raw = Array.from({ length: 24 }, (_, index) => ({
      as_of: `2024-${String((index % 12) + 1).padStart(2, "0")}-28`,
      value: 0.12 + index / 1000,
    }));
    raw[14] = { as_of: "2026-03-31", value: 0.14 };
    const model = trendChartModel(raw);
    expect(model.status).toBe("ok");
    expect(model.points.length).toBeGreaterThanOrEqual(12);
    expect(model.scenarioAsOf).toBe("2026-03-31");
  });

  it("states the Engineering t12m rate and visible-cell location", () => {
    const text = attritionHeadline({
      t12m: 0.15998296921152771,
      rate: 0.17901466716810832,
      prior: 0.15953844224256866,
      where: "APAC-SIN",
      asOf: "2026-08-31",
    });
    expect(text).toMatch(/16\.0%/);
    expect(text).toMatch(/17\.9%/);
    expect(text).toMatch(/up 1\.9 pp from 2026-07/);
    expect(text).toMatch(/as-of 2026-08-31/);
    expect(text).toMatch(/APAC-SIN/);
    expect(text).not.toMatch(/Month view \+1\.9 pp versus last month/);
  });

  it("does not turn a missing rate into 0.0%", () => {
    const text = attritionHeadline({ t12m: null, rate: null, where: "APAC-SIN" });
    expect(text).toMatch(/n\/a/);
    expect(text).not.toMatch(/0\.0%/);
    expect(text).toMatch(/as-of 2026-08-31/);
  });

  it("does not treat a null breakdown value as a visible 0.0% cell", () => {
    const cells = [
      { location_id: "NULL-SITE", tenure_band: "<1y", n: 120, value: null, suppressed: false },
      { location_id: "APAC-SIN", tenure_band: "1–3y", n: 200, value: 0.254, suppressed: false },
    ];
    expect(visibleBreakdownCells(cells)).toHaveLength(1);
    expect(visibleBreakdownCells(cells)[0]?.location_id).toBe("APAC-SIN");
    expect(rankVisibleCells(cells)[0]?.location_id).toBe("APAC-SIN");
  });

  it("shifts a month-end back one calendar month", () => {
    expect(previousMonthEnd("2026-08-31")).toBe("2026-07-31");
  });
});
