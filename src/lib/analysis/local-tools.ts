"use client";

import "client-only";

import { queryDuckDBPrepared } from "@/lib/local-data/duckdb-client";
import { quoteIdentifier } from "@/lib/local-data/sql";
import type { LocalWorkbenchDataset } from "@/types/workbench";

export interface SchemaColumnView {
  sourceName: string;
  canonicalField?: string;
  semanticRole?: string;
  inferredType: string;
  distinctCount: number;
  nullPct: number;
}

export interface ColumnProfileView {
  sourceName: string;
  populated: number;
  distinctCount: number;
  minNumeric: number | null;
  maxNumeric: number | null;
  sumNumeric: number | null;
}

export interface DistinctValueView {
  value: string;
  count: number;
}

function numericSql(sourceName: string) {
  const column = quoteIdentifier(sourceName);
  return `TRY_CAST(REPLACE(REPLACE(TRIM(CAST(${column} AS VARCHAR)), ',', ''), '%', '') AS DOUBLE)`;
}

export function inspectSchema(
  dataset: LocalWorkbenchDataset,
): SchemaColumnView[] {
  return dataset.metadata.columns.map((column) => ({
    sourceName: column.sourceName,
    canonicalField: column.canonicalField,
    semanticRole: column.semanticRole,
    inferredType: column.inferredType,
    distinctCount: column.distinctCount,
    nullPct: column.nullPct,
  }));
}

export async function profileColumn(
  dataset: LocalWorkbenchDataset,
  sourceName: string,
): Promise<ColumnProfileView> {
  const column = quoteIdentifier(sourceName);
  const [row] = await queryDuckDBPrepared(
    `SELECT
      COUNT(${column}) AS populated,
      COUNT(DISTINCT TRIM(CAST(${column} AS VARCHAR))) AS distinct_count,
      MIN(${numericSql(sourceName)}) AS min_n,
      MAX(${numericSql(sourceName)}) AS max_n,
      SUM(${numericSql(sourceName)}) AS sum_n
    FROM ${quoteIdentifier(dataset.metadata.localTableName)}`,
  );
  const asNumber = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  return {
    sourceName,
    populated: asNumber(row?.populated) ?? 0,
    distinctCount: asNumber(row?.distinct_count) ?? 0,
    minNumeric: asNumber(row?.min_n),
    maxNumeric: asNumber(row?.max_n),
    sumNumeric: asNumber(row?.sum_n),
  };
}

export async function distinctValues(
  dataset: LocalWorkbenchDataset,
  sourceName: string,
  limit = 80,
): Promise<DistinctValueView[]> {
  const column = quoteIdentifier(sourceName);
  const rows = await queryDuckDBPrepared(
    `SELECT
      TRIM(CAST(${column} AS VARCHAR)) AS value,
      COUNT(*) AS n
    FROM ${quoteIdentifier(dataset.metadata.localTableName)}
    WHERE ${column} IS NOT NULL
      AND TRIM(CAST(${column} AS VARCHAR)) <> ''
    GROUP BY value
    ORDER BY n DESC
    LIMIT ${Math.max(1, Math.min(limit, 200))}`,
  );
  return rows.flatMap((row) => {
    const value = row.value === null || row.value === undefined
      ? ""
      : String(row.value).trim();
    const count = Number(row.n);
    return value && Number.isFinite(count)
      ? [{ value, count }]
      : [];
  });
}
