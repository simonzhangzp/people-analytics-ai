"use client";

import "client-only";

import {
  executeAttritionAnalysis,
  buildAttritionInsights,
  type AttritionRow,
} from "@/lib/analysis";
import { queryDuckDB, quoteIdentifier } from "@/lib/local-data";
import type {
  AnalysisPlan,
  AnalysisQuestion,
  Insight,
  LocalWorkbenchDataset,
  MetricDefinition,
} from "@/types/workbench";

function columnFor(
  dataset: LocalWorkbenchDataset | undefined,
  ...canonicalFields: string[]
) {
  return dataset?.metadata.columns.find(
    (column) =>
      column.canonicalField &&
      canonicalFields.includes(column.canonicalField),
  )?.sourceName;
}

function sourceColumnFor(
  dataset: LocalWorkbenchDataset | undefined,
  pattern: RegExp,
) {
  return dataset?.metadata.columns.find((column) => pattern.test(column.sourceName))
    ?.sourceName;
}

function table(dataset: LocalWorkbenchDataset) {
  return quoteIdentifier(dataset.metadata.localTableName);
}

function column(name: string) {
  return quoteIdentifier(name);
}

function optionalProjection(
  alias: string,
  tableAlias: string,
  sourceColumn?: string,
) {
  return sourceColumn
    ? `CAST(${tableAlias}.${column(sourceColumn)} AS VARCHAR) AS ${alias}`
    : `NULL AS ${alias}`;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["true", "1", "yes", "y"].includes(String(value).toLowerCase());
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function attritionSources(datasets: LocalWorkbenchDataset[]) {
  const headcount = datasets.find(
    (dataset) =>
      Boolean(columnFor(dataset, "employee_id")) &&
      Boolean(columnFor(dataset, "snapshot_month")),
  );
  const terminations = datasets.find(
    (dataset) =>
      Boolean(columnFor(dataset, "employee_id")) &&
      Boolean(columnFor(dataset, "term_date")),
  );
  const compensation = datasets.find(
    (dataset) =>
      Boolean(columnFor(dataset, "employee_id")) &&
      Boolean(
        columnFor(
          dataset,
          "compa_ratio",
          "annual_base_salary",
          "compensation_amount",
          "salary_midpoint",
        ),
      ),
  );
  if (!headcount || !terminations) {
    throw new Error(
      "Attrition analysis requires an employee snapshot and a termination-event dataset.",
    );
  }
  return { headcount, terminations, compensation };
}

export async function queryAttritionRows(
  datasets: LocalWorkbenchDataset[],
): Promise<AttritionRow[]> {
  const { headcount, terminations, compensation } = attritionSources(datasets);
  const headcountEmployee = columnFor(headcount, "employee_id")!;
  const snapshotDate = columnFor(headcount, "snapshot_month")!;
  const headcountDepartment = columnFor(headcount, "department");
  const headcountTenure = columnFor(headcount, "tenure_band", "years_at_company");
  const headcountLevel = columnFor(headcount, "seniority_level");
  const managerId = columnFor(headcount, "manager_id");

  const termEmployee = columnFor(terminations, "employee_id")!;
  const termDate = columnFor(terminations, "term_date")!;
  const termClassification = columnFor(terminations, "exit_classification");
  const termReason = columnFor(terminations, "termination_reason");
  const explicitPeriod = sourceColumnFor(
    terminations,
    /^(analysis_)?period$/i,
  );

  const compensationEmployee = columnFor(compensation, "employee_id");
  const compensationRatio = columnFor(compensation, "compa_ratio");
  const compensationAmount = columnFor(
    compensation,
    "annual_base_salary",
    "compensation_amount",
  );
  const compensationMidpoint = columnFor(compensation, "salary_midpoint");

  const terminationTypeExpression = termClassification
    ? `CAST(t.${column(termClassification)} AS VARCHAR)`
    : termReason
      ? `CAST(t.${column(termReason)} AS VARCHAR)`
      : "NULL";
  const voluntaryExpression = termClassification
    ? `LOWER(CAST(t.${column(termClassification)} AS VARCHAR)) IN ('voluntary', 'resignation')`
    : termReason
      ? `LOWER(CAST(t.${column(termReason)} AS VARCHAR)) LIKE '%voluntary%'
         OR LOWER(CAST(t.${column(termReason)} AS VARCHAR)) LIKE '%resign%'`
      : "FALSE";
  const terminationPeriodExpression = explicitPeriod
    ? `CASE
        WHEN LOWER(CAST(${column(explicitPeriod)} AS VARCHAR)) LIKE '%current%' THEN 'current'
        WHEN LOWER(CAST(${column(explicitPeriod)} AS VARCHAR)) LIKE '%previous%'
          OR LOWER(CAST(${column(explicitPeriod)} AS VARCHAR)) LIKE '%comparison%' THEN 'previous'
        ELSE NULL
      END`
    : `CASE
        WHEN TRY_CAST(${column(termDate)} AS DATE) >= (SELECT current_date FROM period_bounds)
          THEN 'current'
        ELSE 'previous'
      END`;

  let compensationCte = `compensation AS (
    SELECT NULL::VARCHAR AS employee_id, NULL::DOUBLE AS compensation_positioning
    WHERE FALSE
  )`;
  if (compensation && compensationEmployee) {
    const positioningExpression = compensationRatio
      ? `TRY_CAST(${column(compensationRatio)} AS DOUBLE)`
      : compensationAmount && compensationMidpoint
        ? `TRY_CAST(${column(compensationAmount)} AS DOUBLE)
           / NULLIF(TRY_CAST(${column(compensationMidpoint)} AS DOUBLE), 0)`
        : "NULL::DOUBLE";
    compensationCte = `compensation AS (
      SELECT
        CAST(${column(compensationEmployee)} AS VARCHAR) AS employee_id,
        MAX(${positioningExpression}) AS compensation_positioning
      FROM ${table(compensation)}
      GROUP BY 1
    )`;
  }

  const sql = `WITH
    snapshot_dates AS (
      SELECT DISTINCT TRY_CAST(${column(snapshotDate)} AS DATE) AS snapshot_date
      FROM ${table(headcount)}
      WHERE TRY_CAST(${column(snapshotDate)} AS DATE) IS NOT NULL
      ORDER BY snapshot_date DESC
      LIMIT 2
    ),
    period_bounds AS (
      SELECT
        MIN(snapshot_date) AS previous_date,
        MAX(snapshot_date) AS current_date
      FROM snapshot_dates
    ),
    headcount AS (
      SELECT
        CAST(h.${column(headcountEmployee)} AS VARCHAR) AS employee_id,
        CASE
          WHEN TRY_CAST(h.${column(snapshotDate)} AS DATE) =
            (SELECT current_date FROM period_bounds) THEN 'current'
          ELSE 'previous'
        END AS period,
        ${optionalProjection("department", "h", headcountDepartment)},
        ${optionalProjection("tenure_band", "h", headcountTenure)},
        ${optionalProjection("employee_level", "h", headcountLevel)},
        ${optionalProjection("manager_id", "h", managerId)}
      FROM ${table(headcount)} h
      WHERE TRY_CAST(h.${column(snapshotDate)} AS DATE) IN (
        SELECT snapshot_date FROM snapshot_dates
      )
    ),
    terminations AS (
      SELECT
        CAST(${column(termEmployee)} AS VARCHAR) AS employee_id,
        ${terminationPeriodExpression} AS period,
        ${terminationTypeExpression} AS termination_type,
        ${voluntaryExpression} AS voluntary_exit,
        ROW_NUMBER() OVER (
          PARTITION BY CAST(${column(termEmployee)} AS VARCHAR), ${terminationPeriodExpression}
          ORDER BY TRY_CAST(${column(termDate)} AS DATE) DESC NULLS LAST
        ) AS event_rank
      FROM ${table(terminations)} t
    ),
    ${compensationCte}
    SELECT
      h.employee_id AS "employeeId",
      h.period AS "period",
      h.department AS "department",
      h.tenure_band AS "tenureBand",
      h.employee_level AS "level",
      c.compensation_positioning AS "compensationPositioning",
      h.manager_id AS "managerId",
      TRUE AS "activeAtStart",
      t.employee_id IS NULL AS "activeAtEnd",
      t.employee_id IS NOT NULL AS "exitEvent",
      COALESCE(t.voluntary_exit, FALSE) AS "voluntaryExit",
      t.termination_type AS "terminationType"
    FROM headcount h
    LEFT JOIN terminations t
      ON h.employee_id = t.employee_id
      AND h.period = t.period
      AND t.event_rank = 1
    LEFT JOIN compensation c
      ON h.employee_id = c.employee_id`;

  const rows = await queryDuckDB(sql);
  if (rows.length === 0) {
    throw new Error(
      "The local engine could not form two comparable snapshot periods.",
    );
  }
  return rows.map((row) => ({
    employeeId: String(row.employeeId),
    period: String(row.period),
    department:
      row.department === null ? null : String(row.department),
    tenureBand:
      row.tenureBand === null ? null : String(row.tenureBand),
    level: row.level === null ? null : String(row.level),
    compensationPositioning: numberValue(row.compensationPositioning),
    managerId: row.managerId === null ? null : String(row.managerId),
    activeAtStart: booleanValue(row.activeAtStart),
    activeAtEnd: booleanValue(row.activeAtEnd),
    exitEvent: booleanValue(row.exitEvent),
    voluntaryExit: booleanValue(row.voluntaryExit),
    terminationType:
      row.terminationType === null ? null : String(row.terminationType),
  }));
}

export async function executeLocalAttritionWorkbench({
  question,
  metric,
  datasets,
  plan,
}: {
  question: AnalysisQuestion;
  metric: MetricDefinition;
  datasets: LocalWorkbenchDataset[];
  plan: AnalysisPlan;
}): Promise<{ plan: AnalysisPlan; insights: Insight[] }> {
  const rows = await queryAttritionRows(datasets);
  const result = executeAttritionAnalysis({
    rows,
    periods: {
      comparison: {
        id: "previous",
        label: "Jul–Dec 2025",
      },
      current: {
        id: "current",
        label: "Jan–Jun 2026",
      },
    },
    population: "Engineering",
    metricDefinition: metric,
    denominatorBasis: "beginning",
    retirementClassification: "excluded",
    populationFilter: (row) =>
      !row.department ||
      row.department.trim().toLowerCase() === "engineering",
  });
  const tenureCompensationResult = executeAttritionAnalysis({
    rows,
    periods: result.periods,
    population: "Engineering employees with 2–4 years tenure",
    metricDefinition: metric,
    denominatorBasis: "beginning",
    retirementClassification: "excluded",
    populationFilter: (row) =>
      (!row.department ||
        row.department.trim().toLowerCase() === "engineering") &&
      /2\s*[–-]\s*4/.test(String(row.tenureBand ?? "")),
  });
  const combinedResult = {
    ...result,
    compensationAssociation:
      tenureCompensationResult.compensationAssociation,
    limitations: [
      ...result.limitations.filter(
        (limitation) => !limitation.toLowerCase().includes("compensation"),
      ),
      "Compensation association is calculated within the 2–4 year Engineering cohort.",
      tenureCompensationResult.compensationAssociation.limitation,
    ],
  };
  const insights = buildAttritionInsights(combinedResult, {
    questionId: question.id,
    metricIds: [metric.id],
    sourceDatasetIds: datasets.map(({ metadata }) => metadata.id),
  }).map((insight): Insight => {
    if (insight.branchKey === "trend") {
      return {
        ...insight,
        chartSpec: {
          kind: "line",
          title: "Engineering voluntary attrition rate",
          unit: "percent",
          data: [
            {
              label: result.periods.comparison.label,
              value: result.trend.comparison.voluntaryAttritionRate ?? 0,
            },
            {
              label: result.periods.current.label,
              value: result.trend.current.voluntaryAttritionRate ?? 0,
            },
          ],
        },
        suggestedFollowUps: [
          { key: "tenure", label: "Break down by tenure", available: true },
          { key: "level", label: "Break down by level", available: true },
        ],
      };
    }
    if (insight.branchKey === "tenure") {
      const top = result.tenureContribution[0];
      return {
        ...insight,
        headline: top
          ? `${top.segment} employees account for ${Math.round(
              top.shareOfChangePct ?? 0,
            )}% of the attrition increase`
          : insight.headline,
        chartSpec: {
          kind: "bar",
          title: "Contribution to the attrition-rate increase by tenure",
          unit: "percentage points",
          data: result.tenureContribution.slice(0, 6).map((item) => ({
            label: item.segment,
            value: item.contributionPp ?? 0,
          })),
        },
        suggestedFollowUps: [
          { key: "level", label: "Break down by level", available: true },
          {
            key: "compensation",
            label: "Compare compensation",
            available:
              combinedResult.compensationAssociation.status === "observed",
            unavailableReason:
              combinedResult.compensationAssociation.status === "observed"
                ? undefined
                : "Compensation positioning is missing.",
          },
        ],
      };
    }
    if (insight.branchKey === "level") {
      return {
        ...insight,
        chartSpec: {
          kind: "bar",
          title: "Contribution to the attrition-rate increase by level",
          unit: "percentage points",
          data: result.levelContribution.slice(0, 6).map((item) => ({
            label: item.segment,
            value: item.contributionPp ?? 0,
          })),
        },
        suggestedFollowUps: [
          {
            key: "compensation",
            label: "Compare compensation",
            available:
              combinedResult.compensationAssociation.status === "observed",
          },
        ],
      };
    }
    if (insight.branchKey === "compensation") {
      return {
        ...insight,
        chartSpec: {
          kind: "bar",
          title: "Observed exit incidence by compensation positioning",
          unit: "percent",
          data: combinedResult.compensationAssociation.bands.map((band) => ({
            label: band.band,
            value: band.exitRate ?? 0,
          })),
        },
        suggestedFollowUps: [
          {
            key: "organization",
            label: "Test manager effectiveness",
            available: false,
            unavailableReason:
              combinedResult.managerAnalysis.reason ??
              "Manager effectiveness data is absent.",
          },
        ],
      };
    }
    return insight;
  });
  return {
    plan: {
      ...plan,
      steps: plan.steps.map((step) =>
        step.operation === "data_gap"
          ? step
          : { ...step, status: "complete" as const },
      ),
    },
    insights,
  };
}

