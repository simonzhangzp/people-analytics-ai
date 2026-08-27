import { describe, expect, it } from "vitest";
import { analyzeLocalWorkforceData } from "./local-workforce-analysis";
import { analyzeStrategyBrief } from "../strategy/analyze-brief";
import { profileRows } from "../data/local-profiler";
import {
  getMetricCatalogItem,
  proposalFromCatalogItem,
} from "../strategy/metric-catalog";
import { buildMetricDashboards } from "./metric-dashboards";
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

function snapshotDataset() {
  const rows: DataRow[] = [
    {
      record_month: "2022-07-31",
      latest_hire_dt: "2018-03-12 00:00:00",
      employee_number: 1001,
      data_flag: "1-Headcount",
      country: "US",
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
      latest_hire_dt: "2021-09-01 00:00:00",
      employee_number: 1002,
      data_flag: "1-Headcount",
      country: "Germany",
    },
  ];
  return profileRows(rows, { name: "vdm_snapshot.csv", size: 2_048 }, undefined, {
    rowCount: rows.length,
    aggregates: {
      sampled: false,
      sampleRows: rows.length,
      uniqueEmployees: 2,
      monthlyHeadcount: [
        { month: "2022-07", count: 1 },
        { month: "2022-08", count: 2 },
      ],
      statusCounts: { "1-Headcount": 3 },
      latestMonth: "2022-08",
      hireYearCounts: [
        { year: "2018", count: 1 },
        { year: "2021", count: 1 },
      ],
    },
  });
}

describe("metric dashboards from strategy, metrics, and files", () => {
  it("calculates what recruiting files can answer and leaves the rest blank", () => {
    const dataset = profileRows(recruitingRows(), {
      name: "recruiting.csv",
      size: 4_096,
    });
    const brief = analyzeStrategyBrief({
      catalogId: "ta-speed-01",
      kind: "strategy",
      title: "",
      statement: "",
    });
    const result = analyzeLocalWorkforceData([dataset], 45, brief);
    const byId = Object.fromEntries(
      result.dashboards.map((item) => [item.id, item]),
    );

    expect(result.question).toMatch(/Reduce Time to Fill/i);
    expect(result.dashboards).toHaveLength(brief.metrics.length);
    expect(byId.time_to_fill.status).toBe("partial");
    expect(byId.time_to_fill.sentence).toMatch(/Time to Hire is 41 days/i);
    expect(byId.time_to_fill.value).toBe("41 days");
    expect(byId.time_to_fill.points.length).toBeGreaterThan(0);
    expect(byId.offer_acceptance.status).toBe("calculated");
    expect(byId.offer_acceptance.points.length).toBeGreaterThan(0);
    expect(byId.offer_acceptance.sentence).toMatch(/100%/);
    expect(byId.quality_of_hire.status).toBe("unanswerable");
    expect(byId.quality_of_hire.sentence).toMatch(/cannot be calculated/i);
    expect(byId.candidate_satisfaction.status).toBe("unanswerable");
    expect(byId.interview_scheduling.status).toBe("partial");
    expect(byId.interview_scheduling.sentence).toMatch(/review-to-interview/i);
  });

  it("does not invent Time to Fill from a headcount snapshot", () => {
    const brief = analyzeStrategyBrief({
      catalogId: "ta-speed-01",
      kind: "strategy",
      title: "",
      statement: "",
    });
    const result = analyzeLocalWorkforceData([snapshotDataset()], 45, brief);
    const ttf = result.dashboards.find((item) => item.id === "time_to_fill");

    expect(ttf?.status).toBe("unanswerable");
    expect(ttf?.sentence).toMatch(/cannot be calculated/i);
    expect(ttf?.value).toBe("—");
    expect(result.metricName).toBe("Headcount");
  });

  it("shows actual headcount when that metric is on the plan", () => {
    const item = getMetricCatalogItem("headcount_vs_plan");
    expect(item).toBeTruthy();
    const brief = {
      ...analyzeStrategyBrief({
        catalogId: "ta-speed-01",
        kind: "strategy",
        title: "",
        statement: "",
      }),
      metrics: [proposalFromCatalogItem(item!)],
    };
    const result = analyzeLocalWorkforceData([snapshotDataset()], 45, brief);
    const card = result.dashboards[0];

    expect(card.id).toBe("headcount_vs_plan");
    expect(card.status).toBe("partial");
    expect(card.value).toBe("2");
    expect(card.sentence).toMatch(/plan headcount is not/i);
  });

  it("keeps metric cards blank until files are uploaded", () => {
    const brief = analyzeStrategyBrief({
      catalogId: "ta-speed-01",
      kind: "strategy",
      title: "",
      statement: "",
    });
    const cards = buildMetricDashboards([], brief);

    expect(cards).toHaveLength(brief.metrics.length);
    expect(cards.every((item) => item.status === "unanswerable")).toBe(true);
    expect(cards[0].sentence).toMatch(/waiting for uploaded files/i);
  });
});
