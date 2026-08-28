import { describe, expect, it } from "vitest";
import type { ColumnDataType } from "@/types/workbench";
import {
  isWorkbenchLikelyPii,
  resolveWorkbenchCanonicalField,
} from "./canonical-fields";
import { inferTableGrain } from "./grain-inference";

function column(
  sourceName: string,
  canonicalField: string,
  inferredType: ColumnDataType = "string",
) {
  return {
    sourceName,
    canonicalField,
    inferredType,
    confidence: 95,
  };
}

describe("code-first people table inference", () => {
  it("infers an employee monthly snapshot with measured key evidence", () => {
    const result = inferTableGrain({
      columns: [
        column("Employee Number", "employee_id"),
        column("Record Month", "snapshot_month", "date"),
      ],
      keyStatistics: {
        rowCount: 120,
        nonNullRowCount: 120,
        distinctKeyCount: 120,
      },
    });

    expect(result.inferredType).toBe("Employee Monthly Snapshot");
    expect(result.grain.label).toBe("Employee × Snapshot Month");
    expect(result.grain.keys).toEqual(["Employee Number", "Record Month"]);
    expect(result.grainConfidence).toBeGreaterThan(90);
    expect(result.evidence.join(" ")).toMatch(
      /EMPLOYEE_MONTHLY_SNAPSHOT.*100\.0% unique/i,
    );
  });

  it("distinguishes termination events from employee rosters", () => {
    const termination = inferTableGrain({
      columns: [
        column("Person ID", "employee_id"),
        column("Termination Date", "term_date", "date"),
      ],
      keyStatistics: {
        rowCount: 10,
        nonNullRowCount: 10,
        distinctKeyCount: 10,
      },
    });
    const roster = inferTableGrain({
      columns: [
        column("Person ID", "employee_id"),
        column("Department", "department"),
      ],
      keyStatistics: {
        rowCount: 10,
        nonNullRowCount: 10,
        distinctKeyCount: 10,
      },
    });

    expect(termination.inferredType).toBe("Termination Event");
    expect(termination.grain.keys).toEqual([
      "Person ID",
      "Termination Date",
    ]);
    expect(roster.inferredType).toBe("Employee Roster");
    expect(roster.grain.label).toBe("Employee");
  });

  it("supports compensation history and snapshot rules", () => {
    expect(
      resolveWorkbenchCanonicalField("Annual Base Pay")?.canonicalField,
    ).toBe("compensation_amount");
    expect(
      resolveWorkbenchCanonicalField("Salary Effective Date")?.canonicalField,
    ).toBe("compensation_effective_date");

    const history = inferTableGrain({
      columns: [
        column("Employee ID", "employee_id"),
        column("Annual Base Pay", "compensation_amount", "number"),
        column(
          "Salary Effective Date",
          "compensation_effective_date",
          "date",
        ),
      ],
      keyStatistics: {
        rowCount: 20,
        nonNullRowCount: 20,
        distinctKeyCount: 20,
      },
    });
    const snapshot = inferTableGrain({
      columns: [
        column("Employee ID", "employee_id"),
        column("Annual Base Pay", "compensation_amount", "number"),
        column(
          "Compensation Snapshot Date",
          "compensation_snapshot_date",
          "date",
        ),
      ],
      keyStatistics: {
        rowCount: 20,
        nonNullRowCount: 20,
        distinctKeyCount: 20,
      },
    });

    expect(history.inferredType).toBe("Compensation History");
    expect(history.grain.label).toMatch(/Effective Date/);
    expect(snapshot.inferredType).toBe("Compensation Snapshot");
    expect(snapshot.grain.label).toMatch(/Compensation Snapshot/);
  });

  it("flags direct PII headers even without a canonical mapping", () => {
    expect(isWorkbenchLikelyPii("Employee Full Name")).toBe(true);
    expect(isWorkbenchLikelyPii("Government ID Number")).toBe(true);
    expect(isWorkbenchLikelyPii("Department")).toBe(false);
  });

  it("reduces grain confidence when proposed keys duplicate", () => {
    const result = inferTableGrain({
      columns: [column("Employee ID", "employee_id")],
      keyStatistics: {
        rowCount: 100,
        nonNullRowCount: 100,
        distinctKeyCount: 50,
      },
    });

    expect(result.inferredType).toBe("Employee Roster");
    expect(result.grainConfidence).toBeLessThan(80);
  });
});
