import { queryDuckDBPrepared } from "@/lib/local-data/duckdb-client";
import { quoteIdentifier } from "@/lib/local-data/sql";
import type {
  AnalysisPlan,
  DataThreadTurn,
  Insight,
  LocalWorkbenchDataset,
  ResolvedQueryIntent,
} from "@/types/workbench";
import { peopleNextBestFollowUps } from "./people-intelligence";

interface DirectQueryOutput {
  plan: AnalysisPlan;
  insights: Insight[];
  methodNote: string;
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function numericSql(sourceName: string) {
  const column = quoteIdentifier(sourceName);
  return `TRY_CAST(REPLACE(REPLACE(TRIM(CAST(${column} AS VARCHAR)), ',', ''), '%', '') AS DOUBLE)`;
}

function aggregateSql(intent: ResolvedQueryIntent) {
  if (!intent.measureField || intent.aggregation === "count") return "COUNT(*)";
  const field = quoteIdentifier(intent.measureField);
  if (intent.aggregation === "sum") {
    return `COALESCE(SUM(${numericSql(intent.measureField)}), 0)`;
  }
  return `COUNT(DISTINCT ${field})`;
}

async function latestPeriod(
  dataset: LocalWorkbenchDataset,
  sourceName: string | undefined,
  intent: ResolvedQueryIntent,
) {
  if (!sourceName) return undefined;
  const field = quoteIdentifier(sourceName);
  const [row] = await queryDuckDBPrepared(
    `SELECT TRIM(CAST(${field} AS VARCHAR)) AS value
    FROM ${quoteIdentifier(dataset.metadata.localTableName)}
    WHERE ${field} IS NOT NULL
      AND TRIM(CAST(${field} AS VARCHAR)) <> ''
      ${
        intent.measureField
          ? intent.aggregation === "sum"
            ? `AND ${numericSql(intent.measureField)} IS NOT NULL`
            : `AND ${quoteIdentifier(intent.measureField)} IS NOT NULL`
          : ""
      }
    ORDER BY
      TRY_CAST(${field} AS TIMESTAMP) DESC NULLS LAST,
      TRY_CAST(${field} AS DOUBLE) DESC NULLS LAST,
      value DESC
    LIMIT 1`,
  );
  return row?.value === null || row?.value === undefined
    ? undefined
    : String(row.value);
}

function whereClause(intent: ResolvedQueryIntent, period: string | undefined) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (intent.timeField && period) {
    clauses.push(
      `TRIM(CAST(${quoteIdentifier(intent.timeField)} AS VARCHAR)) = ?`,
    );
    params.push(period);
  }
  for (const filter of intent.dimensionFilters ?? []) {
    if (filter.values.length === 0) continue;
    clauses.push(
      `LOWER(TRIM(CAST(${quoteIdentifier(
        filter.field,
      )} AS VARCHAR))) IN (${filter.values.map(() => "?").join(", ")})`,
    );
    params.push(...filter.values.map((value) => value.toLocaleLowerCase()));
  }
  return {
    sql: clauses.length > 0 ? clauses.join(" AND ") : "TRUE",
    params,
  };
}

function displayName(dataset: LocalWorkbenchDataset, sourceName: string) {
  const column = dataset.metadata.columns.find(
    (candidate) => candidate.sourceName === sourceName,
  );
  return column?.semanticMeaning ?? sourceName;
}

function insightId(turnId: string, suffix: string) {
  return `${turnId}-${suffix
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")}`;
}

async function totalCount(
  dataset: LocalWorkbenchDataset,
  intent: ResolvedQueryIntent,
  filter: { sql: string; params: unknown[] },
) {
  const [row] = await queryDuckDBPrepared(
    `SELECT ${aggregateSql(intent)} AS value, COUNT(*) AS source_rows
    FROM ${quoteIdentifier(dataset.metadata.localTableName)}
    WHERE ${filter.sql}`,
    filter.params,
  );
  return {
    value: asNumber(row?.value),
    sourceRows: asNumber(row?.source_rows),
  };
}

