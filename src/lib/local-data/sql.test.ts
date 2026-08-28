import { describe, expect, it } from "vitest";
import {
  boundedExplorationLimit,
  buildExplorationQuery,
  EXPLORATION_ROW_LIMIT,
  quoteIdentifier,
  quoteLiteral,
} from "./sql";

describe("DuckDB SQL safety helpers", () => {
  it("quotes identifiers without allowing identifier breakout", () => {
    expect(quoteIdentifier('employee"id')).toBe('"employee""id"');
    expect(quoteIdentifier('people"; DROP TABLE roster; --')).toBe(
      '"people""; DROP TABLE roster; --"',
    );
    expect(() => quoteIdentifier("bad\0name")).toThrow(/null byte/i);
  });

  it("quotes literals and rejects unsafe numeric values", () => {
    expect(quoteLiteral("O'Brien")).toBe("'O''Brien'");
    expect(quoteLiteral("x'; DROP TABLE roster; --")).toBe(
      "'x''; DROP TABLE roster; --'",
    );
    expect(quoteLiteral(true)).toBe("TRUE");
    expect(quoteLiteral(null)).toBe("NULL");
    expect(() => quoteLiteral(Number.POSITIVE_INFINITY)).toThrow(/finite/i);
  });

  it("never lets exploration exceed 5,000 rows", () => {
    expect(boundedExplorationLimit(50_000)).toBe(EXPLORATION_ROW_LIMIT);
    expect(boundedExplorationLimit(-10)).toBe(0);
    expect(buildExplorationQuery("people", 9_000)).toBe(
      'SELECT * FROM "people" LIMIT 5000',
    );
  });
});
