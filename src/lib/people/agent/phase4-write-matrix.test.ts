import { describe, expect, it } from "vitest";
import { phase4WriteMatrixEnabled } from "./phase4-write-matrix";

describe("phase4WriteMatrixEnabled", () => {
  it("ignores PHASE4_WRITE_MATRIX=1 in production", () => {
    expect(
      phase4WriteMatrixEnabled({ NODE_ENV: "production", PHASE4_WRITE_MATRIX: "1" }),
    ).toBe(false);
    expect(phase4WriteMatrixEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  it("matches unset when NODE_ENV is production even if the write flag is 1", () => {
    const productionOn = phase4WriteMatrixEnabled({
      NODE_ENV: "production",
      PHASE4_WRITE_MATRIX: "1",
    });
    const productionOff = phase4WriteMatrixEnabled({ NODE_ENV: "production" });
    expect(productionOn).toBe(productionOff);
  });

  it("allows the local writer only outside production", () => {
    expect(phase4WriteMatrixEnabled({ NODE_ENV: "test", PHASE4_WRITE_MATRIX: "1" })).toBe(true);
    expect(phase4WriteMatrixEnabled({ NODE_ENV: "development", PHASE4_WRITE_MATRIX: "1" })).toBe(
      true,
    );
    expect(phase4WriteMatrixEnabled({ NODE_ENV: "test" })).toBe(false);
  });
});
