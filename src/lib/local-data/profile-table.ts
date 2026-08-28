"use client";

import "client-only";

import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import {
  buildTableContract,
  expectedColumnType,
  inferTableGrain,
  isWorkbenchLikelyPii,
  resolveWorkbenchCanonicalField,
  type GrainKeyStatistics,
  type SemanticExpectedType,
  type TableInference,
} from "@/lib/semantics";
import type {
  ColumnDataType,
  ColumnProfile,
  DataQualityIssue,
  DatasetMetadata,
} from "@/types/workbench";
import { queryDuckDB } from "./duckdb-client";
import {
  buildDatasetFingerprintStructure,
  fingerprintDatasetStructure,
} from "./fingerprint";
import { buildSafeDatasetProfile } from "./safe-profile";
import { quoteIdentifier } from "./sql";

interface DescribedColumn {
  sourceName: string;
  nativeType: string;
}

function asNumber(value: unknown) {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundPercent(numerator: number, denominator: number) {
  return Math.round((numerator / Math.max(denominator, 1)) * 10_000) / 100;
}

export function columnDataTypeFromDuckDB(
  nativeType: string,
): ColumnDataType {
  const type = nativeType.toUpperCase();
  if (/BOOL/.test(type)) return "boolean";
  if (/DATE|TIME/.test(type)) return "date";
  if (
    /TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|DECIMAL|NUMERIC|REAL|FLOAT|DOUBLE/.test(
      type,
    )
  ) {
    return "number";
  }
  if (/CHAR|VARCHAR|STRING|UUID|ENUM/.test(type)) return "string";
  return "unknown";
}

function semanticColumnType(
  nativeType: string,
  expectedType?: SemanticExpectedType,
) {
  const inferred = columnDataTypeFromDuckDB(nativeType);
  if (
    inferred === "string" &&
    expectedType &&
    expectedType !== "id" &&
    expectedType !== "string"
  ) {
    return expectedColumnType(expectedType);
  }
  return inferred;
}

function profileAlias(index: number, metric: string) {
  return `__column_${index}_${metric}`;
}

function minMaxValue(
  value: unknown,
  inferredType: ColumnDataType,
): string | number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (inferredType === "number") {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return String(value);
}

async function describeTable(
  connection: AsyncDuckDBConnection,
  tableName: string,
): Promise<DescribedColumn[]> {
  const rows = await queryDuckDB(
    `DESCRIBE ${quoteIdentifier(tableName)}`,
    connection,
  );
  return rows.map((row) => ({
    sourceName: String(row.column_name),
    nativeType: String(row.column_type),
  }));
}

async function buildColumnProfiles(
  connection: AsyncDuckDBConnection,
  tableName: string,
  describedColumns: DescribedColumn[],
) {
  const mappedColumns = describedColumns.map((column) => ({
    ...column,
    mapping: resolveWorkbenchCanonicalField(column.sourceName),
    likelyPii: isWorkbenchLikelyPii(column.sourceName),
  }));
  const aggregates = mappedColumns.flatMap((column, index) => {
    const identifier = quoteIdentifier(column.sourceName);
    const expressions = [
      `COUNT(*) FILTER (WHERE ${identifier} IS NULL) AS ${quoteIdentifier(profileAlias(index, "null"))}`,
      `COUNT(DISTINCT ${identifier}) AS ${quoteIdentifier(profileAlias(index, "distinct"))}`,
    ];
    if (!column.likelyPii && !column.mapping?.sensitive) {
      expressions.push(
        `CAST(MIN(${identifier}) AS VARCHAR) AS ${quoteIdentifier(profileAlias(index, "min"))}`,
        `CAST(MAX(${identifier}) AS VARCHAR) AS ${quoteIdentifier(profileAlias(index, "max"))}`,
      );
    }
    return expressions;
  });
  const [statistics] = await queryDuckDB(
    [
      `SELECT COUNT(*) AS ${quoteIdentifier("__row_count")}`,
      ...aggregates.map((aggregate) => `, ${aggregate}`),
      `FROM ${quoteIdentifier(tableName)}`,
    ].join("\n"),
    connection,
  );
  const rowCount = asNumber(statistics?.__row_count);
  const columns: ColumnProfile[] = mappedColumns.map((column, index) => {
    const nullCount = asNumber(statistics?.[profileAlias(index, "null")]);
    const distinctCount = asNumber(
      statistics?.[profileAlias(index, "distinct")],
    );
    const inferredType = semanticColumnType(
      column.nativeType,
      column.mapping?.expectedType,
    );
    const likelyPII = column.likelyPii;

    return {
      sourceName: column.sourceName,
      inferredType,
      rowCount,
      nullCount,
      nullPct: roundPercent(nullCount, rowCount),
      distinctCount,
      distinctPct: roundPercent(distinctCount, rowCount),
      min: likelyPII || column.mapping?.sensitive
        ? undefined
        : minMaxValue(
            statistics?.[profileAlias(index, "min")],
            inferredType,
          ),
      max: likelyPII || column.mapping?.sensitive
        ? undefined
        : minMaxValue(
            statistics?.[profileAlias(index, "max")],
            inferredType,
          ),
      likelyPII,
      sensitive: column.mapping?.sensitive,
      canonicalField: column.mapping?.canonicalField,
      semanticRole:
        column.mapping?.semanticRole ??
        (likelyPII
          ? "pii"
          : inferredType === "date"
            ? "event_date"
            : inferredType === "number"
              ? "measure"
              : undefined),
      semanticMeaning: column.mapping?.semanticMeaning,
      confidence: column.mapping?.confidence,
    };
  });

  return { rowCount, columns };
}

async function measureGrainKeys(
  connection: AsyncDuckDBConnection,
  tableName: string,
  inference: TableInference,
): Promise<GrainKeyStatistics | undefined> {
  if (inference.grain.keys.length === 0) return undefined;

  const keys = inference.grain.keys.map(quoteIdentifier);
  const populated = keys.map((key) => `${key} IS NOT NULL`).join(" AND ");
  const distinctExpression =
    keys.length === 1 ? keys[0] : `(${keys.join(", ")})`;
  const [statistics] = await queryDuckDB(
    `SELECT
      COUNT(*) AS ${quoteIdentifier("row_count")},
      COUNT(*) FILTER (WHERE ${populated}) AS ${quoteIdentifier("non_null_count")},
      COUNT(DISTINCT ${distinctExpression}) FILTER (WHERE ${populated}) AS ${quoteIdentifier("distinct_key_count")}
    FROM ${quoteIdentifier(tableName)}`,
    connection,
  );

  return {
    rowCount: asNumber(statistics?.row_count),
    nonNullRowCount: asNumber(statistics?.non_null_count),
    distinctKeyCount: asNumber(statistics?.distinct_key_count),
  };
}

function buildTimeRange(columns: ColumnProfile[]) {
  const preferredCanonicalFields = [
    "snapshot_month",
    "compensation_snapshot_date",
    "compensation_effective_date",
    "term_date",
    "hire_date",
  ];
  const dates = columns
    .filter(
      (column) =>
        column.inferredType === "date" &&
        column.min !== undefined &&
        column.max !== undefined,
    )
    .sort((left, right) => {
      const leftPriority = preferredCanonicalFields.indexOf(
        left.canonicalField ?? "",
      );
      const rightPriority = preferredCanonicalFields.indexOf(
        right.canonicalField ?? "",
      );
      return (
        (leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority) -
        (rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority)
      );
    });
  const selected = dates[0];
  if (!selected) return undefined;
  return `${selected.min} – ${selected.max}`;
}

function assessDataQuality(
  columns: ColumnProfile[],
  inference: TableInference,
  keyStatistics?: GrainKeyStatistics,
) {
  const issues: DataQualityIssue[] = [];
  let healthScore = 100;

  if (inference.grain.keys.length === 0) {
    healthScore -= 30;
    issues.push({
      id: "unknown-grain",
      severity: "High",
      title: "Dataset grain needs review",
      detail: "No deterministic table-type rule identified a row grain.",
      impact: "Counts and joins can be overstated if rows are duplicated.",
      recommendation: "Map an employee/event identifier and the relevant time field.",
    });
  }

  const emptyColumns = columns.filter(
    (column) => column.nullCount === column.rowCount,
  );
  if (emptyColumns.length > 0) {
    healthScore -= Math.min(15, emptyColumns.length * 3);
    issues.push({
      id: "empty-columns",
      severity: "Medium",
      title: "Columns contain no populated values",
      detail: emptyColumns.map((column) => column.sourceName).join(", "),
      impact: "These fields cannot support metrics, filters, or relationships.",
      recommendation: "Remove empty fields or correct the source extraction.",
    });
  }

  if (keyStatistics && keyStatistics.nonNullRowCount < keyStatistics.rowCount) {
    const missing =
      keyStatistics.rowCount - keyStatistics.nonNullRowCount;
    const missingPct = roundPercent(missing, keyStatistics.rowCount);
    healthScore -= Math.min(20, Math.ceil(missingPct / 2));
    issues.push({
      id: "missing-grain-keys",
      severity: missingPct >= 10 ? "High" : "Medium",
      title: "Proposed grain keys contain nulls",
      detail: `${missingPct.toFixed(1)}% of rows lack at least one proposed key.`,
      impact: "Those rows cannot be joined or deduplicated deterministically.",
      recommendation: "Repair missing keys or define an explicit exclusion rule.",
    });
  }

  if (
    keyStatistics &&
    keyStatistics.distinctKeyCount < keyStatistics.nonNullRowCount
  ) {
    const duplicatePct = roundPercent(
      keyStatistics.nonNullRowCount - keyStatistics.distinctKeyCount,
      keyStatistics.nonNullRowCount,
    );
    healthScore -= Math.min(20, Math.ceil(duplicatePct));
    issues.push({
      id: "duplicate-grain-keys",
      severity: duplicatePct >= 5 ? "High" : "Medium",
      title: "Rows repeat at the proposed grain",
      detail: `${duplicatePct.toFixed(1)}% of populated grain keys repeat.`,
      impact: "Aggregations can double-count people or events.",
      recommendation: "Confirm the grain and define a deterministic deduplication rule.",
    });
  }

  return {
    healthScore: Math.max(0, Math.round(healthScore)),
    issues,
  };
}

export async function profileDuckDBTable(
  connection: AsyncDuckDBConnection,
  tableName: string,
  file: Pick<File, "name" | "size">,
): Promise<DatasetMetadata> {
  const describedColumns = await describeTable(connection, tableName);
  if (describedColumns.length === 0) {
    throw new Error(`${file.name} does not contain any columns.`);
  }

  const initialProfile = await buildColumnProfiles(
    connection,
    tableName,
    describedColumns,
  );
  if (initialProfile.rowCount === 0) {
    throw new Error(`${file.name} does not contain any data rows.`);
  }

  const initialInference = inferTableGrain({
    columns: initialProfile.columns,
  });
  const keyStatistics = await measureGrainKeys(
    connection,
    tableName,
    initialInference,
  );
  const inference = inferTableGrain({
    columns: initialProfile.columns,
    keyStatistics,
  });
  const quality = assessDataQuality(
    initialProfile.columns,
    inference,
    keyStatistics,
  );
  const fingerprint = await fingerprintDatasetStructure(
    buildDatasetFingerprintStructure({
      rowCount: initialProfile.rowCount,
      inferredType: inference.inferredType,
      grain: inference.grain,
      columns: initialProfile.columns,
    }),
  );
  const safeProfile = buildSafeDatasetProfile({
    name: file.name,
    rowCount: initialProfile.rowCount,
    inferredType: inference.inferredType,
    grain: inference.grain,
    grainConfidence: inference.grainConfidence,
    timeRange: buildTimeRange(initialProfile.columns),
    columns: initialProfile.columns,
  });
  const datasetId = `dataset:${tableName}`;
  const tableContract = buildTableContract({
    datasetId,
    columns: initialProfile.columns,
    inference,
  });

  return {
    id: datasetId,
    name: file.name,
    fingerprint,
    localTableName: tableName,
    fileSize: file.size,
    rowCount: initialProfile.rowCount,
    inferredType: inference.inferredType,
    typeConfidence: inference.typeConfidence,
    grain: inference.grain,
    grainConfidence: inference.grainConfidence,
    columns: initialProfile.columns,
    timeRange: safeProfile.timeRange,
    healthScore: quality.healthScore,
    issues: quality.issues,
    status: "Proposed",
    tableContract,
    safeProfile,
  };
}
