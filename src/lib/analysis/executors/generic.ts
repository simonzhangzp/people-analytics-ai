import { queryDuckDBPrepared } from "@/lib/local-data/duckdb-client";
import { quoteIdentifier } from "@/lib/local-data/sql";
import { compileMetricQuery } from "@/lib/metrics/sql-compiler";
import type {
  ChartDatum,
  ColumnProfile,
  Insight,
  InsightChartSpec,
  LocalWorkbenchDataset,
} from "@/types/workbench";
import type {
  AnalysisExecutionContext,
  DeterministicAnalysisOutput,
} from "./types";

export type ExecutorMode =
  | "workforce"
  | "retention"
  | "recruiting"
  | "compensation"
  | "performance"
  | "absence"
  | "engagement"
  | "learning"
  | "mobility"
  | "diversity";

export interface GenericExecutorConfig {
  mode: ExecutorMode;
  metricName: string;
  preferredFields: string[];
  categoryFields: string[];
  timeFields: string[];
  minSampleSize: number;
  limitations: string[];
}

interface PopulationFilter {
  label: string;
  sql: string;
  params: unknown[];
}

interface Measurement {
  label: string;
  value: number;
  unit: InsightChartSpec["unit"];
  formattedValue: string;
  finding: string;
  sampleSize: number;
  period?: string;
  evidence: Array<{ label: string; value: string; detail?: string }>;
  chart?: InsightChartSpec;
  limitations: string[];
}

function asNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function field(
  dataset: LocalWorkbenchDataset,
  canonicalFields: readonly string[],
): ColumnProfile | undefined {
  return canonicalFields
    .map((canonicalField) =>
      dataset.metadata.columns.find(
        (column) => column.canonicalField === canonicalField,
      ),
    )
    .find(Boolean);
}

function candidateScore(
  dataset: LocalWorkbenchDataset,
  config: GenericExecutorConfig,
) {
  const contract = dataset.metadata.tableContract;
  const fields = new Set(
    dataset.metadata.columns.flatMap((column) =>
      column.canonicalField ? [column.canonicalField] : [],
    ),
  );
  return (
    (contract?.domains.includes(config.mode) ? 20 : 0) +
    config.preferredFields.filter((candidate) => fields.has(candidate)).length *
      5 +
    (contract?.confidence ?? 0) * 10
  );
}

function selectDataset(
  datasets: readonly LocalWorkbenchDataset[],
  config: GenericExecutorConfig,
) {
  return [...datasets].sort(
    (left, right) =>
      candidateScore(right, config) - candidateScore(left, config),
  )[0];
}

function numericSql(sourceName: string) {
  const column = quoteIdentifier(sourceName);
  return `TRY_CAST(REPLACE(REPLACE(TRIM(CAST(${column} AS VARCHAR)), ',', ''), '%', '') AS DOUBLE)`;
}

function textSql(sourceName: string) {
  return `LOWER(TRIM(CAST(${quoteIdentifier(sourceName)} AS VARCHAR)))`;
}

function countSql(
  dataset: LocalWorkbenchDataset,
  aggregateField?: ColumnProfile,
) {
  if (aggregateField) {
    return `COALESCE(SUM(${numericSql(aggregateField.sourceName)}), 0)`;
  }
  const identity = field(dataset, [
    "employee_id",
    "application_id",
    "requisition_id",
    "candidate_id",
  ]);
  return identity
    ? `COUNT(DISTINCT ${quoteIdentifier(identity.sourceName)})`
    : "COUNT(*)";
}

function periodSql(column: ColumnProfile) {
  const source = quoteIdentifier(column.sourceName);
  if (column.inferredType === "date" || column.semanticRole === "event_date") {
    return `COALESCE(
      STRFTIME(TRY_CAST(${source} AS TIMESTAMP), '%Y-%m'),
      TRIM(CAST(${source} AS VARCHAR))
    )`;
  }
  return `TRIM(CAST(${source} AS VARCHAR))`;
}

