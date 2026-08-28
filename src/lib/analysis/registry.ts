import {
  getMetricDefinition,
  INITIAL_PEOPLE_METRIC_LIBRARY,
} from "@/lib/metrics/library";
import type {
  AnalysisPlan,
  AnalysisQuestion,
  LocalWorkbenchDataset,
  MetricDefinition,
} from "@/types/workbench";
import type {
  CapabilityReport,
  GenericAnalysisOperation,
} from "@/types/semantics";
import { DOMAIN_EXECUTORS } from "./executors/domain-executors";
import type {
  DeterministicAnalysisOutput,
  DomainExecutor,
} from "./executors/types";

const OBJECTIVE_LABELS: Record<GenericAnalysisOperation, string> = {
  summary: "Calculate the primary observed aggregate.",
  distribution: "Describe the largest reportable categories.",
  validate_trend: "Validate change across observed periods.",
  compare_periods: "Compare available reported periods.",
  segment: "Compare available, approved population segments.",
  contribution: "Decompose an observed change by available segments.",
  association: "Measure a descriptive association without causal language.",
  duration: "Calculate elapsed time from compatible start and end events.",
  funnel: "Calculate stage counts within a compatible cohort.",
  rate: "Calculate a rate only when numerator and denominator are observable.",
  data_gap: "Document missing evidence without substituting a metric.",
};

export function getDomainExecutor(
  capability: Pick<CapabilityReport, "domain" | "metricKey">,
): DomainExecutor | undefined {
  return (
    DOMAIN_EXECUTORS.find(
      (executor) =>
        executor.domain === capability.domain &&
        executor.metricKeys.includes(capability.metricKey),
    ) ??
    DOMAIN_EXECUTORS.find(
      (executor) => executor.domain === capability.domain,
    )
  );
}

export function metricForCapability(
  capability: CapabilityReport,
): MetricDefinition {
  const libraryMetric =
    getMetricDefinition(capability.metricKey) ??
    INITIAL_PEOPLE_METRIC_LIBRARY.find(
      (metric) => metric.domain === capability.domain,
    );
  if (libraryMetric) {
    return structuredClone(libraryMetric);
  }
  return {
    id: `metric-${capability.metricKey.replaceAll("_", "-")}`,
    key: capability.metricKey,
    name: capability.metricName,
    domain: capability.domain,
    description: `Deterministic ${capability.domain} metric selected from the attached table contract.`,
    formula: {
      kind: "count",
      entity: "aggregate_record",
    },
    inclusions: [],
    exclusions: [],
    timeBasis:
      capability.currentWindow?.label ??
      "All observed records; no period comparison is implied",
    sourceFields: [],
    dimensions: [],
    status: "Approved",
    confidence: capability.confidence,
    version: 1,
    approvedAt: new Date().toISOString(),
  };
}

export function createCapabilityAnalysisPlan(
  question: AnalysisQuestion,
  capability: CapabilityReport,
  metric: MetricDefinition,
): AnalysisPlan {
  const operations = capability.runnable
    ? capability.supportedOperations.slice(0, 4)
    : (["data_gap"] as const);
  return {
    id: `${question.id}-${capability.domain}-plan`,
    questionId: question.id,
    summary: capability.runnable
      ? `${capability.metricName} will use ${capability.datasetIds.length} compatible local dataset${capability.datasetIds.length === 1 ? "" : "s"} and only observed population/period fields.`
      : `${capability.metricName} is blocked until the listed evidence is attached or mapped.`,
    steps: operations.map((operation, index) => ({
      id: `${question.id}-${capability.domain}-${operation}-${index + 1}`,
      objective: `${OBJECTIVE_LABELS[operation]} ${metric.name}.`,
      operation,
      metricId: metric.id,
      status: capability.runnable ? "planned" : "blocked",
      blockedReason: capability.runnable
        ? undefined
        : capability.missing.join(" "),
    })),
    createdAt: question.createdAt,
  };
}

export async function executeDomainAnalysis(input: {
  question: AnalysisQuestion;
  capability: CapabilityReport;
  metric: MetricDefinition;
  datasets: LocalWorkbenchDataset[];
  plan?: AnalysisPlan;
}): Promise<DeterministicAnalysisOutput> {
  const executor = getDomainExecutor(input.capability);
  if (!executor) {
    throw new Error(
      `No deterministic executor is registered for ${input.capability.domain}.`,
    );
  }
  const datasets = input.datasets.filter((dataset) =>
    input.capability.datasetIds.includes(dataset.metadata.id),
  );
  const plan =
    input.plan ??
    createCapabilityAnalysisPlan(
      input.question,
      input.capability,
      input.metric,
    );
  return executor.execute({
    question: input.question,
    capability: input.capability,
    metric: input.metric,
    datasets,
    plan,
  });
}

export { DOMAIN_EXECUTORS };
export type {
  AnalysisExecutionContext,
  DeterministicAnalysisOutput,
  DomainExecutor,
} from "./executors/types";
