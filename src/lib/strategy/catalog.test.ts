import { describe, expect, it } from "vitest";
import {
  analyzeStrategyBrief,
  classifyCustomStatement,
} from "./analyze-brief";
import { catalogStats, filterCatalog, getCatalogItem, strategyCatalog } from "./catalog";
import { metricTemplates } from "./metric-templates";

describe("strategy catalog", () => {
  it("imports more than 100 classified strategies and problems", () => {
    const stats = catalogStats();
    expect(stats.total).toBeGreaterThanOrEqual(100);
    expect(stats.byKind.strategy).toBeGreaterThan(40);
    expect(stats.byKind.problem).toBeGreaterThan(40);
    expect(Object.values(stats.byCategory).every((count) => count > 0)).toBe(true);
  });

  it("keeps every catalog metric id in the template library", () => {
    const missing = strategyCatalog.flatMap((item) =>
      item.metricIds.filter((id) => !metricTemplates[id]),
    );
    expect(missing).toEqual([]);
  });

  it("can filter the Time to Fill strategy used by the demo path", () => {
    const matches = filterCatalog(strategyCatalog, "Time to Fill", "strategy");
    expect(matches.some((item) => item.id === "ta-speed-01")).toBe(true);
  });
});

describe("strategy brief analysis", () => {
  it("builds proposed metrics from a catalog item", () => {
    const item = getCatalogItem("ta-speed-01");
    expect(item).toBeTruthy();
    const brief = analyzeStrategyBrief({
      catalogId: "ta-speed-01",
      kind: "strategy",
      title: item?.title ?? "",
      statement: item?.statement ?? "",
    });
    expect(brief.metrics.length).toBeGreaterThanOrEqual(3);
    expect(brief.metrics.some((metric) => metric.name === "Time to Fill")).toBe(true);
    expect(brief.metrics.every((metric) => metric.status === "Proposed")).toBe(true);
    expect(brief.analysis?.source).toBe("catalog");
  });

  it("classifies a custom hiring problem and still proposes metrics", () => {
    expect(classifyCustomStatement("Our time to fill is too slow")).toBe(
      "Talent Acquisition",
    );
    const brief = analyzeStrategyBrief({
      kind: "problem",
      title: "Hiring is too slow",
      statement: "Time to fill for critical roles keeps missing the target.",
    });
    expect(brief.source).toBe("custom");
    expect(brief.category).toBe("Talent Acquisition");
    expect(brief.metrics.length).toBeGreaterThan(0);
  });
});
