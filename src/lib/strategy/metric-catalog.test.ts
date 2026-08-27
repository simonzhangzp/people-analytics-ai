import { describe, expect, it } from "vitest";
import { metricTemplates } from "./metric-templates";
import {
  filterMetricCatalog,
  getMetricCatalogItem,
  metricCatalog,
  metricCatalogStats,
  proposalFromCatalogItem,
  proposalFromCustomDraft,
} from "./metric-catalog";

describe("people metric catalog", () => {
  it("contains more than 100 classified People metrics", () => {
    const stats = metricCatalogStats();
    expect(stats.total).toBeGreaterThanOrEqual(100);
    expect(stats.byRole.Outcome).toBeGreaterThan(10);
    expect(stats.byRole.Driver).toBeGreaterThan(40);
    expect(Object.values(stats.byDomain).every((count) => count > 0)).toBe(true);
  });

  it("keeps unique ids and covers every strategy template", () => {
    const ids = metricCatalog.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    const missing = Object.keys(metricTemplates).filter((id) => !ids.includes(id));
    expect(missing).toEqual([]);
  });

  it("can find Time to Fill and convert it to a plan proposal", () => {
    const matches = filterMetricCatalog("Time to Fill", "Talent Acquisition");
    expect(matches.some((item) => item.id === "time_to_fill")).toBe(true);
    const item = getMetricCatalogItem("time_to_fill");
    expect(item?.measurementStandard).toMatch(/median/i);
    expect(proposalFromCatalogItem(item!).status).toBe("Proposed");
  });

  it("accepts a custom metric definition", () => {
    const proposal = proposalFromCustomDraft({
      name: "Manager slate review SLA",
      definition: "Share of slates reviewed by the hiring manager within 3 days.",
      measurementStandard: "Completed slates only.",
      formula: "on_time_reviews ÷ slates",
      unit: "%",
      category: "Driver",
      domain: "Talent Acquisition",
      suggestedTarget: "≥ 90%",
      requiredFields: "slate_id, hm_feedback_at",
    });
    expect(proposal.origin).toBe("custom");
    expect(proposal.requiredFields).toEqual(["slate_id", "hm_feedback_at"]);
    expect(proposal.name).toMatch(/slate review/i);
  });
});