async function hasNumericValues(
  dataset: LocalWorkbenchDataset,
  population: PopulationFilter,
  column: ColumnProfile,
) {
  const [row] = await queryDuckDBPrepared(
    `SELECT COUNT(${numericSql(column.sourceName)}) AS numeric_count
    FROM ${quoteIdentifier(dataset.metadata.localTableName)}
    WHERE ${population.sql}`,
    population.params,
  );
  return asNumber(row?.numeric_count) > 0;
}

function formatValue(
  value: number,
  unit: InsightChartSpec["unit"],
): string {
  const formatted = value.toLocaleString("en-US", {
    maximumFractionDigits: unit === "people" ? 0 : 1,
  });
  if (unit === "percent") return `${formatted}%`;
  if (unit === "days") return `${formatted} days`;
  return formatted;
}

async function resolvePopulation(
  dataset: LocalWorkbenchDataset,
  question: string,
  allowSensitive = false,
): Promise<PopulationFilter> {
  const candidates = dataset.metadata.columns.filter((column) => {
    if (column.likelyPII || (!allowSensitive && column.sensitive)) return false;
    return [
      "department",
      "country",
      "region",
      "location",
      "job_role",
      "seniority_level",
      "employee_type",
      "employment_status",
    ].includes(column.canonicalField ?? "");
  });
  const normalizedQuestion = question.toLocaleLowerCase();
  for (const column of candidates.slice(0, 6)) {
    const rows = await queryDuckDBPrepared(
      `SELECT
        TRIM(CAST(${quoteIdentifier(column.sourceName)} AS VARCHAR)) AS value,
        COUNT(*) AS frequency
      FROM ${quoteIdentifier(dataset.metadata.localTableName)}
      WHERE ${quoteIdentifier(column.sourceName)} IS NOT NULL
      GROUP BY value
      ORDER BY frequency DESC
      LIMIT 50`,
    );
    const match = rows.find((row) => {
      const value = String(row.value ?? "").trim();
      return value.length >= 2 && normalizedQuestion.includes(value.toLocaleLowerCase());
    });
    if (match) {
      const value = String(match.value);
      return {
        label: `${column.semanticMeaning ?? column.sourceName}: ${value}`,
        sql: `${textSql(column.sourceName)} = ?`,
        params: [value.toLocaleLowerCase()],
      };
    }
  }
  return {
    label: "All observed records",
    sql: "TRUE",
    params: [],
  };
}

async function groupedChart(input: {
  dataset: LocalWorkbenchDataset;
  expression: string;
  population: PopulationFilter;
  category?: ColumnProfile;
  time?: ColumnProfile;
  unit: InsightChartSpec["unit"];
  suppressSmall?: boolean;
}): Promise<InsightChartSpec | undefined> {
  const grouping = input.time ?? input.category;
  if (!grouping) return undefined;
  const groupExpression = input.time
    ? periodSql(grouping)
    : `TRIM(CAST(${quoteIdentifier(grouping.sourceName)} AS VARCHAR))`;
  const rows = await queryDuckDBPrepared(
    `SELECT
      ${groupExpression} AS label,
      ${input.expression} AS value,
      COUNT(*) AS sample_size
    FROM ${quoteIdentifier(input.dataset.metadata.localTableName)}
    WHERE ${input.population.sql}
      AND ${quoteIdentifier(grouping.sourceName)} IS NOT NULL
      AND TRIM(CAST(${quoteIdentifier(grouping.sourceName)} AS VARCHAR)) <> ''
    GROUP BY label
    ORDER BY ${input.time ? "label DESC" : "value DESC"}
    LIMIT 12`,
    input.population.params,
  );
  const data: ChartDatum[] = rows
    .filter((row) => !input.suppressSmall || asNumber(row.value) >= 5)
    .map((row) => ({
      label: String(row.label),
      value: round(asNumber(row.value)),
    }))
    .reverse();
  if (data.length === 0) return undefined;
  return {
    kind: "bar",
    title: input.time
      ? `${grouping.semanticMeaning ?? grouping.sourceName} trend`
      : `By ${grouping.semanticMeaning ?? grouping.sourceName}`,
    unit: input.unit,
    data,
  };
}

