import type { WorkbenchState } from "@/types/workbench";
import { describe, expect, it } from "vitest";
import {
  serializeWorkbenchKnowledge,
  stripUnsafePersistenceData,
} from "./repository";

const state: WorkbenchState = {
  workspaceId: "workspace-1",
  workspaceName: "Retention review",
  activeView: "data",
  datasets: [
    {
      metadata: {
        id: "dataset-1",
        name: "workforce.csv",
        fingerprint: "safe-fingerprint",
        localTableName: "local_private_table",
        fileSize: 1024,
        rowCount: 2,
        inferredType: "workforce_snapshot",
        typeConfidence: 0.9,
        grain: {
          label: "employee-month",
          keys: ["employee_id", "snapshot_date"],
          evidence: ["Locally profiled uniqueness"],
        },
        grainConfidence: 0.9,
        columns: [
          {
            sourceName: "employee_id",
            inferredType: "string",
            rowCount: 2,
            nullCount: 0,
            nullPct: 0,
            distinctCount: 2,
            distinctPct: 100,
            min: "E-001",
            max: "E-002",
            likelyPII: true,
            canonicalField: "employee_id",
            semanticMeaning: "Stable employee identifier",
            confidence: 0.95,
          },
        ],
        timeRange: "2026-01",
        healthScore: 95,
        issues: [],
        status: "Needs Review",
        safeProfile: {
          fileName: "workforce.csv",
          rowCount: 2,
          columnCount: 1,
          inferredType: "workforce_snapshot",
          grain: "employee-month",
          grainConfidence: 0.9,
          timeRange: "2026-01",
          columns: [
            {
              sourceName: "employee_id",
              inferredType: "string",
              nullPct: 0,
              distinctPct: 100,
              likelyPII: true,
              canonicalField: "employee_id",
              semanticMeaning: "Stable employee identifier",
              confidence: 0.95,
            },
          ],
        },
      },
      explorationRows: [
        {
          employee_id: "E-001",
          email: "private.person@example.com",
          salary: 123_456,
        },
      ],
    },
  ],
  fieldMappings: [],
  relationships: [],
  question: null,
  metrics: [],
  activeMetricId: null,
  ambiguity: null,
  pendingMetricPatch: null,
  analysisPlan: null,
  insights: [],
  story: null,
  interventions: [],
  progress: {
    data: "In progress",
    metrics: "Not started",
    analysis: "Not started",
    story: "Not started",
  },
  engineStatus: "ready",
  persistenceStatus: "local-only",
};

describe("Workbench knowledge serializer", () => {
  it("persists safe metadata without local exploration rows or raw extrema", () => {
    const serialized = serializeWorkbenchKnowledge(state);
    const text = JSON.stringify(serialized);

    expect(serialized.datasets).toHaveLength(1);
    expect(serialized.datasets[0]).not.toHaveProperty("localTableName");
    expect(serialized.datasets[0]).not.toHaveProperty("columns");
    expect(serialized.datasets[0]).toHaveProperty("safeProfile");
    expect(text).not.toContain("private.person@example.com");
    expect(text).not.toContain("123456");
    expect(text).not.toContain('"explorationRows"');
    expect(text).not.toContain('"rows"');
    expect(text).not.toContain('"min":"E-001"');
  });

  it("recursively strips raw-row keys before a payload is converted to JSON", () => {
    const sanitized = stripUnsafePersistenceData({
      safe: { headline: "Aggregate turnover increased." },
      nested: {
        rows: [{ employeeId: "E-001" }],
        rawRows: [{ employeeId: "E-002" }],
        sampleValues: ["E-001", "E-002"],
        explorationRows: [{ employeeId: "E-003" }],
      },
    });

    expect(sanitized).toEqual({
      safe: { headline: "Aggregate turnover increased." },
      nested: {},
    });
  });
});
