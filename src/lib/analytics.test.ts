import { describe, expect, it } from "vitest";
import { calculateReadinessScore, calculateTimeToFillAnalysis } from "./analytics";

describe("calculateTimeToFillAnalysis", () => {
  it("computes the gap and stage contribution without AI", () => {
    const result = calculateTimeToFillAnalysis([
      { stage: "Sourcing", currentDays: 8, targetDays: 7 },
      { stage: "Interview scheduling", currentDays: 12.1, targetDays: 6 },
      { stage: "Offer approval", currentDays: 9, targetDays: 6 },
    ]);

    expect(result.currentDays).toBe(29.1);
    expect(result.targetDays).toBe(19);
    expect(result.gapDays).toBe(10.1);
    expect(result.primaryDriver.stage).toBe("Interview scheduling");
    expect(result.primaryDriver.excessDays).toBe(6.1);
    expect(result.primaryDriver.contributionPercent).toBe(60.4);
  });

  it("rejects an empty stage list", () => {
    expect(() => calculateTimeToFillAnalysis([])).toThrow(/required/i);
  });
});

describe("calculateReadinessScore", () => {
  it("averages component scores", () => {
    expect(
      calculateReadinessScore({
        Completeness: 80,
        Consistency: 90,
        Joinability: 70,
      }),
    ).toBe(80);
  });
});