function completedPlan(
  context: AnalysisExecutionContext,
  blockedReason?: string,
) {
  return {
    ...context.plan,
    steps: context.plan.steps.map((step) => ({
      ...step,
      status:
        blockedReason || step.operation === "data_gap"
          ? ("blocked" as const)
          : ("complete" as const),
      blockedReason:
        blockedReason ??
        (step.operation === "data_gap"
          ? step.blockedReason ?? "The planned evidence gap remains unresolved."
          : undefined),
    })),
  };
}

function gapOutput(
  context: AnalysisExecutionContext,
  reason: string,
): DeterministicAnalysisOutput {
  const sourceDatasetIds = context.datasets.map(
    ({ metadata }) => metadata.id,
  );
  return {
    plan: completedPlan(context, reason),
    insights: [
      {
        id: `${context.question.id}-${context.capability.domain}-data-gap`,
        questionId: context.question.id,
        branchKey: "data-gap",
        headline: `${context.capability.metricName} is blocked by a data gap`,
        finding: reason,
        metricIds: [context.metric.id],
        filters: {},
        population: context.capability.population.label,
        evidence: [
          {
            id: `${context.question.id}-missing-evidence`,
            label: "Missing evidence",
            value: "Analysis blocked",
            detail: reason,
            sourceDatasetIds,
          },
        ],
        confidence: "Low",
        limitations: [
          ...context.capability.missing,
          "No substitute metric or demo result was used.",
        ],
        suggestedFollowUps: [],
        selectedForExecutiveStory: false,
        validated: false,
      },
    ],
  };
}

async function workforceMeasurement(
  dataset: LocalWorkbenchDataset,
  population: PopulationFilter,
  config: GenericExecutorConfig,
): Promise<Measurement> {
  const aggregate = field(dataset, ["employee_count"]);
  const expression = countSql(dataset, aggregate);
  const time = field(dataset, ["snapshot_month", "report_period"]);
  const category = field(dataset, config.categoryFields);
  const [row] = await queryDuckDBPrepared(
    `SELECT ${expression} AS value, COUNT(*) AS sample_size
     FROM ${quoteIdentifier(dataset.metadata.localTableName)}
     WHERE ${population.sql}`,
    population.params,
  );
  const value = asNumber(row?.value);
  const chart = await groupedChart({
    dataset,
    expression,
    population,
    time: time ?? undefined,
    category: time ? undefined : category,
    unit: "people",
  });
  const latest = time && chart?.data.at(-1);
  const measuredValue = latest?.value ?? value;
  return {
    label: "Observed headcount",
    value: measuredValue,
    unit: "people",
    formattedValue: formatValue(measuredValue, "people"),
    finding: latest
      ? `${latest.label} contains ${formatValue(measuredValue, "people")} observed employees.`
      : `${population.label} contains ${formatValue(measuredValue, "people")} observed employees.`,
    sampleSize: asNumber(row?.sample_size),
    period: latest?.label ?? dataset.metadata.tableContract?.dateWindows[0]?.label,
    evidence: [
      {
        label: aggregate ? "Reported employee count" : "Distinct observed employees",
        value: formatValue(measuredValue, "people"),
        detail: aggregate
          ? `Summed from ${aggregate.sourceName}.`
          : "Calculated from the locally inferred identity at the selected period.",
      },
    ],
    chart,
    limitations: config.limitations,
  };
}