async function dimensionInsight(input: {
  dataset: LocalWorkbenchDataset;
  intent: ResolvedQueryIntent;
  turn: DataThreadTurn;
  metricId: string;
  dimension: string;
  filter: { sql: string; params: unknown[] };
  total: number;
  period?: string;
}): Promise<Insight> {
  const dimension = quoteIdentifier(input.dimension);
  const rows = await queryDuckDBPrepared(
    `SELECT
      TRIM(CAST(${dimension} AS VARCHAR)) AS label,
      ${aggregateSql(input.intent)} AS value
    FROM ${quoteIdentifier(input.dataset.metadata.localTableName)}
    WHERE ${input.filter.sql}
      AND ${dimension} IS NOT NULL
      AND TRIM(CAST(${dimension} AS VARCHAR)) <> ''
    GROUP BY label
    ORDER BY value DESC
    LIMIT ${Math.max(1, input.intent.limit ?? 20)}`,
    input.filter.params,
  );
  const data = rows
    .map((row) => ({ label: String(row.label), value: asNumber(row.value) }))
    .filter((row) => row.value > 0);
  const top = data[0];
  const next = data.slice(1, 3).map((row) => row.label);
  const share = top && input.total ? (top.value / input.total) * 100 : 0;
  const dimensionLabel = displayName(input.dataset, input.dimension);
  const selectedValues = (input.intent.dimensionFilters ?? []).find(
    (filter) => filter.field === input.dimension,
  )?.values;
  const sourceColumn = input.dataset.metadata.columns.find(
    (column) => column.sourceName === input.intent.measureField,
  );
  return {
    id: insightId(input.turn.id, input.dimension),
    questionId: input.turn.id,
    branchKey: input.dimension,
    headline:
      selectedValues?.length === 1
        ? `${selectedValues[0]} headcount: ${formatNumber(input.total)}`
        : `Headcount by ${dimensionLabel}`,
    finding:
      selectedValues?.length === 1
        ? `${formatNumber(input.total)} observed employees match ${dimensionLabel} = ${selectedValues[0]}${input.period ? ` in ${input.period}` : ""}.`
        : top
          ? `${input.period ? `At ${input.period}, ` : ""}${top.label} is the largest observed group at ${formatNumber(top.value)} (${share.toFixed(1)}% of the selected total).${
              next.length
                ? ` ${next.join(" and ")} are the next largest groups.`
                : ""
            }`
          : `No populated ${dimensionLabel} groups are available for this question.`,
    metricIds: [input.metricId],
    filters: input.period ? { period: input.period } : {},
    period: input.period,
    population: "All observed records in the selected data",
    evidence: [
      {
        id: `${input.turn.id}-${input.dimension}-total`,
        label: "Selected headcount",
        value: formatNumber(input.total),
        detail: input.intent.assumptions[0],
        sourceDatasetIds: [input.dataset.metadata.id],
      },
      {
        id: `${input.turn.id}-${input.dimension}-groups`,
        label: "Reported groups",
        value: data.length.toLocaleString("en-US"),
        detail: `Grouped locally by ${input.dimension}.`,
        sourceDatasetIds: [input.dataset.metadata.id],
      },
    ],
    chartSpec:
      data.length > 0
        ? {
            kind: "bar",
            title: `Headcount by ${dimensionLabel}`,
            xLabel: dimensionLabel,
            yLabel: "Headcount",
            unit: "people",
            data: data.slice(0, Math.min(12, input.intent.limit ?? 12)),
          }
        : undefined,
    confidence: input.intent.confidence,
    limitations: [
      ...(sourceColumn?.likelyPII
        ? [
            `${sourceColumn.sourceName} is a direct identifier used only for a local distinct count; its values are not displayed or sent to AI.`,
          ]
        : []),
      ...(data.length === (input.intent.limit ?? 20)
        ? [`Only the ${input.intent.limit ?? 20} largest populated groups are shown.`]
        : []),
    ],
    suggestedFollowUps: [
      {
        key: `trend:${input.dimension}`,
        label: `Show ${dimensionLabel} trend`,
        available: Boolean(input.intent.timeField),
        unavailableReason: input.intent.timeField
          ? undefined
          : "No observed time field is available.",
      },
      ...peopleNextBestFollowUps({
        dataset: input.dataset,
        intent: input.intent,
        currentDimensions: [input.dimension],
      }),
    ],
    selectedForExecutiveStory: false,
    validated: Boolean(selectedValues?.length) || data.length > 0,
  };
}

