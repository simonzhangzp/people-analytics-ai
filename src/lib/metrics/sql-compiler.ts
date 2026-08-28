import type {
  MetricDefinition,
  MetricExpression,
  MetricRule,
} from "@/types/workbench";

export type SqlParameter = string | number | boolean | null;

export interface CompiledSqlFragment {
  sql: string;
  parameters: SqlParameter[];
}

export interface CompiledMetricQuery extends CompiledSqlFragment {
  metricId: string;
  metricKey: string;
}

export interface MetricQueryOptions {
  tableName: string;
  alias?: string;
  groupBy?: readonly string[];
  rules?: readonly MetricRule[];
}

const MAX_EXPRESSION_DEPTH = 16;

function assertIdentifier(identifier: string): void {
  if (!identifier.trim()) {
    throw new Error("SQL identifier cannot be empty.");
  }
  if (identifier.includes("\0")) {
    throw new Error("SQL identifier cannot contain a null byte.");
  }
}

/**
 * DuckDB identifiers are never interpolated raw. Qualified names are escaped
 * one component at a time, so quote characters remain part of an identifier.
 */
export function escapeSqlIdentifier(identifier: string): string {
  assertIdentifier(identifier);
  return identifier
    .split(".")
    .map((part) => {
      assertIdentifier(part);
      return `"${part.replace(/"/g, '""')}"`;
    })
    .join(".");
}

function asParameter(value: unknown): SqlParameter {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Metric rule numbers must be finite.");
    }
    return value;
  }
  throw new Error("Metric rules only accept scalar string, number, boolean, or null values.");
}

function requiredScalar(rule: MetricRule): SqlParameter {
  if (Array.isArray(rule.value) || rule.value === undefined) {
    throw new Error(`Metric rule ${rule.label} requires a scalar value.`);
  }
  return asParameter(rule.value);
}

export function compileMetricRule(rule: MetricRule): CompiledSqlFragment {
  const field = escapeSqlIdentifier(rule.field);

  switch (rule.operator) {
    case "is_null":
      return { sql: `${field} IS NULL`, parameters: [] };
    case "is_not_null":
      return { sql: `${field} IS NOT NULL`, parameters: [] };
    case "equals":
      return { sql: `${field} = ?`, parameters: [requiredScalar(rule)] };
    case "not_equals":
      return { sql: `${field} <> ?`, parameters: [requiredScalar(rule)] };
    case "before":
      return { sql: `${field} < ?`, parameters: [requiredScalar(rule)] };
    case "after":
      return { sql: `${field} > ?`, parameters: [requiredScalar(rule)] };
    case "in":
    case "not_in": {
      if (!Array.isArray(rule.value)) {
        throw new Error(`Metric rule ${rule.label} requires an array value.`);
      }
      if (rule.value.length === 0) {
        return {
          sql: rule.operator === "in" ? "FALSE" : "TRUE",
          parameters: [],
        };
      }
      const parameters = rule.value.map(asParameter);
      const placeholders = parameters.map(() => "?").join(", ");
      return {
        sql: `${field} ${rule.operator === "in" ? "IN" : "NOT IN"} (${placeholders})`,
        parameters,
      };
    }
    default: {
      const unsupported: never = rule.operator;
      throw new Error(`Unsupported metric rule operator: ${String(unsupported)}`);
    }
  }
}

export function compileMetricRules(
  rules: readonly MetricRule[],
): CompiledSqlFragment {
  const fragments = rules.map(compileMetricRule);
  return {
    sql: fragments.length
      ? fragments.map((fragment) => `(${fragment.sql})`).join(" AND ")
      : "TRUE",
    parameters: fragments.flatMap((fragment) => fragment.parameters),
  };
}

function aggregateFilter(rules: readonly MetricRule[] | undefined): CompiledSqlFragment {
  if (!rules?.length) return { sql: "", parameters: [] };
  const compiled = compileMetricRules(rules);
  return {
    sql: ` FILTER (WHERE ${compiled.sql})`,
    parameters: compiled.parameters,
  };
}

function compileExpression(
  expression: MetricExpression,
  depth: number,
): CompiledSqlFragment {
  if (depth > MAX_EXPRESSION_DEPTH) {
    throw new Error(`Metric expression exceeds maximum depth ${MAX_EXPRESSION_DEPTH}.`);
  }

  switch (expression.kind) {
    case "count": {
      const target = expression.distinctField
        ? `DISTINCT ${escapeSqlIdentifier(expression.distinctField)}`
        : "*";
      const filter = aggregateFilter(expression.rules);
      return {
        sql: `COUNT(${target})${filter.sql}`,
        parameters: filter.parameters,
      };
    }
    case "average": {
      const filter = aggregateFilter(expression.rules);
      return {
        sql: `AVG(TRY_CAST(${escapeSqlIdentifier(expression.field)} AS DOUBLE))${filter.sql}`,
        parameters: filter.parameters,
      };
    }
    case "duration": {
      const duration = `date_diff('day', TRY_CAST(${escapeSqlIdentifier(
        expression.startField,
      )} AS TIMESTAMP), TRY_CAST(${escapeSqlIdentifier(
        expression.endField,
      )} AS TIMESTAMP))`;
      return {
        sql:
          expression.aggregation === "median"
            ? `MEDIAN(${duration})`
            : `AVG(${duration})`,
        parameters: [],
      };
    }
    case "ratio": {
      if (!Number.isFinite(expression.multiplier)) {
        throw new Error("Metric ratio multiplier must be finite.");
      }
      const numerator = compileExpression(expression.numerator, depth + 1);
      const denominator = compileExpression(expression.denominator, depth + 1);
      return {
        sql: `((${numerator.sql}) * ?) / NULLIF((${denominator.sql}), 0)`,
        parameters: [
          ...numerator.parameters,
          expression.multiplier,
          ...denominator.parameters,
        ],
      };
    }
    default: {
      const unsupported: never = expression;
      throw new Error(
        `Unsupported metric expression: ${String(
          (unsupported as { kind?: unknown }).kind,
        )}`,
      );
    }
  }
}

export function compileMetricExpression(
  expression: MetricExpression,
): CompiledSqlFragment {
  return compileExpression(expression, 0);
}

/**
 * Compiles only the controlled expression tree and controlled rules. There is
 * deliberately no raw SQL input or passthrough path.
 */
export function compileMetricQuery(
  definition: MetricDefinition,
  options: MetricQueryOptions,
): CompiledMetricQuery {
  const expression = compileMetricExpression(definition.formula);
  const rules = compileMetricRules(options.rules ?? []);
  const groupBy = options.groupBy ?? [];
  const groupSql = groupBy.map(escapeSqlIdentifier);
  const valueAlias = escapeSqlIdentifier(options.alias ?? definition.key);
  const select = [
    ...groupSql,
    `${expression.sql} AS ${valueAlias}`,
  ].join(", ");

  return {
    metricId: definition.id,
    metricKey: definition.key,
    sql: [
      `SELECT ${select}`,
      `FROM ${escapeSqlIdentifier(options.tableName)}`,
      options.rules?.length ? `WHERE ${rules.sql}` : "",
      groupSql.length ? `GROUP BY ${groupSql.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    parameters: [...expression.parameters, ...rules.parameters],
  };
}