async function retentionMeasurement(
  dataset: LocalWorkbenchDataset,
  population: PopulationFilter,
  config: GenericExecutorConfig,
): Promise<Measurement> {
  const outcome = field(dataset, ["attrition"]);
  const identity = field(dataset, ["employee_id"]);
  const eventDate = field(dataset, ["term_date", "report_period"]);
  const category = field(dataset, ["exit_classification", "termination_reason"]);
  const identityCount = identity
    ? `COUNT(DISTINCT ${quoteIdentifier(identity.sourceName)})`
    : "COUNT(*)";
  const exitCondition = outcome
    ? `${textSql(outcome.sourceName)} IN ('true', '1', 'yes', 'y', 'terminated', 'left', 'exit')`
    : "TRUE";
  const [row] = await queryDuckDBPrepared(
    `SELECT
      COUNT(*) AS sample_size,
      ${identityCount} AS population_count,
      ${identityCount} FILTER (WHERE ${exitCondition}) AS exit_count
    FROM ${quoteIdentifier(dataset.metadata.localTableName)}
    WHERE ${population.sql}`,
    population.params,
  );
  const exits = asNumber(row?.exit_count);
  const denominator = asNumber(row?.population_count);
  const canRate = Boolean(outcome) && denominator > 0;
  const value = canRate ? round((exits / denominator) * 100) : exits;
  const unit = canRate ? "percent" : "people";
  const expression = `${identityCount} FILTER (WHERE ${exitCondition})`;
  const chart = await groupedChart({
    dataset,
    expression,
    population,
    time: eventDate,
    category: eventDate ? undefined : category,
    unit: "people",
  });
  return {
    label: canRate ? "Observed attrition rate" : "Observed exit events",
    value,
    unit,
    formattedValue: formatValue(value, unit),
    finding: canRate
      ? `${exits.toLocaleString("en-US")} observed exits represent ${formatValue(value, unit)} of ${denominator.toLocaleString("en-US")} observed employees.`
      : `${exits.toLocaleString("en-US")} exit events are observed; a valid workforce denominator is not available, so no attrition rate is claimed.`,
    sampleSize: asNumber(row?.sample_size),
    period: dataset.metadata.tableContract?.dateWindows[0]?.label,
    evidence: [
      {
        label: "Observed exits",
        value: exits.toLocaleString("en-US"),
      },
      {
        label: "Rate denominator",
        value: canRate ? denominator.toLocaleString("en-US") : "Unavailable",
        detail: canRate
          ? `Distinct ${identity?.semanticMeaning ?? "employee"} records.`
          : "Attach or relate a compatible roster/snapshot to calculate a rate.",
      },
    ],
    chart,
    limitations: [
      ...config.limitations,
      ...(canRate
        ? []
        : ["Event counts are not a substitute for an attrition rate."]),
    ],
  };
}

async function recruitingMeasurement(
  dataset: LocalWorkbenchDataset,
  population: PopulationFilter,
  config: GenericExecutorConfig,
): Promise<Measurement> {
  const applications = field(dataset, ["applications_count"]);
  const advertisements = field(dataset, ["advertisements_count"]);
  const duration = field(dataset, ["staffing_days"]);
  const applicationId = field(dataset, ["application_id"]);
  const requisitionId = field(dataset, ["requisition_id"]);
  const reportedCount = field(dataset, ["record_count"]);
  const primary = applications ?? advertisements ?? reportedCount;
  const expression = primary
    ? `COALESCE(SUM(${numericSql(primary.sourceName)}), 0)`
    : countSql(dataset);
  const durationSelect = duration
    ? `, AVG(${numericSql(duration.sourceName)}) AS duration`
    : "";
  const [row] = await queryDuckDBPrepared(
    `SELECT ${expression} AS value, COUNT(*) AS sample_size ${durationSelect}
     FROM ${quoteIdentifier(dataset.metadata.localTableName)}
     WHERE ${population.sql}`,
    population.params,
  );
  const value = asNumber(row?.value);
  const time = field(dataset, ["report_period", "application_date", "requisition_open_date"]);
  const chart = await groupedChart({
    dataset,
    expression,
    population,
    time,
    category: time ? undefined : field(dataset, config.categoryFields),
    unit: "people",
  });
  const label =
    primary?.canonicalField === "applications_count" || applicationId
      ? "Observed applications"
      : primary?.canonicalField === "advertisements_count" || requisitionId
        ? "Observed requisitions / advertisements"
        : primary?.canonicalField === "record_count"
          ? "Observed reported recruiting activities"
        : "Observed recruiting records";
  return {
    label,
    value,
    unit: "people",
    formattedValue: formatValue(value, "people"),
    finding: `${formatValue(value, "people")} ${label.toLocaleLowerCase()} are present in the selected data.${
      duration && row?.duration !== null
        ? ` Mean observed staffing duration is ${formatValue(round(asNumber(row?.duration)), "days")}.`
        : ""
    }`,
    sampleSize: asNumber(row?.sample_size),
    period: dataset.metadata.tableContract?.dateWindows[0]?.label,
    evidence: [
      { label, value: formatValue(value, "people") },
      ...(duration
        ? [
            {
              label: "Mean staffing duration",
              value: formatValue(round(asNumber(row?.duration)), "days"),
            },
          ]
        : []),
    ],
    chart,
    limitations: config.limitations,
  };
}

