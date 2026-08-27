import { describe, expect, it } from "vitest";
import { analyzeLocalWorkforceData } from "./local-workforce-analysis";
import { assessReadiness, profileRows } from "../data/local-profiler";
import type { DataRow } from "../../types/local-data";

const day = (offset: number) =>
  new Date(Date.UTC(2026, 0, 1 + offset)).toISOString();

function recruitingRows(): DataRow[] {
  return Array.from({ length: 12 }, (_, index) => {
    const start = index * 2;
    const slower = index < 6;
    return {
      requisition_id: `REQ-${Math.floor(index / 3)}`,
      candidate_id: `CAND-${index}`,
      applied_at: day(start),
      reviewed_at: day(start + 2),
      interviewed_at: day(start + (slower ? 14 : 8)),
      offer_extended_at: day(start + (slower ? 20 : 13)),
      offer_accepted: true,
      hire_date: day(start + (slower ? 48 : 34)),
      reviewed: true,
      interviewed: true,
      offer_extended: true,
      hired: true,
      department: slower ? "Security" : "Engineering",
      source_name: index % 2 ? "Referral" : "LinkedIn",
    };
  });
}

describe("local workforce data pipeline", () => {
  it("infers mappings, grain, and the Time to Fill evidence gap", () => {
    const dataset = profileRows(recruitingRows(), {
      name: "recruiting.csv",
      size: 4_096,
    });
    const readiness = assessReadiness([dataset]);

    expect(dataset.entity).toBe("Candidate Application");
    expect(dataset.grain).toBe("Candidate × Requisition");
    expect(dataset.mappings.some((item) => item.canonicalField === "hire_date")).toBe(
      true,
    );
    expect(dataset.issues.some((issue) => issue.id === "missing-requisition-open")).toBe(
      true,
    );
    expect(readiness.canAnswer).toContain("Time to Hire for completed hires");
    expect(readiness.cannotAnswer.join(" ")).toMatch(/Time to Fill/i);
  });

  it("calculates observed metrics and generates evidence-linked outputs", () => {
    const dataset = profileRows(recruitingRows(), {
      name: "recruiting.csv",
      size: 4_096,
    });
    const result = analyzeLocalWorkforceData([dataset]);

    expect(result.metricName).toBe("Time to Hire");
    expect(result.currentDays).toBe(41);
    expect(result.sampleSize).toBe(12);
    expect(result.comparisonValid).toBe(false);
    expect(result.stageDurations[0].stage).toBe("Offer → Hire");
    expect(result.insight.headline).toMatch(/41 days/i);
    expect(result.insight.limitation).toMatch(/Time to Fill/i);
    expect(result.storySlides).toHaveLength(5);
    expect(result.action.evidence).toMatch(/Offer → Hire/i);
    expect(result.headlineValue).toBe("41 days");
    expect(result.chartUnit).toBe("days");
    expect(result.dashboards[0]?.name).toBe("Time to Hire");
    expect(result.dashboards[0]?.sentence).toMatch(/41 days/i);
    expect(result.question).toMatch(/Time to Hire|uploaded/i);
  });

  it("profiles employee snapshots and calculates monthly headcount", () => {
    const rows: DataRow[] = [
      {
        record_month: "2022-07-31",
        latest_hire_dt: "2018-03-12 00:00:00",
        employee_number: 1001,
        data_flag: "1-Headcount",
        country: "US",
      },
      {
        record_month: "2022-07-31",
        latest_hire_dt: "2019-11-02 00:00:00",
        employee_number: 1002,
        data_flag: "1-Headcount",
        country: "Germany",
      },
      {
        record_month: "2022-08-31",
        latest_hire_dt: "2018-03-12 00:00:00",
        employee_number: 1001,
        data_flag: "1-Headcount",
        country: "US",
      },
      {
        record_month: "2022-08-31",
        latest_hire_dt: "2019-11-02 00:00:00",
        employee_number: 1002,
        data_flag: "1-Headcount",
        country: "Germany",
      },
      {
        record_month: "2022-08-31",
        latest_hire_dt: "2022-08-08 00:00:00",
        employee_number: 1003,
        data_flag: "1-Headcount",
        country: "Australia",
      },
    ];
    const dataset = profileRows(rows, { name: "vdm_snapshot.csv", size: 2_048 }, undefined, {
      rowCount: rows.length,
      aggregates: {
        sampled: false,
        sampleRows: rows.length,
        uniqueEmployees: 3,
        monthlyHeadcount: [
          { month: "2022-07", count: 2 },
          { month: "2022-08", count: 3 },
        ],
        statusCounts: { "1-Headcount": 5 },
        latestMonth: "2022-08",
        latestMonthSegmentField: "country",
        latestMonthSegments: [
          { segment: "US", count: 1 },
          { segment: "Germany", count: 1 },
          { segment: "Australia", count: 1 },
        ],
        hireYearCounts: [
          { year: "2018", count: 1 },
          { year: "2019", count: 1 },
          { year: "2022", count: 1 },
        ],
        dateRangeStart: "2018-03",
        dateRangeEnd: "2022-08",
      },
    });
    const readiness = assessReadiness([dataset]);
    const result = analyzeLocalWorkforceData([dataset]);

    expect(dataset.entity).toBe("Employee Snapshot");
    expect(dataset.grain).toBe("Employee × Month");
    expect(result.metricName).toBe("Headcount");
    expect(result.headlineValue).toBe("3");
    expect(result.sampleSize).toBe(3);
    expect(result.comparisonValid).toBe(false);
    expect(result.insight.headline).toMatch(/headcount/i);
    expect(result.dashboards[0]?.name).toBe("Headcount");
    expect(result.dashboards[0]?.sentence).toMatch(/headcount/i);
    expect(result.insight.limitation).toMatch(/Time to Fill/i);
    expect(result.action.title).toMatch(/Time to Fill/i);
    expect(readiness.canAnswer.join(" ")).toMatch(/headcount/i);
    expect(readiness.cannotAnswer.join(" ")).toMatch(/Time to Fill/i);
  });

  it("profiles a hire extract without requiring recruiting fields", () => {
    const dataset = profileRows(
      [
        {
          latest_hire_dt: "2020-07-13 00:00:00",
          country: "US",
          tech_designation: "Prof (Technical) Level 4",
          employee_number: 16000058,
        },
        {
          latest_hire_dt: "2021-01-04 00:00:00",
          country: "Japan",
          tech_designation: "Prof (Sales) Level 2",
          employee_number: 16000041,
        },
      ],
      { name: "vdm_hire.csv", size: 1_024 },
    );
    const result = analyzeLocalWorkforceData([dataset]);

    expect(dataset.entity).toBe("Employee Hire Extract");
    expect(result.metricName).toBe("Workforce mix");
    expect(result.insight.limitation).toMatch(/Time to Fill/i);
  });
});
