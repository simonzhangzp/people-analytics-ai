import { describe, expect, it } from "vitest";
import { suppressionCopy } from "./suppression-copy";

describe("suppressionCopy three branches", () => {
  it("drops visible-cell hedging when hidden is 0", () => {
    const copy = suppressionCopy({
      hidden: 0,
      total: 5,
      minCell: 50,
      grain: "tenure_band",
    });
    expect(copy.noneHidden).toBe(true);
    expect(copy.allHidden).toBe(false);
    expect(copy.visibleQualifier).toBe("");
    expect(copy.afterMinCell).toBe("");
    expect(copy.hiddenFact).toBe("No cells hidden at this grain (min_cell 50).");
    expect(copy.hiddenFact).not.toMatch(/among cells still visible|after min_cell/);
  });

  it("keeps the all-hidden statement when every cell is suppressed", () => {
    const copy = suppressionCopy({
      hidden: 2,
      total: 2,
      minCell: 50,
      grain: "tenure_band",
    });
    expect(copy.allHidden).toBe(true);
    expect(copy.noneHidden).toBe(false);
    expect(copy.hiddenFact).toBe("All cells hidden at tenure_band (min_cell 50).");
  });

  it("keeps visible-cell hedging and a matching grain count when some cells remain", () => {
    const copy = suppressionCopy({
      hidden: 1,
      total: 2,
      minCell: 50,
      grain: "location × tenure × grade",
    });
    expect(copy.noneHidden).toBe(false);
    expect(copy.allHidden).toBe(false);
    expect(copy.visibleQualifier).toMatch(/among cells still visible at min_cell 50/);
    expect(copy.afterMinCell).toBe(" after min_cell 50");
    expect(copy.hiddenFact).toMatch(/1 of 2 location × tenure × grade cells hidden/);
  });
});
