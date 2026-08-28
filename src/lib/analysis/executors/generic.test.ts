import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PEOPLE_METRIC_LIBRARY } from "@/lib/metrics/library";
import type { AnalysisExecutionContext } from "./types";

const { queryDuckDBPrepared } = vi.hoisted(() => ({
  queryDuckDBPrepared: vi.fn(),
}));
vi.mock("@/lib/local-data/duckdb-client", () => ({
  queryDuckDBPrepared,
}));

import { executeGenericDomain } from "./generic";

describe("generic deterministic executor", () => {
  beforeEach(() => {
    queryDuckDBPrepared.mockReset();
  });

  it("blocks a non-runnable capability instead of selecting unrelated data", async () => {
    const metric = INITIAL_PEOPLE_METRIC_LIBRARY.find(
      (item) => item.key === "retention_events",
    );
    expect(metric).toBeDefined();
    const context: AnalysisExecutionContext = {
      question: {
        id: "question-1",
        text: "What is attrition?",
        metricIds: [metric!.id],
        createdAt: "2026-08-28T00:00:00.000Z",
      },
      metric: metric!,
      datasets: [],
      capability: {
        id: "capability:retention:retention_events",
        domain: "retention",
        metricKey: "retention_events",
        metricName: "Exit count / observable attrition",
        runnable: false,
        datasetIds: [],
        supportedOperations: ["data_gap"],
        missing: ["Needs a termination event/date or employee outcome flag."],
        assumptions: [],
        confidence: "Low",
        population: {
          id: "population:none",
          label: "No compatible population",
          confidence: 0,
          status: "Needs Review",
          evidence: ["No compatible dataset is attached."],
        },
      },
      plan: {
        id: "plan-1",
        questionId: "question-1",
        summary: "Document why attrition is not answerable.",
        createdAt: "2026-08-28T00:00:00.000Z",
        steps: [
          {
            id: "step-1",
            objective: "Document the data gap",
            operation: "data_gap",
            metricId: metric!.id,
            status: "blocked",
          },
        ],
      },
    };

    const output = await executeGenericDomain(context, {
      mode: "retention",
      metricName: "Exit count / observable attrition",
      preferredFields: ["term_date"],
      categoryFields: [],
      timeFields: [],
      minSampleSize: 5,
      limitations: [],
    });

    expect(output.insights).toHaveLength(1);
    expect(output.insights[0]).toMatchObject({
      branchKey: "data-gap",
      validated: false,
      confidence: "Low",
    });
    expect(output.insights[0]?.limitations).toContain(
      "No substitute metric or demo result was used.",
    );
    expect(queryDuckDBPrepared).not.toHaveBeenCalled();
  });
});