async function trendInsight(input: {
  dataset: LocalWorkbenchDataset;
  intent: ResolvedQueryIntent;
  turn: DataThreadTurn;
  metricId: string;
  dimension?: string;
}): Promise<Insight> {
  const timeField = input.intent.timeField!;
  const time = quoteIdentifier(timeField);
  const dimension = input.dimension
    ? quoteIdentifier(input.dimension)
    : undefined;
  let seriesValues =
    input.intent.seriesValues.length > 0
      ? input.intent.seriesValues
      : (input.intent.dimensionFilters ?? []).find(
          (filter) => filter.field === input.dimension,
        )?.values ?? [];
  if (dimension && seriesValues.length === 0) {
    const topSeries = await queryDuckDBPrepared(
      `SELECT TRIM(CAST(${dimension} AS VARCHAR)) AS value,
        ${aggregateSql(input.intent)} AS total
      FROM ${quoteIdentifier(input.dataset.metadata.localTableName)}
      WHERE ${dimension} IS NOT NULL
        AND TRIM(CAST(${dimension} AS VARCHAR)) <> ''
      GROUP BY value
      ORDER BY total DESC
      LIMIT 5`,
    );
    seriesValues = topSeries.map((row) => String(row.value));
  }
  const seriesFilter =
    dimension && seriesValues.length
      ? `AND LOWER(TRIM(CAST(${dimension} AS VARCHAR))) IN (${seriesValues
          .map(() => "?")
          .join(", ")})`
      : "";
  const rows = await queryDuckDBPrepared(
    `SELECT
      TRIM(CAST(${time} AS VARCHAR)) AS label,
      ${dimension ? `TRIM(CAST(${dimension} AS VARCHAR))` : "'Headcount'"} AS series,
      ${aggregateSql(input.intent)} AS value
    FROM ${quoteIdentifier(input.dataset.metadata.localTableName)}
    WHERE ${time} IS NOT NULL
      AND TRIM(CAST(${time} AS VARCHAR)) <> ''
      ${seriesFilter}
    GROUP BY label, series
    ORDER BY
      TRY_CAST(label AS TIMESTAMP) ASC NULLS FIRST,
      TRY_CAST(label AS DOUBLE) ASC NULLS FIRST,
      label ASC,
      value DESC`,
    seriesValues.map((value) => value.toLocaleLowerCase()),
  );
  const data = rows
    .map((row) => ({
      label: String(row.label),
      value: asNumber(row.value),
      group: String(row.series),
    }))
    .filter((row) => row.value > 0);
  const latestLabel = data.at(-1)?.label;
  const latestRows = data
    .filter((row) => row.label === latestLabel)
    .sort((left, right) => right.value - left.value);
  const top = latestRows[0];
  const changes = [...new Set(data.map((row) => row.group))]
    .map((group) => {
      const series = data.filter((row) => row.group === group);
      const first = series[0];
      const last = series.at(-1);
      return {
        group,
        first: first?.value ?? 0,
        last: last?.value ?? 0,
        change: (last?.value ?? 0) - (first?.value ?? 0),
      };
    })
    .sort((left, right) => Math.abs(right.change) - Math.abs(left.change));
  const largestChange = changes[0];
  const dimensionLabel = input.dimension
    ? displayName(input.dataset, input.dimension)
    : "workforce";
  return {
    id: insightId(input.turn.id, `trend-${input.dimension ?? "total"}`),
    questionId: input.turn.id,
    branchKey: `trend:${input.dimension ?? "total"}`,
    headline:
      input.intent.difficulty === "diagnostic"
        ? `What changed in headcount${input.dimension ? ` by ${dimensionLabel}` : ""}`
        : `Headcount trend${input.dimension ? ` by ${dimensionLabel}` : ""}`,
    finding:
      input.intent.difficulty === "diagnostic" && largestChange
        ? `${largestChange.group} changed by ${formatNumber(largestChange.change)} people from the first to the latest observed period (${formatNumber(largestChange.first)} → ${formatNumber(largestChange.last)}). This establishes the observed movement; the attached fields do not by themselves prove a causal reason.`
        : top && latestLabel
        ? `${top.group} is the largest shown series in ${latestLabel} at ${formatNumber(top.value)} people. The chart preserves the observed period sequence for comparison.`
        : "No populated time series matched this follow-up.",
    metricIds: [input.metricId],
    filters: seriesValues.length ? { groups: seriesValues } : {},
    period: latestLabel,
    population: "All observed records in the selected series and periods",
    evidence: [
      {
        id: `${input.turn.id}-trend-periods`,
        label: "Observed periods",
        value: new Set(data.map((row) => row.label)).size.toLocaleString("en-US"),
        detail: `Grouped locally by ${timeField}.`,
        sourceDatasetIds: [input.dataset.metadata.id],
      },
      {
        id: `${input.turn.id}-trend-series`,
        label: "Compared series",
        value: new Set(data.map((row) => row.group)).size.toLocaleString("en-US"),
        detail: input.dimension
          ? `Compared by ${input.dimension}.`
          : "Total headcount series.",
        sourceDatasetIds: [input.dataset.metadata.id],
      },
    ],
    chartSpec:
      data.length > 0
        ? {
            kind: "line",
            title: `Headcount trend${input.dimension ? ` by ${dimensionLabel}` : ""}`,
            xLabel: displayName(input.dataset, timeField),
            yLabel: "Headcount",
            unit: "people",
            data,
          }
        : undefined,
    confidence: input.intent.confidence,
    limitations: [
      ...(input.dimension && input.intent.seriesValues.length === 0
        ? ["The five largest observed series are shown to keep the chart readable."]
        : []),
      ...(input.intent.difficulty === "diagnostic"
        ? [
            "Observed segment movement is descriptive evidence, not a causal explanation.",
          ]
        : []),
    ],
    suggestedFollowUps: [
      {
        key: "diagnose-change",
        label: `Why did ${top?.group ?? "this group"} change?`,
        available: data.length > 1,
      },
      ...peopleNextBestFollowUps({
        dataset: input.dataset,
        intent: input.intent,
        currentDimensions: input.dimension ? [input.dimension] : [],
      }),
    ],
    selectedForExecutiveStory: false,
    validated: data.length > 0,
  };
}

