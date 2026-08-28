import { normalizeHeader } from "@/lib/data/canonical-schema";
import type {
  ColumnDataType,
  DatasetRelationship,
} from "@/types/workbench";
import { isIdentifierCanonicalField } from "./canonical-fields";

export interface RelationshipColumnEvidence {
  datasetId: string;
  sourceField: string;
  canonicalField?: string;
  inferredType: ColumnDataType;
}

export interface RelationshipOverlapStatistics {
  fromNonNullCount: number;
  fromDistinctCount: number;
  toNonNullCount: number;
  toDistinctCount: number;
  overlapDistinctCount: number;
}

export interface RelationshipScoringInput {
  from: RelationshipColumnEvidence;
  to: RelationshipColumnEvidence;
  statistics: RelationshipOverlapStatistics;
}

export interface TypeCompatibility {
  compatible: boolean;
  score: number;
  evidence: string;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratio(numerator: number, denominator: number) {
  return numerator / Math.max(denominator, 1);
}

export function assessTypeCompatibility(
  fromType: ColumnDataType,
  toType: ColumnDataType,
  canonicalField?: string,
): TypeCompatibility {
  if (fromType === toType && fromType !== "unknown") {
    return {
      compatible: true,
      score: 100,
      evidence: `Both columns are inferred as ${fromType}.`,
    };
  }

  if (fromType === "unknown" || toType === "unknown") {
    return {
      compatible: true,
      score: 45,
      evidence: "At least one column has an unknown type; compatibility is provisional.",
    };
  }

  if (
    isIdentifierCanonicalField(canonicalField) &&
    ((fromType === "number" && toType === "string") ||
      (fromType === "string" && toType === "number"))
  ) {
    return {
      compatible: true,
      score: 80,
      evidence:
        "The identifier is numeric in one dataset and text in the other; local comparison normalizes both to text.",
    };
  }

  return {
    compatible: false,
    score: 0,
    evidence: `Column types ${fromType} and ${toType} are incompatible.`,
  };
}

export function inferRelationshipCardinality(
  statistics: RelationshipOverlapStatistics,
): DatasetRelationship["cardinality"] {
  if (
    statistics.fromNonNullCount === 0 ||
    statistics.toNonNullCount === 0
  ) {
    return "unknown";
  }

  const fromUnique =
    ratio(statistics.fromDistinctCount, statistics.fromNonNullCount) >= 0.995;
  const toUnique =
    ratio(statistics.toDistinctCount, statistics.toNonNullCount) >= 0.995;
  if (fromUnique && toUnique) return "1:1";
  if (fromUnique) return "1:N";
  if (toUnique) return "N:1";
  return "N:N";
}

function canonicalAlignment(
  from: RelationshipColumnEvidence,
  to: RelationshipColumnEvidence,
) {
  if (
    from.canonicalField &&
    to.canonicalField &&
    from.canonicalField === to.canonicalField
  ) {
    return {
      score: 100,
      canonicalField: from.canonicalField,
      evidence: `Both columns map to ${from.canonicalField}.`,
    };
  }

  if (
    normalizeHeader(from.sourceField) === normalizeHeader(to.sourceField)
  ) {
    return {
      score: 65,
      canonicalField: from.canonicalField ?? to.canonicalField,
      evidence: "Normalized source-column names match without a shared canonical mapping.",
    };
  }

  return {
    score: 0,
    canonicalField: from.canonicalField ?? to.canonicalField,
    evidence: "Columns do not share a canonical mapping or normalized name.",
  };
}

export function scoreRelationshipCandidate(
  input: RelationshipScoringInput,
): DatasetRelationship {
  const { from, to, statistics } = input;
  const alignment = canonicalAlignment(from, to);
  const compatibility = assessTypeCompatibility(
    from.inferredType,
    to.inferredType,
    alignment.canonicalField,
  );
  const cardinality = inferRelationshipCardinality(statistics);
  const fromCoverage = ratio(
    statistics.overlapDistinctCount,
    statistics.fromDistinctCount,
  );
  const toCoverage = ratio(
    statistics.overlapDistinctCount,
    statistics.toDistinctCount,
  );
  const matchRate = clampScore(
    Math.min(
      1,
      ratio(
        statistics.overlapDistinctCount,
        Math.min(
          statistics.fromDistinctCount,
          statistics.toDistinctCount,
        ),
      ),
    ) * 100,
  );
  const cardinalityScore =
    cardinality === "1:1"
      ? 100
      : cardinality === "1:N" || cardinality === "N:1"
        ? 90
        : cardinality === "N:N"
          ? 45
          : 20;
  const conflicts: string[] = [];

  if (alignment.score === 0) {
    conflicts.push("No canonical or normalized-name alignment.");
  }
  if (!compatibility.compatible) {
    conflicts.push("Incompatible column types.");
  }
  if (statistics.overlapDistinctCount === 0) {
    conflicts.push("No overlapping non-null values were found.");
  } else if (matchRate < 50) {
    conflicts.push("Fewer than half of the smaller distinct-value set matches.");
  }
  if (cardinality === "N:N") {
    conflicts.push("Both fields contain duplicate keys, producing an N:N join.");
  }

  const confidence = clampScore(
    alignment.score * 0.35 +
      compatibility.score * 0.2 +
      matchRate * 0.35 +
      cardinalityScore * 0.1,
  );
  const evidence = [
    alignment.evidence,
    compatibility.evidence,
    `${statistics.overlapDistinctCount.toLocaleString()} normalized distinct values overlap.`,
    `${(fromCoverage * 100).toFixed(1)}% of from-values and ${(toCoverage * 100).toFixed(1)}% of to-values overlap.`,
    `Observed cardinality is ${cardinality}.`,
  ];

  return {
    id: `relationship:${from.datasetId}:${from.sourceField}->${to.datasetId}:${to.sourceField}`,
    fromDatasetId: from.datasetId,
    fromField: from.sourceField,
    toDatasetId: to.datasetId,
    toField: to.sourceField,
    cardinality,
    matchRate,
    confidence,
    status: "Proposed",
    evidence,
    conflicts,
  };
}
