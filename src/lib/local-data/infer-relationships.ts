"use client";

import "client-only";

import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import {
  isIdentifierCanonicalField,
  scoreRelationshipCandidate,
  type RelationshipOverlapStatistics,
} from "@/lib/semantics";
import type {
  ColumnProfile,
  DatasetMetadata,
  DatasetRelationship,
} from "@/types/workbench";
import { queryDuckDB } from "./duckdb-client";
import { quoteIdentifier } from "./sql";

interface RelationshipCandidate {
  fromDataset: DatasetMetadata;
  fromColumn: ColumnProfile;
  toDataset: DatasetMetadata;
  toColumn: ColumnProfile;
}

function asNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function relationshipCandidates(
  fromDataset: DatasetMetadata,
  toDataset: DatasetMetadata,
) {
  const candidates: RelationshipCandidate[] = [];
  for (const fromColumn of fromDataset.columns) {
    if (!isIdentifierCanonicalField(fromColumn.canonicalField)) continue;
    for (const toColumn of toDataset.columns) {
      if (
        fromColumn.canonicalField &&
        fromColumn.canonicalField === toColumn.canonicalField
      ) {
        candidates.push({
          fromDataset,
          fromColumn,
          toDataset,
          toColumn,
        });
      }
    }
  }
  return candidates;
}

function normalizedValuesSql(tableName: string, columnName: string) {
  const column = quoteIdentifier(columnName);
  return `SELECT
      LOWER(TRIM(CAST(${column} AS VARCHAR))) AS value_key,
      COUNT(*) AS occurrence_count
    FROM ${quoteIdentifier(tableName)}
    WHERE ${column} IS NOT NULL
      AND TRIM(CAST(${column} AS VARCHAR)) <> ''
    GROUP BY value_key`;
}

async function measureValueOverlap(
  connection: AsyncDuckDBConnection,
  candidate: RelationshipCandidate,
): Promise<RelationshipOverlapStatistics> {
  const [statistics] = await queryDuckDB(
    `WITH
      from_values AS (
        ${normalizedValuesSql(
          candidate.fromDataset.localTableName,
          candidate.fromColumn.sourceName,
        )}
      ),
      to_values AS (
        ${normalizedValuesSql(
          candidate.toDataset.localTableName,
          candidate.toColumn.sourceName,
        )}
      )
    SELECT
      (SELECT COALESCE(SUM(occurrence_count), 0) FROM from_values) AS from_non_null_count,
      (SELECT COUNT(*) FROM from_values) AS from_distinct_count,
      (SELECT COALESCE(SUM(occurrence_count), 0) FROM to_values) AS to_non_null_count,
      (SELECT COUNT(*) FROM to_values) AS to_distinct_count,
      (
        SELECT COUNT(*)
        FROM from_values
        INNER JOIN to_values USING (value_key)
      ) AS overlap_distinct_count`,
    connection,
  );

  return {
    fromNonNullCount: asNumber(statistics?.from_non_null_count),
    fromDistinctCount: asNumber(statistics?.from_distinct_count),
    toNonNullCount: asNumber(statistics?.to_non_null_count),
    toDistinctCount: asNumber(statistics?.to_distinct_count),
    overlapDistinctCount: asNumber(statistics?.overlap_distinct_count),
  };
}

async function scoreCandidate(
  connection: AsyncDuckDBConnection,
  candidate: RelationshipCandidate,
) {
  const statistics = await measureValueOverlap(connection, candidate);
  return scoreRelationshipCandidate({
    from: {
      datasetId: candidate.fromDataset.id,
      sourceField: candidate.fromColumn.sourceName,
      canonicalField: candidate.fromColumn.canonicalField,
      inferredType: candidate.fromColumn.inferredType,
    },
    to: {
      datasetId: candidate.toDataset.id,
      sourceField: candidate.toColumn.sourceName,
      canonicalField: candidate.toColumn.canonicalField,
      inferredType: candidate.toColumn.inferredType,
    },
    statistics,
  });
}

export async function inferDatasetRelationships(
  connection: AsyncDuckDBConnection,
  datasets: DatasetMetadata[],
): Promise<DatasetRelationship[]> {
  const relationships: DatasetRelationship[] = [];

  for (let fromIndex = 0; fromIndex < datasets.length; fromIndex += 1) {
    for (
      let toIndex = fromIndex + 1;
      toIndex < datasets.length;
      toIndex += 1
    ) {
      const candidates = relationshipCandidates(
        datasets[fromIndex],
        datasets[toIndex],
      );
      const scored = await Promise.all(
        candidates.map((candidate) => scoreCandidate(connection, candidate)),
      );
      const bestByCanonicalField = new Map<string, DatasetRelationship>();
      for (const relationship of scored) {
        const fromColumn = datasets[fromIndex].columns.find(
          (column) => column.sourceName === relationship.fromField,
        );
        const key =
          fromColumn?.canonicalField ??
          `${relationship.fromField}:${relationship.toField}`;
        const current = bestByCanonicalField.get(key);
        if (
          !current ||
          relationship.confidence > current.confidence ||
          (relationship.confidence === current.confidence &&
            relationship.matchRate > current.matchRate)
        ) {
          bestByCanonicalField.set(key, relationship);
        }
      }
      relationships.push(...bestByCanonicalField.values());
    }
  }

  return relationships;
}