function summaryInsight(input: {
  dataset: LocalWorkbenchDataset;
  intent: ResolvedQueryIntent;
  turn: DataThreadTurn;
  metricId: string;
  value: number;
  sourceRows: number;
  period?: string;
}): Insight {
  const measure = input.intent.measureField ?? "rows";
  const sourceColumn = input.dataset.metadata.columns.find(
    (column) => column.sourceName === input.intent.measureField,
  );
  return {
    id: insightId(input.turn.id, "summary"),
    questionId: input.turn.id,
    branchKey: "summary",
    headline: `Observed headcount: ${formatNumber(input.value)}`,
    finding: `${formatNumber(input.value)} employees are observed${
      input.period ? ` in the latest available period, ${input.period}` : ""
    }.`,
    metricIds: [input.metricId],
    filters: input.period ? { period: input.period } : {},
    period: input.period,
    population: "All observed records in the selected data",
    evidence: [
      {
        id: `${input.turn.id}-headcount`,
        label: "Observed headcount",
        value: formatNumber(input.value),
        detail: input.intent.assumptions[0],
        sourceDatasetIds: [input.dataset.metadata.id],
      },
      {
        id: `${input.turn.id}-rows`,
        label: "Source rows",
        value: input.sourceRows.toLocaleString("en-US"),
        detail: `Calculated locally from ${measure}.`,
        sourceDatasetIds: [input.dataset.metadata.id],
      },
      ...(sourceColumn &&
      input.intent.aggregation === "count_distinct" &&
      sourceColumn.distinctCount < sourceColumn.rowCount - sourceColumn.nullCount
        ? [
            {
              id: `${input.turn.id}-populated-values`,
              label: "Populated values",
              value: (
                sourceColumn.rowCount - sourceColumn.nullCount
              ).toLocaleString("en-US"),
              detail: `${sourceColumn.distinctCount.toLocaleString("en-US")} values are unique; duplicate keys are counted once.`,
              sourceDatasetIds: [input.dataset.metadata.id],
            },
          ]
        : []),
    ],
    confidence: input.intent.confidence,
    limitations: sourceColumn?.likelyPII
      ? [
          `${sourceColumn.sourceName} is used only for a local distinct count; identifier values are never displayed or sent to AI.`,
        ]
      : [],
    suggestedFollowUps: [],
    selectedForExecutiveStory: false,
    validated: true,
  };
}

