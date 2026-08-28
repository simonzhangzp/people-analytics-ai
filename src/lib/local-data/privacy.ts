import { normalizeHeader } from "@/lib/data/canonical-schema";
import type { DataRow } from "@/types/local-data";
import type { ColumnProfile } from "@/types/workbench";

export function isPrivateExplorationColumn(
  column: Pick<
    ColumnProfile,
    "likelyPII" | "sensitive" | "semanticRole" | "canonicalField"
  >,
): boolean {
  return Boolean(
    column.likelyPII ||
      column.sensitive ||
      column.semanticRole === "pii" ||
      column.semanticRole === "sensitive_dimension" ||
      column.canonicalField === "manager_id",
  );
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
