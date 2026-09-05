import { describe, expect, it } from "vitest";
import { scoreHypotheses } from "./hypotheses-eval";

describe("E1 hypotheses assertions", () => {
  it("accepts non-empty wording with no digits and no causal verbs", () => {
    const scored = scoreHypotheses({
      hypotheses: [
        "Location, tenure, and level concentrations are observed associations. They do not by themselves prove a cause.",
      ],
      facts: ["Engineering trailing-12m voluntary attrition: 16.0% as of 2026-08-31."],
    });
    expect(scored.ok).toBe(true);
  });

  it("rejects empty, numeric, and causal hypotheses", () => {
    expect(scoreHypotheses({ hypotheses: [], facts: ["x"] }).failures).toContain("hypotheses_empty");
    expect(
      scoreHypotheses({ hypotheses: ["The rate is 16.0%."], facts: ["The rate is 16.0%."] }).failures,
    ).toContain("hypothesis_contains_number");
    expect(
      scoreHypotheses({
        hypotheses: ["Attrition increased because of pay."],
        facts: ["Engineering trailing-12m voluntary attrition: 16.0%."],
      }).failures,
    ).toContain("hypothesis_causal_claim");
  });
});