async function numericMeasurement(
  dataset: LocalWorkbenchDataset,
  population: PopulationFilter,
  config: GenericExecutorConfig,
  fields: string[],
  unit: InsightChartSpec["unit"],
): Promise<Measurement> {
  const measure = field(dataset, fields);
  if (!measure) {
    throw new Error(`No numeric ${config.metricName.toLocaleLowerCase()} field was inferred.`);
  }
  const numeric = numericSql(measure.sourceName);
  const [row] = await queryDuckDBPrepared(
    `SELECT
      AVG(${numeric}) AS value,
      MEDIAN(${numeric}) AS median_value,
      COUNT(${numeric}) AS sample_size
    FROM ${quoteIdentifier(dataset.metadata.localTableName)}
    WHERE ${population.sql}`,
    population.params,
  );
  const value = round(asNumber(row?.value));
  const sampleSize = asNumber(row?.sample_size);
  if (sampleSize === 0) {
    throw new Error(`${measure.sourceName} does not contain numeric values.`);
  }
  const time = field(dataset, config.timeFields);
  const category = field(dataset, config.categoryFields);
  const chart = await groupedChart({
    dataset,
    expression: `AVG(${numeric})`,
    population,
    time,
    category: time ? undefined : category,
    unit,
  });
  return {
    label: `Mean ${measure.semanticMeaning ?? measure.sourceName}`,
    value,
    unit,
    formattedValue: formatValue(value, unit),
    finding: `The observed mean is ${formatValue(value, unit)} across ${sampleSize.toLocaleString("en-US")} numeric records; the median is ${formatValue(round(asNumber(row?.median_value)), unit)}.`,
    sampleSize,
    period: dataset.metadata.tableContract?.dateWindows[0]?.label,
    evidence: [
      {
        label: "Observed mean",
        value: formatValue(value, unit),
        detail: measure.sourceName,
      },
      {
        label: "Observed median",
        value: formatValue(round(asNumber(row?.median_value)), unit),
      },
      {
        label: "Numeric records",
        value: sampleSize.toLocaleString("en-US"),
      },
    ],
    chart,
    limitations: config.limitations,
  };
}

async function categoricalMeasurement(
  dataset: LocalWorkbenchDataset,
  population: PopulationFilter,
  config: GenericExecutorConfig,
  categoryFields: string[],
  completedPattern?: string,
): Promise<Measurement> {
  const category = field(dataset, categoryFields);
  if (!category) {
    throw new Error(`No ${config.metricName.toLocaleLowerCase()} category was inferred.`);
  }
  const aggregate = field(dataset, [
    "employee_count",
    "movement_count",
    "record_count",
  ]);
  const expression = countSql(dataset, aggregate);
  const rows = await queryDuckDBPrepared(
    `SELECT
      TRIM(CAST(${quoteIdentifier(category.sourceName)} AS VARCHAR)) AS label,
      ${expression} AS value
    FROM ${quoteIdentifier(dataset.metadata.localTableName)}
    WHERE ${population.sql}
      AND ${quoteIdentifier(category.sourceName)} IS NOT NULL
    GROUP BY label
    ORDER BY value DESC
    LIMIT 20`,
    population.params,
  );
  const allData = rows.map((row) => ({
    label: String(row.label),
    value: asNumber(row.value),
  }));
  const total = allData.reduce((sum, item) => sum + item.value, 0);
  const matched = completedPattern
    ? allData
        .filter((item) => new RegExp(completedPattern, "i").test(item.label))
        .reduce((sum, item) => sum + item.value, 0)
    : allData[0]?.value ?? 0;
  const isRate = Boolean(completedPattern);
  const value = isRate && total ? round((matched / total) * 100) : total;
  return {
    label: isRate ? config.metricName : `Observed ${config.metricName}`,
    value,
    unit: isRate ? "percent" : "people",
    formattedValue: formatValue(value, isRate ? "percent" : "people"),
    finding: isRate
      ? `${matched.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} observed records match the approved completion/pass statuses.`
      : `${total.toLocaleString("en-US")} observed records are distributed across ${allData.length} reported categories.`,
    sampleSize: total,
    period: dataset.metadata.tableContract?.dateWindows[0]?.label,
    evidence: [
      {
        label: isRate ? "Observed rate" : "Observed records",
        value: formatValue(value, isRate ? "percent" : "people"),
      },
      {
        label: "Reported categories",
        value: allData.length.toLocaleString("en-US"),
      },
    ],
    chart: {
      kind: "bar",
      title: `By ${category.semanticMeaning ?? category.sourceName}`,
      unit: "people",
      data: allData.slice(0, 12),
    },
    limitations: config.limitations,
  };
}

