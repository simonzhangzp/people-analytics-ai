import { describe, expect, it } from "vitest";
import {
  assessTypeCompatibility,
  inferRelationshipCardinality,
  scoreRelationshipCandidate,
} from "./relationship-scoring";

describe("dataset relationship scoring", () => {
  it("recognizes identifier type compatibility after local text normalization", () => {
    const compatibility = assessTypeCompatibility(
      "number",
      "string",
      "employee_id",
    );

    expect(compatibility.compatible).toBe(true);
    expect(compatibility.score).toBe(80);
  });

  it("derives cardinality from observed uniqueness", () => {
    expect(
      inferRelationshipCardinality({
        fromNonNullCount: 100,
        fromDistinctCount: 100,
        toNonNullCount: 150,
        toDistinctCount: 90,
        overlapDistinctCount: 80,
      }),
    ).toBe("1:N");
    expect(
      inferRelationshipCardinality({
        fromNonNullCount: 120,
        fromDistinctCount: 80,
        toNonNullCount: 90,
        toDistinctCount: 90,
        overlapDistinctCount: 70,
      }),
    ).toBe("N:1");
  });

  it("combines canonical mapping, uniqueness, and overlap into a proposal", () => {
    const relationship = scoreRelationshipCandidate({
      from: {
        datasetId: "roster",
        sourceField: "Employee Number",
        canonicalField: "employee_id",
        inferredType: "string",
      },
      to: {
        datasetId: "terminations",
        sourceField: "Person ID",
        canonicalField: "employee_id",
        inferredType: "number",
      },
      statistics: {
        fromNonNullCount: 100,
        fromDistinctCount: 100,
        toNonNullCount: 120,
        toDistinctCount: 90,
        overlapDistinctCount: 90,
      },
    });

    expect(relationship.cardinality).toBe("1:N");
    expect(relationship.matchRate).toBe(100);
    expect(relationship.confidence).toBeGreaterThan(90);
    expect(relationship.status).toBe("Proposed");
    expect(relationship.evidence.join(" ")).toMatch(
      /employee_id.*90 normalized distinct values/i,
    );
    expect(relationship.conflicts).toEqual([]);
  });

  it("reports low-overlap and many-to-many conflicts without exposing values", () => {
    const relationship = scoreRelationshipCandidate({
      from: {
        datasetId: "left",
        sourceField: "Employee ID",
        canonicalField: "employee_id",
        inferredType: "string",
      },
      to: {
        datasetId: "right",
        sourceField: "Employee ID",
        canonicalField: "employee_id",
        inferredType: "string",
      },
      statistics: {
        fromNonNullCount: 200,
        fromDistinctCount: 80,
        toNonNullCount: 300,
        toDistinctCount: 100,
        overlapDistinctCount: 20,
      },
    });

    expect(relationship.cardinality).toBe("N:N");
    expect(relationship.matchRate).toBe(25);
    expect(relationship.conflicts).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/half/i),
        expect.stringMatching(/N:N/),
      ]),
    );
    expect(JSON.stringify(relationship)).not.toContain("E001");
  });
});
