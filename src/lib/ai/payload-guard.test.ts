import { describe, expect, it } from "vitest";
import {
  assertSafeAIPayload,
  UnsafeAIPayloadError,
} from "./payload-guard";

describe("AI safe payload guard", () => {
  it.each([
    "rows",
    "rawRows",
    "rawRecords",
    "sampleValues",
    "explorationRows",
  ])(
    "recursively rejects %s",
    (key) => {
      expect(() =>
        assertSafeAIPayload({
          task: "semantic_interpreter",
          input: {
            nested: {
              [key]: [{ employeeId: "E-100", email: "person@example.com" }],
            },
          },
        }),
      ).toThrowError(UnsafeAIPayloadError);
    },
  );

  it("rejects an obvious homogeneous raw-record array under an unknown key", () => {
    expect(() =>
      assertSafeAIPayload({
        input: {
          records: [
            { department: "Sales", salary: 100_000, tenure: 2 },
            { department: "Legal", salary: 120_000, tenure: 4 },
          ],
        },
      }),
    ).toThrow(/array of raw records/i);
  });

  it("accepts safe profiles, definitions, and aggregate result records", () => {
    expect(() =>
      assertSafeAIPayload({
        task: "insight_interpreter",
        input: {
          datasetProfiles: [
            {
              datasetId: "dataset-1",
              profile: {
                fileName: "workforce.csv",
                rowCount: 1200,
                columnCount: 2,
                inferredType: "workforce_snapshot",
                grain: "employee-month",
                grainConfidence: 0.9,
                columns: [
                  {
                    sourceName: "employee_id",
                    inferredType: "string",
                    nullPct: 0,
                    distinctPct: 90,
                    likelyPII: true,
                  },
                ],
              },
            },
          ],
          aggregatedResults: [
            {
              id: "result-1",
              label: "Headcount",
              value: 1200,
              unit: "people",
              dimensions: { region: "EMEA" },
              sourceDatasetIds: ["dataset-1"],
            },
            {
              id: "result-2",
              label: "Headcount",
              value: 1100,
              unit: "people",
              dimensions: { region: "NA" },
              sourceDatasetIds: ["dataset-1"],
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it("rejects row-shaped data while allowing label-value chart aggregates", () => {
    expect(() =>
      assertSafeAIPayload({
        chartSpec: {
          data: [
            { department: "Sales", salary: 100_000, gender: "Female" },
          ],
        },
      }),
    ).toThrow(/array of raw records/i);

    expect(() =>
      assertSafeAIPayload({
        chartSpec: {
          data: [
            { label: "Q1", value: 18 },
            { label: "Q2", value: 21 },
          ],
        },
      }),
    ).not.toThrow();
  });
});