async function engagementMeasurement(
  dataset: LocalWorkbenchDataset,
  population: PopulationFilter,
  config: GenericExecutorConfig,
): Promise<Measurement> {
  const explicit = field(dataset, ["engagement_score"]);
  if (explicit) {
    return numericMeasurement(
      dataset,
      population,
      config,
      ["engagement_score"],
      "ratio",
    );
  }
  const items = dataset.metadata.columns.filter((column) =>
    /^q_?\d+$/i.test(column.sourceName),
  );
  if (items.length === 0) {
    throw new Error("No engagement score or survey-item columns were inferred.");
  }
  const list = items.map((column) => numericSql(column.sourceName)).join(", ");
  const [row] = await queryDuckDBPrepared(
    `SELECT
      AVG(score) AS value,
      COUNT(score) AS sample_size,
      COUNT(*) FILTER (WHERE score >= 4) AS favorable
    FROM (
      SELECT UNNEST([${list}]) AS score
      FROM ${quoteIdentifier(dataset.metadata.localTableName)}
      WHERE ${population.sql}
    ) survey_scores`,
    population.params,
  );
  const value = round(asNumber(row?.value), 2);
  const sampleSize = asNumber(row?.sample_size);
  const favorable = sampleSize
    ? round((asNumber(row?.favorable) / sampleSize) * 100)
    : 0;
  return {
    label: "Mean engagement item score",
    value,
    unit: "ratio",
    formattedValue: formatValue(value, "ratio"),
    finding: `${items.length} survey items yield a mean observed score of ${value.toLocaleString("en-US")} and ${favorable}% favorable responses at a 4-or-higher threshold.`,
    sampleSize,
    period: dataset.metadata.tableContract?.dateWindows[0]?.label,
    evidence: [
      { label: "Mean item score", value: value.toLocaleString("en-US") },
      { label: "Favorable responses", value: `${favorable}%` },
      { label: "Non-null item responses", value: sampleSize.toLocaleString("en-US") },
    ],
    limitations: [
      ...config.limitations,
      ...(field(dataset, ["survey_wave"])
        ? []
        : ["No survey wave is present, so a trend is not claimed."]),
    ],
  };
}

async function mobilityMeasurement(
  dataset: LocalWorkbenchDataset,
  population: PopulationFilter,
  config: GenericExecutorConfig,
): Promise<Measurement> {
  const count = field(dataset, ["movement_count", "record_count"]);
  const expression = countSql(dataset, count);
  const [row] = await queryDuckDBPrepared(
    `SELECT ${expression} AS value, COUNT(*) AS sample_size
     FROM ${quoteIdentifier(dataset.metadata.localTableName)}
     WHERE ${population.sql}`,
    population.params,
  );
  const value = asNumber(row?.value);
  const time = field(dataset, ["job_change_date", "report_period"]);
  const chart = await groupedChart({
    dataset,
    expression,
    population,
    time,
    category: time ? undefined : field(dataset, ["move_type"]),
    unit: "people",
  });
  return {
    label: "Observed internal movements",
    value,
    unit: "people",
    formattedValue: formatValue(value, "people"),
    finding: `${formatValue(value, "people")} internal movement or promotion events are observed.`,
    sampleSize: asNumber(row?.sample_size),
    period: dataset.metadata.tableContract?.dateWindows[0]?.label,
    evidence: [
      { label: "Observed movements", value: formatValue(value, "people") },
    ],
    chart,
    limitations: [
      ...config.limitations,
      "A movement rate is not claimed without an approved workforce denominator.",
    ],
  };
}

