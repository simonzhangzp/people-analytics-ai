import { normalizeHeader } from "@/lib/data/canonical-schema";
import type { DataRow } from "@/types/local-data";
import type { ColumnProfile } from "@/types/workbench";

export function isDirectIdentifierColumn(
  column: Pick<
    ColumnProfile,
    "likelyPII" | "semanticRole" | "canonicalField"
  >,
): boolean {
  return Boolean(
    column.likelyPII ||
      column.semanticRole === "pii" ||
      column.semanticRole === "person_id" ||
      column.canonicalField === "employee_id" ||
      column.canonicalField === "employee_name" ||
      column.canonicalField === "candidate_id" ||
      column.canonicalField === "manager_id" ||
      column.canonicalField === "manager_name" ||
      column.canonicalField === "email",
  );
}

export function isPrivateExplorationColumn(
  column: Pick<
    ColumnProfile,
    "likelyPII" | "sensitive" | "semanticRole" | "canonicalField"
  >,
): boolean {
  return Boolean(
    isDirectIdentifierColumn(column) ||
      column.sensitive ||
      column.semanticRole === "sensitive_dimension",
  );
}

export function isSafeAggregateDimension(
  column: Pick<
    ColumnProfile,
    | "likelyPII"
    | "sensitive"
    | "semanticRole"
    | "canonicalField"
    | "inferredType"
  >,
): boolean {
  if (isDirectIdentifierColumn(column)) return false;
  if (column.inferredType === "number") return false;
  return ![
    "measure",
    "amount",
    "rating",
    "person_id",
    "entity_id",
    "event_id",
  ].includes(column.semanticRole ?? "");
}

export function publicExplorationColumnNames(
  columns: readonly ColumnProfile[],
): string[] {
  return columns
    .filter((column) => !isPrivateExplorationColumn(column))
    .map((column) => column.sourceName);
}

export function omitPrivateExplorationColumns(
  row: DataRow,
  columns: readonly ColumnProfile[],
): DataRow {
  const privateNames = new Set(
    columns
      .filter(isPrivateExplorationColumn)
      .map((column) => normalizeHeader(column.sourceName)),
  );
  return Object.fromEntries(
    Object.entries(row).filter(
      ([key]) => !privateNames.has(normalizeHeader(key)),
    ),
  );
}
