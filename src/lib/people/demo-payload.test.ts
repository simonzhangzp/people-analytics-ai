import { describe, expect, it } from "vitest";
import { headcountLineageSteps } from "./headcount-lineage";
import { groupQualityTestsByLayer } from "./quality-catalog";

describe("Case 1 headcount lineage", () => {
  it("stops at Certified Headcount and keeps table names secondary", () => {
    const steps = headcountLineageSteps([]);
    expect(steps.map((step) => step.label)).toEqual([
      "Workforce file from HRIS",
      "Month-end worker history",
      "Workforce change events",
      "Certified Headcount",
    ]);
    expect(steps.some((step) => /mobility/i.test(step.label))).toBe(false);
    expect(steps.some((step) => /internal_mobility/i.test(step.table))).toBe(false);
    expect(steps.at(-1)?.table).toContain("headcount");
    for (const step of steps) {
      expect(step.label.length).toBeGreaterThan(8);
      expect(step.table.length).toBeGreaterThan(4);
    }
  });

  it("groups quality tests by bronze / silver / gold instead of a flat slice", () => {
    const grouped = groupQualityTestsByLayer([
      {
        test_name: "bronze_volume",
        test_id: "bronze_volume",
        layer: "bronze",
        object_name: "people_bronze",
        test_type: "volume",
        blocking: true,
        status: "passed",
        last_run_at: null,
      },
      {
        test_name: "unique_worker_id",
        test_id: "unique_worker_id",
        layer: "silver",
        object_name: "people_worker",
        test_type: "unique",
        blocking: true,
        status: "passed",
        last_run_at: null,
      },
      {
        test_name: "metric_range_headcount",
        test_id: "metric_range_headcount",
        layer: "gold",
        object_name: "people_metric.headcount",
        test_type: "metric_range",
        blocking: true,
        status: "passed",
        last_run_at: null,
      },
    ]);
    expect(grouped.map((row) => row.layer)).toEqual(["bronze", "silver", "gold"]);
    expect(grouped.map((row) => row.tests.length)).toEqual([1, 1, 1]);
  });
});