async function diversityMeasurement(
  dataset: LocalWorkbenchDataset,
  population: PopulationFilter,
  config: GenericExecutorConfig,
): Promise<Measurement> {
  const category = field(dataset, [
    "demographic_category",
    "gender",
    "ethnicity",
  ]);
  if (!category) {
    throw new Error("No reviewed demographic category was inferred.");
  }
  const count = field(dataset, ["employee_count", "record_count"]);
  const expression = countSql(dataset, count);
  const rows = await queryDuckDBPrepared(
    `SELECT
      TRIM(CAST(${quoteIdentifier(category.sourceName)} AS VARCHAR)) AS label,
      ${expression} AS value
    FROM ${quoteIdentifier(dataset.metadata.localTableName)}
    WHERE ${population.sql}
      AND ${quoteIdentifier(category.sourceName)} IS NOT NULL
    GROUP BY label
    ORDER BY value DESC`,
    population.params,
  );
  const total = rows.reduce((sum, row) => sum + asNumber(row.value), 0);
  const visible = rows
    .map((row) => ({
      label: String(row.label),
      count: asNumber(row.value),
    }))
    .filter((row) => row.count >= 5);
  const top = visible[0];
  const value = top && total ? round((top.count / total) * 100) : 0;
  return {
    label: "Largest reported representation share",
    value,
    unit: "percent",
    formattedValue: formatValue(value, "percent"),
    finding: top
      ? `${top.label} is the largest reportable category at ${formatValue(value, "percent")} of the observed population.`
      : "Every observed demographic category is below the minimum reportable sample size.",
    sampleSize: total,
    period: dataset.metadata.tableContract?.dateWindows[0]?.label,
    evidence: [
      {
        label: "Observed population",
        value: total.toLocaleString("en-US"),
      },
      {
        label: "Suppression threshold",
        value: "Fewer than 5",
      },
    ],
    chart:
      visible.length > 0
        ? {
            kind: "bar",
            title: `Representation by ${category.semanticMeaning ?? category.sourceName}`,
            unit: "percent",
            data: visible.slice(0, 12).map((row) => ({
              label: row.label,
              value: total ? round((row.count / total) * 100) : 0,
            })),
          }
        : undefined,
    limitations: [
      ...config.limitations,
      "Categories with fewer than five observed people are suppressed.",
      "This descriptive view must not be used to infer individual identity or suitability.",
    ],
  };
}

async function measure(
  context: AnalysisExecutionContext,
  dataset: LocalWorkbenchDataset,
  population: PopulationFilter,
  config: GenericExecutorConfig,
) {
  switch (config.mode) {
    case "workforce":
      return workforceMeasurement(dataset, population, config);
    case "retention":
      return retentionMeasurement(dataset, population, config);
    case "recruiting":
      return recruitingMeasurement(dataset, population, config);
    case "compensation":
      return numericMeasurement(
        dataset,
        population,
        config,
        [
          "pay_gap_median_pct",
          "pay_gap_mean_pct",
          "compa_ratio",
          "annual_base_salary",
          "compensation_amount",
        ],
        field(dataset, ["pay_gap_median_pct", "pay_gap_mean_pct"])
          ? "percent"
          : "ratio",
      );
    case "performance": {
      const rating = field(dataset, ["performance_rating"]);
      return rating &&
        (await hasNumericValues(dataset, population, rating))
        ? numericMeasurement(
            dataset,
            population,
            config,
            ["performance_rating"],
            "ratio",
          )
        : categoricalMeasurement(
            dataset,
            population,
            config,
            [
              "overall_performance",
              "performance_rating",
              "appraisal_status",
              "talent_review_status",
              "placement_code",
            ],
          );
    }
    case "absence": {
      const rate = field(dataset, ["absence_rate"]);
      return rate
        ? numericMeasurement(
            dataset,
            population,
            config,
            ["absence_rate"],
            "percent",
          )
        : numericMeasurement(
            dataset,
            population,
            config,
            ["absence_hours"],
            "ratio",
          );
    }
    case "engagement":
      return engagementMeasurement(dataset, population, config);
    case "learning": {
      const status = field(dataset, ["learning_status", "pass_flag"]);
      return status
        ? categoricalMeasurement(
            dataset,
            population,
            config,
            ["learning_status", "pass_flag"],
            "complete|completed|pass|passed|true|yes|1",
          )
        : numericMeasurement(
            dataset,
            population,
            config,
            ["learning_score"],
            "ratio",
          );
    }
    case "mobility":
      return mobilityMeasurement(dataset, population, config);
    case "diversity":
      return diversityMeasurement(dataset, population, config);
  }
}

