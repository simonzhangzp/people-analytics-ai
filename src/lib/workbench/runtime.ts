"use client";

import "client-only";

import { ingestPeopleFiles } from "@/lib/local-data";
import {
  buildExecutiveStory,
  exportExecutiveStoryPptx,
} from "@/lib/ppt";
import { createKnowledgeRepository } from "@/lib/knowledge";
import {
  executeDomainAnalysis,
  type DeterministicAnalysisOutput,
} from "@/lib/analysis/registry";
import {
  buildCapabilityReports,
  selectCapabilityForQuestion,
} from "@/lib/semantics";
import { executeLocalAttritionWorkbench } from "@/lib/workbench/attrition-runtime";
import type { CapabilityReport } from "@/types/semantics";
import type {
  AnalysisPlan,
  AnalysisQuestion,
  ExecutiveStory,
  FieldMapping,
  Insight,
  LocalWorkbenchDataset,
  MetricDefinition,
  StorySlideCount,
  WorkbenchState,
} from "@/types/workbench";

export { isDuckDBInitializationError } from "@/lib/local-data/duckdb-client";

function ratio(value: number | undefined) {
  if (value === undefined) return undefined;
  return value > 1 ? value / 100 : value;
}

function normalizeDataset(dataset: LocalWorkbenchDataset): LocalWorkbenchDataset {
  const columns = dataset.metadata.columns.map((column) => ({
    ...column,
    nullPct: ratio(column.nullPct) ?? 0,
    distinctPct: ratio(column.distinctPct) ?? 0,
    confidence: ratio(column.confidence),
  }));
  return {
    ...dataset,
    metadata: {
      ...dataset.metadata,
      typeConfidence: ratio(dataset.metadata.typeConfidence) ?? 0,
      grainConfidence: ratio(dataset.metadata.grainConfidence) ?? 0,
      status: dataset.metadata.tableContract?.status ?? "Needs Review",
      columns,
      safeProfile: {
        ...dataset.metadata.safeProfile,
        grainConfidence:
          ratio(dataset.metadata.safeProfile.grainConfidence) ?? 0,
        columns: dataset.metadata.safeProfile.columns.map((column) => ({
          ...column,
          confidence: ratio(column.confidence),
        })),
      },
    },
  };
}

function mappingsFor(datasets: LocalWorkbenchDataset[]): FieldMapping[] {
  return datasets.flatMap(({ metadata }) =>
    metadata.columns.flatMap((column) => {
      if (!column.semanticMeaning && !column.canonicalField) return [];
      const confidence = column.confidence ?? 0.5;
      return [
        {
          id: `mapping:${metadata.id}:${column.sourceName}`,
          datasetId: metadata.id,
          sourceColumn: column.sourceName,
          semanticMeaning:
            column.semanticMeaning ??
            `Review the intended meaning of ${column.sourceName}.`,
          canonicalField: column.canonicalField,
          confidence,
          status: confidence >= 0.9 ? "Approved" : "Needs Review",
        },
      ];
    }),
  );
}

export async function ingestWorkbenchFiles(files: File[]) {
  const result = await ingestPeopleFiles(files);
  const datasets = result.datasets.map(normalizeDataset);
  const relationships = result.relationships.map((relationship) => {
    const matchRate = ratio(relationship.matchRate) ?? 0;
    const confidence = ratio(relationship.confidence) ?? 0;
    return {
      ...relationship,
      matchRate,
      confidence,
      status:
        matchRate >= 0.9 && confidence >= 0.75
          ? ("Approved" as const)
          : ("Needs Review" as const),
    };
  });
  return {
    datasets,
    mappings: mappingsFor(datasets),
    relationships,
  };
}

export async function persistApprovedMetric(
  workspaceId: string,
  metric: MetricDefinition,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `people-workbench:${workspaceId}:metric:${metric.id}`,
    JSON.stringify(metric),
  );
}

export async function persistWorkbenchState(
  state: WorkbenchState,
): Promise<"synced" | "local-only"> {
  const repository = await createKnowledgeRepository();
  if (!repository) return "local-only";
  await repository.saveWorkbenchState(state);
  return "synced";
}

export async function executeWorkbenchAnalysis({
  question,
  metric,
  datasets,
  plan,
  capability,
}: {
  question: AnalysisQuestion;
  metric: MetricDefinition;
  datasets: LocalWorkbenchDataset[];
  plan: AnalysisPlan;
  capability?: CapabilityReport;
}): Promise<DeterministicAnalysisOutput> {
  const resolvedCapability =
    capability ??
    selectCapabilityForQuestion(
      question.text,
      buildCapabilityReports(
        datasets.map(({ metadata }) => metadata),
      ),
    );
  if (!resolvedCapability) {
    throw new Error(
      "No deterministic HR analysis capability matches the attached data.",
    );
  }
  const supportsComparativeAttrition =
    resolvedCapability.domain === "retention" &&
    metric.key === "voluntary_attrition" &&
    datasets.some(
      (dataset) =>
        dataset.metadata.tableContract?.tableType === "employee_snapshot",
    ) &&
    datasets.some(
      (dataset) =>
        dataset.metadata.tableContract?.tableType === "termination_event",
    );
  if (supportsComparativeAttrition) {
    return executeLocalAttritionWorkbench({
      question,
      metric,
      datasets,
      plan,
    });
  }
  return executeDomainAnalysis({
    question,
    metric,
    datasets,
    plan,
    capability: resolvedCapability,
  });
}

export function buildWorkbenchStory(
  workspaceId: string,
  insights: Insight[],
  audience: ExecutiveStory["audience"],
  purpose: ExecutiveStory["purpose"],
  slideCount: StorySlideCount,
) {
  return buildExecutiveStory(
    insights,
    workspaceId,
    audience,
    purpose,
    slideCount,
  );
}

export async function exportWorkbenchStory(story: ExecutiveStory) {
  await exportExecutiveStoryPptx(story);
}

