import { describe, expect, it } from "vitest";
import type {
  ColumnProfile,
  DatasetMetadata,
  LocalWorkbenchDataset,
} from "@/types/workbench";
import {
  buildDatasetFingerprintStructure,
  fingerprintDatasetStructure,
  serializeFingerprintStructure,
} from "./fingerprint";
import {
  buildSafeDatasetProfile,
  buildSafeWorkbenchPayload,
} from "./safe-profile";

const columns: ColumnProfile[] = [
  {
    sourceName: "Employee Email",
    inferredType: "string",
    rowCount: 2,
    nullCount: 0,
    nullPct: 0,
    distinctCount: 2,
    distinctPct: 100,
    min: "ada@example.com",
    max: "lin@example.com",
    likelyPII: true,
    canonicalField: "email",
    semanticMeaning: "Email",
    confidence: 95,
  },
  {
    sourceName: "Department",
    inferredType: "string",
    rowCount: 2,
    nullCount: 0,
    nullPct: 0,
    distinctCount: 1,
    distinctPct: 50,
    min: "Engineering",
    max: "Engineering",
    likelyPII: false,
    canonicalField: "department",
    semanticMeaning: "Department",
    confidence: 99,
  },
];

const grain = {
  label: "Employee",
  keys: ["Employee Email"],
  evidence: ["Test evidence."],
};

function metadata(): DatasetMetadata {
  const safeProfile = buildSafeDatasetProfile({
    name: "roster.csv",
    rowCount: 2,
    inferredType: "Employee Roster",
    grain,
    grainConfidence: 90,
    columns,
  });
  return {
    id: "dataset:roster",
    name: "roster.csv",
    fingerprint: "test",
    localTableName: "people_roster",
    fileSize: 128,
    rowCount: 2,
    inferredType: "Employee Roster",
    typeConfidence: 90,
    grain,
    grainConfidence: 90,
    columns,
    healthScore: 100,
    issues: [],
    status: "Proposed",
    safeProfile,
  };
}

describe("safe local-data profiles", () => {
  it("never copies exploration rows or raw profile values into a safe payload", () => {
    const dataset: LocalWorkbenchDataset = {
      metadata: metadata(),
      explorationRows: [
        {
          "Employee Email": "ada@example.com",
          Department: "Engineering",
        },
      ],
    };

    const payload = buildSafeWorkbenchPayload([dataset], []);
    const serialized = JSON.stringify(payload);

    expect(payload.processingMode).toBe("local-only");
    expect(serialized).not.toContain('"rows"');
    expect(serialized).not.toContain("explorationRows");
    expect(serialized).not.toContain("ada@example.com");
    expect(serialized).not.toContain("Engineering");
  });

  it("fingerprints only structural metadata with Web Crypto SHA-256", async () => {
    const source = metadata();
    const structure = buildDatasetFingerprintStructure(source);
    const serialized = serializeFingerprintStructure(structure);
    const fingerprint = await fingerprintDatasetStructure(structure);

    expect(serialized).not.toContain("ada@example.com");
    expect(serialized).not.toContain("Engineering");
    expect(serialized).not.toContain('"min"');
    expect(serialized).not.toContain('"max"');
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