async function executeApprovedMetricExpression(
  context: AnalysisExecutionContext,
  dataset: LocalWorkbenchDataset,
  population: PopulationFilter,
): Promise<number | undefined> {
  if (population.params.length > 0) return undefined;
  const fieldBindings = Object.fromEntries(
    dataset.metadata.columns.flatMap((column) =>
      column.canonicalField
        ? [[column.canonicalField, column.sourceName]]
        : [],
    ),
  );
  const exitClassification = field(dataset, ["exit_classification"]);
  if (exitClassification) {
    fieldBindings.termination_type = exitClassification.sourceName;
  }
  try {
    const compiled = compileMetricQuery(context.metric, {
      tableName: dataset.metadata.localTableName,
      alias: "__approved_metric",
      fieldBindings,
    });
    const [row] = await queryDuckDBPrepared(
      compiled.sql,
      compiled.parameters,
    );
    const value = Number(row?.__approved_metric);
    return Number.isFinite(value) ? round(value, 2) : undefined;
  } catch {
    return undefined;
  }
}

export async function executeGenericDomain(
  context: AnalysisExecutionContext,
  config: GenericExecutorConfig,
): Promise<DeterministicAnalysisOutput> {
  if (!context.capability.runnable) {
    return gapOutput(
      context,
      context.capability.missing.join(" ") ||
        `The attached data cannot run ${context.capability.metricName}.`,
    );
  }
  const compatibleIds = new Set(context.capability.datasetIds);
  const dataset = selectDataset(
    context.datasets.filter(({ metadata }) =>
      compatibleIds.has(metadata.id),
    ),
    config,
  );
  if (!dataset) {
    return gapOutput(
      context,
      "No capability-approved compatible local dataset is attached.",
    );
  }
  try {
    const population = await resolvePopulation(
      dataset,
      context.question.text,
      config.mode === "diversity",
    );
    const result = await measure(context, dataset, population, config);
    const compiledMetricValue = await executeApprovedMetricExpression(
      context,
      dataset,
      population,
    );
    const sourceDatasetIds = [dataset.metadata.id];
    const enoughEvidence = result.sampleSize >= config.minSampleSize;
    const insight: Insight = {
      id: `${context.question.id}-${config.mode}-summary`,
      questionId: context.question.id,
      branchKey: result.chart ? "distribution" : "summary",
      headline: `${result.label}: ${result.formattedValue}`,
      finding: result.finding,
      metricIds: [context.metric.id],
      filters:
        population.params.length > 0
          ? { population: population.label }
          : {},
      period: result.period,
      population: population.label,
      evidence: [
        ...result.evidence,
        ...(compiledMetricValue === undefined
          ? []
          : [
              {
                label: "Approved metric expression",
                value: compiledMetricValue.toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                }),
                detail: `Metric ${context.metric.key} v${context.metric.version} executed through the bound expression compiler.`,
              },
            ]),
      ].map((item, index) => ({
        id: `${context.question.id}-${config.mode}-evidence-${index + 1}`,
        ...item,
        sourceDatasetIds,
      })),
      chartSpec: result.chart,
      confidence: enoughEvidence
        ? context.capability.confidence
        : "Low",
      limitations: [
        ...result.limitations,
        ...(!enoughEvidence
          ? [
              `Only ${result.sampleSize.toLocaleString("en-US")} observations are available; the minimum for this path is ${config.minSampleSize}.`,
            ]
          : []),
      ],
      suggestedFollowUps: [],
      selectedForExecutiveStory: false,
      validated: enoughEvidence,
    };
    return {
      plan: completedPlan(context),
      insights: [insight],
    };
  } catch (error) {
    return gapOutput(
      context,
      error instanceof Error
        ? error.message
        : "The compatible dataset does not contain calculable evidence.",
    );
  }
}
