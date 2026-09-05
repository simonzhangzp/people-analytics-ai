import { describe, expect, it } from "vitest";
import type { ColumnProfile } from "@/types/workbench";
import {
  isSafeAggregateDimension,
  omitPrivateExplorationColumns,
  publicExplorationColumnNames,
} from "./privacy";

function column(
  sourceName: string,
  overrides: Partial<ColumnProfile> = {},
): ColumnProfile {
  return {
    sourceName,
    inferredType: "string",
    rowCount: 1,
    nullCount: 0,
    nullPct: 0,
    distinctCount: 1,
    distinctPct: 100,
    likelyPII: false,
    ...overrides,
  };
}

describe("exploration privacy boundary", () => {
  const columns = [
    column("employee_email", { likelyPII: true }),
    column("Gender", {
      sensitive: true,
      semanticRole: "sensitive_dimension",
    }),
    column("Manager ID", { canonicalField: "manager_id" }),
    column("department"),
    column("engagement_score", { inferredType: "number" }),
  ];

  it("allows sensitive demographics as aggregate dimensions, not row explorer fields", () => {
    expect(
      isSafeAggregateDimension({
        likelyPII: false,
        sensitive: true,
        semanticRole: "sensitive_dimension",
        inferredType: "string",
      }),
    ).toBe(true);
    expect(
      isSafeAggregateDimension({
        likelyPII: true,
        inferredType: "string",
        canonicalField: "employee_name",
      }),
    ).toBe(false);
  });

  it("projects only de-identified, non-sensitive columns", () => {
    expect(publicExplorationColumnNames(columns)).toEqual([
      "department",
      "engagement_score",
    ]);
  });

  it("removes private keys even when query casing differs from the profile", () => {
    expect(
      omitPrivateExplorationColumns(
        {
          Employee_Email: "person@example.com",
          gender: "Female",
          manager_id: "M-100",
          Department: "Operations",
          engagement_score: 4.2,
        },
        columns,
      ),
    ).toEqual({
      Department: "Operations",
      engagement_score: 4.2,
    });
  });
});
