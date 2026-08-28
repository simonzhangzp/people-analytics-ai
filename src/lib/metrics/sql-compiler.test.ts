import { describe, expect, it } from "vitest";
import type { MetricExpression } from "@/types/workbench";
import {
  VOLUNTARY_ATTRITION_METRIC,
} from "./library";
import {
  compileMetricExpression,
  compileMetricQuery,
  escapeSqlIdentifier,
} from "./sql-compiler";

describe("controlled metric SQL compiler", () => {
  it("emits DuckDB-compatible parameterized SQL", () => {
    const injectedValue = "Engineering' OR 1=1; DROP TABLE workforce; --";
    const compiled = compileMetricQuery(VOLUNTARY_ATTRITION_METRIC, {
      tableName: "main.workforce",
      alias: "attrition_rate",
      rules: [
        {
          field: "department",
          operator: "equals",
          value: injectedValue,
          label: "Selected department",
        },
      ],
    });

    expect(compiled.sql).toContain('FROM "main"."workforce"');
    expect(compiled.sql).toContain('WHERE ("department" = ?)');
    expect(compiled.sql).toContain("NULLIF");
    expect(compiled.sql).not.toContain(injectedValue);
    expect(compiled.parameters.at(-1)).toBe(injectedValue);
  });

  it("strictly quotes identifiers and never accepts a raw SQL expression", () => {
    expect(escapeSqlIdentifier('people"; DROP TABLE x; --')).toBe(
      '"people""; DROP TABLE x; --"',
    );

    const arbitrarySql = {
      kind: "raw",
      sql: "SELECT * FROM secrets",
    } as unknown as MetricExpression;
    expect(() => compileMetricExpression(arbitrarySql)).toThrow(
      /Unsupported metric expression/,
    );
  });

  it("compiles rule values only as placeholders", () => {
    const expression: MetricExpression = {
      kind: "count",
      entity: "employee",
      distinctField: "employee_id",
      rules: [
        {
          field: "level",
          operator: "in",
          value: ["L4", "L5"],
          label: "Approved levels",
        },
      ],
    };
    const compiled = compileMetricExpression(expression);

    expect(compiled.sql).toContain('"level" IN (?, ?)');
    expect(compiled.parameters).toEqual(["L4", "L5"]);
  });
});