function profileSummaryInsight(input: {
  dataset: LocalWorkbenchDataset;
  intent: ResolvedQueryIntent;
  turn: DataThreadTurn;
  metricId: string;
  insights: Insight[];
  total: number;
}): Insight {
  const measureColumn = input.dataset.metadata.columns.find(
    (column) => column.sourceName === input.intent.measureField,
  );
  const sourceLetter =
    measureColumn?.sourceIndex === undefined
      ? undefined
      : String.fromCharCode(65 + measureColumn.sourceIndex);
  const modes = input.insights.flatMap((insight) => {
    const top = insight.chartSpec?.data[0];
    if (!top) return [];
    const dimension = insight.chartSpec?.xLabel ?? insight.branchKey;
    return [`${dimension}: ${top.label}`];
  });
  return {
    id: insightId(input.turn.id, "typical-profile"),
    questionId: input.turn.id,
    branchKey: "typical-profile",
    headline: "Typical observed employee profile",
    finding: modes.length
      ? `Among ${formatNumber(
          input.total,
        )} observed employees, the most common attributes are ${modes.join(
          "; ",
        )}. This is a modal workforce profile, not a description of every employee.`
      : "The attached data does not contain enough non-sensitive categorical evidence for a typical profile.",
    metricIds: [input.metricId],
    filters: {},
    population: "All observed employees in the selected period",
    evidence: [
      ...(measureColumn && input.intent.aggregation === "count_distinct"
        ? [
            {
              id: `${input.turn.id}-profile-count-key`,
              label: `${sourceLetter ? `Column ${sourceLetter} · ` : ""}distinct employees`,
              value: formatNumber(input.total),
              detail: `${formatNumber(
                measureColumn.rowCount - measureColumn.nullCount,
              )} populated values; duplicates are counted once.`,
              sourceDatasetIds: [input.dataset.metadata.id],
            },
          ]
        : []),
      ...input.insights.flatMap((insight) =>
        insight.chartSpec?.data[0]
          ? [
              {
                id: `${input.turn.id}-profile-${insight.branchKey}`,
                label: insight.chartSpec.xLabel ?? insight.branchKey,
                value: insight.chartSpec.data[0].label,
                detail: `Largest observed group: ${formatNumber(
                  insight.chartSpec.data[0].value,
                )} people.`,
                sourceDatasetIds: [input.dataset.metadata.id],
              },
            ]
          : [],
      ),
    ],
    confidence: input.intent.confidence,
    limitations: [
        "Direct identifiers stay local and are never displayed. Demographic cuts are shown only as aggregates.",
      "A modal profile summarizes common categories and should not be interpreted as one representative individual.",
    ],
    suggestedFollowUps: [],
    selectedForExecutiveStory: false,
    validated: modes.length > 0,
  };
}

async function observedPeriods(
  dataset: LocalWorkbenchDataset,
  intent: ResolvedQueryIntent,
  filter: { sql: string; params: unknown[] },
) {
  if (!intent.timeField) return [];
  const time = quoteIdentifier(intent.timeField);
  const rows = await queryDuckDBPrepared(
    `SELECT TRIM(CAST(${time} AS VARCHAR)) AS value
    FROM ${quoteIdentifier(dataset.metadata.localTableName)}
    WHERE ${filter.sql}
      AND ${time} IS NOT NULL
      AND TRIM(CAST(${time} AS VARCHAR)) <> ''
    GROUP BY value
    ORDER BY
      TRY_CAST(value AS TIMESTAMP) ASC NULLS LAST,
      TRY_CAST(value AS DOUBLE) ASC NULLS LAST,
      value ASC`,
    filter.params,
  );
  return rows.flatMap((row) =>
    row.value === null || row.value === undefined ? [] : [String(row.value)],
  );
}

