import { describe, expect, it } from "vitest";
import { VOLUNTARY_ATTRITION_METRIC } from "./library";
import {
  applyMetricPatch,
  createHeadcountBasisPatch,
  createRetirementAmbiguity,
  createRetirementClassificationPatch,
} from "./patches";

describe("metric definition patches", () => {
  it("creates a structured beginning-headcount diff and approves it", () => {
    const patch = createHeadcountBasisPatch(
      VOLUNTARY_ATTRITION_METRIC,
      "beginning",
    );

    expect(patch.status).toBe("Ready to apply");
    expect(patch.items.map((item) => item.field)).toEqual([
      "denominator",
      "formula",
      "timeBasis",
    ]);
    expect(patch.items.every((item) => item.after.length > 0)).toBe(true);
    expect(patch.nextDefinition.denominator?.kind).toBe("count");

    const applied = applyMetricPatch(
      patch,
      "2026-08-27T12:00:00.000Z",
    );
    expect(applied.status).toBe("Applied");
    expect(applied.nextDefinition).toMatchObject({
      version: VOLUNTARY_ATTRITION_METRIC.version + 1,
      status: "Approved",
      approvedAt: "2026-08-27T12:00:00.000Z",
    });
  });

  it("resolves retirement through a structured numerator change", () => {
    const ambiguity = createRetirementAmbiguity();
    const patch = createRetirementClassificationPatch(
      VOLUNTARY_ATTRITION_METRIC,
      "voluntary",
    );

    expect(ambiguity.status).toBe("Open");
    expect(ambiguity.selectedOptionId).toBeUndefined();
    expect(ambiguity.options.map((option) => option.value)).toEqual([
      "voluntary",
      "involuntary",
      "excluded",
    ]);
    expect(patch.items.map((item) => item.field)).toEqual([
      "numerator",
      "formula",
      "inclusions",
      "exclusions",
    ]);
    expect(
      patch.nextDefinition.inclusions.some(
        (item) =>
          Array.isArray(item.value) && item.value.includes("Retirement"),
      ),
    ).toBe(true);
  });
});
