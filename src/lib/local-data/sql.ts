export const EXPLORATION_ROW_LIMIT = 5_000;

export type SqlLiteralValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | null;

function rejectNullByte(value: string, label: string) {
  if (value.includes("\0")) {
    throw new Error(`${label} cannot contain a null byte.`);
  }
}

export function quoteIdentifier(identifier: string) {
  if (identifier.length === 0) {
    throw new Error("SQL identifiers cannot be empty.");
  }
  rejectNullByte(identifier, "SQL identifiers");
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function quoteLiteral(value: SqlLiteralValue): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("SQL numeric literals must be finite.");
    }
    return String(value);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("SQL date literals must be valid.");
    }
    return `TIMESTAMP '${value.toISOString().replaceAll("'", "''")}'`;
  }

  rejectNullByte(value, "SQL string literals");
  return `'${value.replaceAll("'", "''")}'`;
}

export function boundedExplorationLimit(requested = EXPLORATION_ROW_LIMIT) {
  if (!Number.isFinite(requested)) return EXPLORATION_ROW_LIMIT;
  return Math.max(
    0,
    Math.min(EXPLORATION_ROW_LIMIT, Math.floor(requested)),
  );
}

export function buildExplorationQuery(
  tableName: string,
  columnNames: readonly string[],
  requestedLimit = EXPLORATION_ROW_LIMIT,
) {
  if (columnNames.length === 0) {
    throw new Error("Exploration requires at least one de-identified column.");
  }
  const projection = columnNames.map(quoteIdentifier).join(", ");
  return `SELECT ${projection} FROM ${quoteIdentifier(tableName)} LIMIT ${boundedExplorationLimit(requestedLimit)}`;
}