async function groupedMeasure(input: {
  dataset: LocalWorkbenchDataset;
  intent: ResolvedQueryIntent;
  dimension: string;
  filter: { sql: string; params: unknown[] };
}) {
  const dimension = quoteIdentifier(input.dimension);
  const rows = await queryDuckDBPrepared(
    `SELECT
      TRIM(CAST(${dimension} AS VARCHAR)) AS label,
      ${aggregateSql(input.intent)} AS value
    FROM ${quoteIdentifier(input.dataset.metadata.localTableName)}
    WHERE ${input.filter.sql}
      AND ${dimension} IS NOT NULL
      AND TRIM(CAST(${dimension} AS VARCHAR)) <> ''
    GROUP BY label
    ORDER BY value DESC`,
    input.filter.params,
  );
  return rows.map((row) => ({
    label: String(row.label),
    value: asNumber(row.value),
  }));
}

async function contributionInsight(input: {
  dataset: LocalWorkbenchDataset;
  intent: ResolvedQueryIntent;
  turn: DataThreadTurn;
  metricId: string;
  dimension: string;
  filter: { sql: string; params: unknown[] };
}): Promise<Insight | undefined> {
  const periods = await observedPeriods(
    input.dataset,
    input.intent,
    input.filter,
  );
  const first = periods[0];
  const last = periods.at(-1);
  if (!first || !last || first === last) return undefined;
  const beforeFilter = whereClause(input.intent, first);
  const afterFilter = whereClause(input.intent, last);
  const [before, after] = await Promise.all([
    groupedMeasure({ ...input, filter: beforeFilter }),
    groupedMeasure({ ...input, filter: afterFilter }),
  ]);
  const beforeByLabel = new Map(before.map((row) => [row.label, row.value]));
  const labels = [...new Set([...before, ...after].map((row) => row.label))];
  const data = labels
    .map((label) => ({
      label,
      value: (after.find((row) => row.label === label)?.value ?? 0) -
        (beforeByLabel.get(label) ?? 0),
    }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .filter((row) => row.value !== 0)
    .slice(0, input.intent.limit ?? 12);
  const top = data[0];
  const dimensionLabel = displayName(input.dataset, input.dimension);
  const focus = input.intent.seriesValues[0] ?? "the selected group";
  return {
    id: insightId(input.turn.id, `contribution-${input.dimension}`),
    questionId: input.turn.id,
    branchKey: `contribution:${input.dimension}`,
    headline: `${focus} change by ${dimensionLabel}`,
    finding: top
      ? `${focus} movement from ${first} to ${last} is most concentrated in ${top.label} (${top.value > 0 ? "+" : ""}${formatNumber(top.value)}). This is a descriptive contribution, not a causal proof.`
      : `No ${dimensionLabel} contribution was observed between ${first} and ${last}.`,
    metricIds: [input.metricId],
    filters: { from: first, to: last },
    period: last,
    comparisonPeriod: first,
    population: "Selected records across the first and latest populated snapshots",
    evidence: [
      {
        id: `${input.turn.id}-${input.dimension}-from`,
        label: "From snapshot",
        value: first,
        sourceDatasetIds: [input.dataset.metadata.id],
      },
      {
        id: `${input.turn.id}-${input.dimension}-to`,
        label: "To snapshot",
        value: last,
        sourceDatasetIds: [input.dataset.metadata.id],
      },
    ],
    chartSpec:
      data.length > 0
        ? {
            kind: "bar",
            title: `Contribution to ${focus} by ${dimensionLabel}`,
            xLabel: dimensionLabel,
            yLabel: "Change in headcount",
            unit: "people",
            data,
          }
        : undefined,
    confidence: input.intent.confidence,
    limitations: [
      "Contribution compares the first and latest populated snapshots for the selected filter.",
    ],
    suggestedFollowUps: peopleNextBestFollowUps({
      dataset: input.dataset,
      intent: input.intent,
      currentDimensions: [input.dimension],
    }),
    selectedForExecutiveStory: false,
    validated: data.length > 0,
  };
}

function methodSummary(
  intent: ResolvedQueryIntent,
  period: string | undefined,
) {
  const aggregation =
    intent.aggregation === "sum"
      ? `Sum of ${intent.measureField ?? "headcount"}`
      : intent.aggregation === "count_distinct"
        ? `Count distinct ${intent.measureField ?? "employees"}`
        : "Count of rows";
  const snapshot = period
    ? ", latest populated snapshot"
    : intent.timeStrategy === "all"
      ? ", all observed periods"
      : "";
  const population =
    intent.populationHint === "leadership" ? " · Leadership only" : "";
  const limit = intent.limit ? ` · Top ${intent.limit}` : "";
  return `${aggregation}${snapshot}${population}${limit}`;
}

export async function executeDirectQuery(input: {
  dataset: LocalWorkbenchDataset;
  intent: ResolvedQueryIntent;
  turn: DataThreadTurn;
  metricId: string;
}): Promise<DirectQueryOutput> {
  const period =
    input.intent.timeStrategy === "latest"
      ? await latestPeriod(
          input.dataset,
          input.intent.timeField,
          input.intent,
        )
      : undefined;
  const filter = whereClause(input.intent, period);
  const total = await totalCount(input.dataset, input.intent, filter);
  const dimensions = [
    ...new Set([
      ...input.intent.dimensions,
      ...input.intent.profileDimensions,
    ]),
  ].filter((dimension) =>
    input.dataset.metadata.columns.some(
      (column) => column.sourceName === dimension,
    ),
  );
  const isTrend = input.intent.timeStrategy === "all" && input.intent.timeField;
  const contributionDimensions = [
    ...new Set(input.intent.exploreDimensions ?? []),
  ].filter(
    (dimension) =>
      input.dataset.metadata.columns.some(
        (column) => column.sourceName === dimension,
      ) && !dimensions.includes(dimension),
  );
  const dimensionInsights =
    !isTrend && dimensions.length > 0
      ? await Promise.all(
          dimensions.map((dimension) =>
            dimensionInsight({
              ...input,
              dimension,
              filter,
              total: total.value,
              period,
            }),
          ),
        )
      : [];
  const contributionInsights =
    isTrend && input.intent.difficulty === "diagnostic"
      ? (
          await Promise.all(
            contributionDimensions.map((dimension) =>
              contributionInsight({
                ...input,
                dimension,
                filter,
              }),
            ),
          )
        ).filter((insight): insight is Insight => Boolean(insight))
      : [];
  const insights = isTrend
    ? [
        await trendInsight({
          ...input,
          dimension: dimensions[0],
        }),
        ...contributionInsights,
      ]
    : dimensionInsights.length > 0
      ? [
          ...(input.intent.profileDimensions.length > 0
            ? [
                profileSummaryInsight({
                  ...input,
                  insights: dimensionInsights,
                  total: total.value,
                }),
              ]
            : []),
          ...dimensionInsights,
        ]
      : [
          summaryInsight({
            ...input,
            value: total.value,
            sourceRows: total.sourceRows,
            period,
          }),
        ];
  const planDimensions = isTrend
    ? [input.intent.timeField!, ...(dimensions[0] ? [dimensions[0]] : [])]
    : dimensions;
  const plan: AnalysisPlan = {
    id: `${input.turn.id}-direct-plan`,
    questionId: input.turn.id,
    summary: "The question was translated into one local deterministic query path.",
    steps: isTrend
      ? [
          {
            id: `${input.turn.id}-direct-trend`,
            objective: `Compare observed headcount over ${displayName(
              input.dataset,
              input.intent.timeField!,
            )}.`,
            operation: "validate_trend",
            metricId: input.metricId,
            dimensions: planDimensions,
            status: insights[0]?.validated ? "complete" : "blocked",
            blockedReason: insights[0]?.validated
              ? undefined
              : "No populated time series were available.",
          },
        ]
      : (dimensions.length > 0 ? dimensions : ["summary"]).map(
          (dimension, index) => ({
            id: `${input.turn.id}-direct-${index + 1}`,
            objective:
              dimension === "summary"
                ? "Calculate observed headcount."
                : `Group observed headcount by ${displayName(input.dataset, dimension)}.`,
            operation: dimension === "summary" ? "summary" : "distribution",
            metricId: input.metricId,
            dimensions: dimension === "summary" ? [] : [dimension],
            status: dimensionInsights[index]?.validated ? "complete" : "blocked",
            blockedReason: dimensionInsights[index]?.validated
              ? undefined
              : "No populated groups were available.",
          }),
        ),
    createdAt: input.turn.createdAt,
  };
  return {
    plan,
    insights,
    methodNote: methodSummary(input.intent, period),
  };
}
