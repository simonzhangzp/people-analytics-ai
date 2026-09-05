"use client";

import "client-only";

import type {
  DataThreadTurn,
  LocalWorkbenchDataset,
  ResolvedQueryIntent,
} from "@/types/workbench";
import { executeDirectQuery } from "./direct-query";
import {
  distinctValues,
  inspectSchema,
  profileColumn,
} from "./local-tools";
import { isLeadershipLabel } from "./people-intelligence";

function column(
  dataset: LocalWorkbenchDataset,
  sourceName: string | undefined,
) {
  return dataset.metadata.columns.find(
    (candidate) => candidate.sourceName === sourceName,
  );
}

export async function runAnalystAgent(input: {
  question: string;
  dataset: LocalWorkbenchDataset;
  intent: ResolvedQueryIntent;
  turn: DataThreadTurn;
  metricId: string;
}) {
  const intent: ResolvedQueryIntent = {
    ...input.intent,
    dimensionFilters: [...(input.intent.dimensionFilters ?? [])],
    assumptions: [...input.intent.assumptions],
  };
  const tools = ["inspect_schema"];
  inspectSchema(input.dataset);

  if (intent.measureField) {
    const profile = await profileColumn(input.dataset, intent.measureField);
    tools.push(`profile_column(${intent.measureField})`);
    const measure = column(input.dataset, intent.measureField);
    const numericRange =
      profile.minNumeric !== null &&
      profile.maxNumeric !== null &&
      profile.maxNumeric > profile.minNumeric;
    if (
      intent.aggregation !== "sum" &&
      measure?.canonicalField === "employee_count" &&
      numericRange
    ) {
      intent.aggregation = "sum";
      intent.assumptions = [
        `Headcount is summed from ${intent.measureField}.`,
        ...intent.assumptions.filter(
          (assumption) => !assumption.includes("person key"),
        ),
      ];
    }
    if (
      intent.aggregation === "count" &&
      profile.sumNumeric !== null &&
      profile.populated > 0 &&
      profile.sumNumeric > profile.populated &&
      measure?.inferredType === "number"
    ) {
      intent.aggregation = "sum";
      intent.measureField = measure.sourceName;
    }
  }

  if (intent.populationHint === "leadership") {
    const candidates = input.dataset.metadata.columns.filter((item) =>
      ["seniority_level", "job_role", "job_title", "manager_flag"].includes(
        item.canonicalField ?? "",
      ),
    );
    for (const candidate of candidates) {
      const values = await distinctValues(input.dataset, candidate.sourceName);
      tools.push(`distinct_values(${candidate.sourceName})`);
      const matched =
        candidate.canonicalField === "manager_flag"
          ? values
              .filter((item) => /^(true|yes|y|1|manager)$/i.test(item.value))
              .map((item) => item.value)
          : values
              .filter((item) => isLeadershipLabel(item.value))
              .map((item) => item.value);
      if (matched.length === 0) continue;
      intent.dimensionFilters = [
        ...(intent.dimensionFilters ?? []).filter(
          (filter) => filter.field !== candidate.sourceName,
        ),
        { field: candidate.sourceName, values: matched },
      ];
      intent.assumptions = [
        ...intent.assumptions,
        `${candidate.sourceName} filtered to leadership values.`,
      ];
      break;
    }
  }

  const result = await executeDirectQuery({
    dataset: input.dataset,
    intent,
    turn: input.turn,
    metricId: input.metricId,
  });
  return {
    ...result,
    plan: {
      ...result.plan,
      summary: `Analyst loop: ${tools.join(" → ")} → run_sql → create_chart. ${result.plan.summary}`,
    },
  };
}
