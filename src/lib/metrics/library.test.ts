import { describe, expect, it } from "vitest";
import {
  INITIAL_PEOPLE_METRIC_LIBRARY,
  VOLUNTARY_ATTRITION_METRIC,
  getMetricDefinition,
  resolveMetricLibraryForOrganization,
} from "./library";

describe("initial People metric library", () => {
  it("contains 15 structured definitions across the four required domains", () => {
    expect(INITIAL_PEOPLE_METRIC_LIBRARY).toHaveLength(15);
    expect(
      new Set(INITIAL_PEOPLE_METRIC_LIBRARY.map((metric) => metric.key)).size,
    ).toBe(15);
    expect(
      new Set(INITIAL_PEOPLE_METRIC_LIBRARY.map((metric) => metric.domain)),
    ).toEqual(
      new Set(["retention", "recruiting", "mobility", "compensation"]),
    );

    for (const metric of INITIAL_PEOPLE_METRIC_LIBRARY) {
      expect(metric.formula.kind).toMatch(
        /count|average|ratio|duration/,
      );
      expect(metric.sourceFields.length).toBeGreaterThan(0);
      expect(metric.dimensions.length).toBeGreaterThan(0);
      expect(metric.version).toBeGreaterThan(0);
    }
  });

  it("keeps retirement as an explicit default ambiguity", () => {
    expect(VOLUNTARY_ATTRITION_METRIC.status).toBe("Needs Review");
    expect(
      VOLUNTARY_ATTRITION_METRIC.exclusions.some((item) =>
        item.label.toLowerCase().includes("until"),
      ),
    ).toBe(true);
  });

  it("resolves organization overrides without mutating the base library", () => {
    const acme = resolveMetricLibraryForOrganization("acme", [
      {
        organizationId: "acme",
        metricKey: "headcount",
        changes: {
          description: "Acme-approved employee headcount definition.",
          dimensions: ["business_unit"],
          version: 4,
        },
      },
      {
        organizationId: "other",
        metricKey: "headcount",
        changes: { description: "Other organization definition." },
      },
    ]);

    expect(getMetricDefinition("headcount", acme)).toMatchObject({
      description: "Acme-approved employee headcount definition.",
      dimensions: ["business_unit"],
      version: 4,
    });
    expect(getMetricDefinition("headcount")?.description).not.toContain("Acme");
  });
});
