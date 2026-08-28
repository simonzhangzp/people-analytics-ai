import type {
  FieldMapping,
  Insight,
  MetricDefinition,
} from "@/types/workbench";
import type { ZodType } from "zod";
import {
  createDeepSeekProviderFromEnv,
  LLMProviderError,
  type LLMProvider,
  type LLMProviderErrorCode,
} from "./provider";
import {
  analysisPlannerOutputSchema,
  executiveStorytellerOutputSchema,
  insightInterpreterOutputSchema,
  metricCodesignerOutputSchema,
  semanticInterpreterOutputSchema,
  type AnalysisPlannerInput,
  type AnalysisPlannerOutput,
  type ExecutiveStorytellerInput,
  type ExecutiveStorytellerOutput,
  type InsightInterpreterInput,
  type InsightInterpreterOutput,
  type MetricCodesignerInput,
  type MetricCodesignerOutput,
  type SemanticInterpreterInput,
  type SemanticInterpreterOutput,
  type WorkbenchAIOutput,
  type WorkbenchAIRequest,
  type WorkbenchAITaskName,
} from "./schemas";

export interface WorkbenchAIWarning {
  code: LLMProviderErrorCode;
  message: string;
  details?: string[];
}

type WorkbenchAIExecutionFor<T extends WorkbenchAIOutput> = {
  task: T["task"];
  source: "deepseek" | "deterministic";
  data: T;
  warning?: WorkbenchAIWarning;
};

export type WorkbenchAIExecutionResult =
  | WorkbenchAIExecutionFor<SemanticInterpreterOutput>
  | WorkbenchAIExecutionFor<MetricCodesignerOutput>
  | WorkbenchAIExecutionFor<AnalysisPlannerOutput>
  | WorkbenchAIExecutionFor<InsightInterpreterOutput>
  | WorkbenchAIExecutionFor<ExecutiveStorytellerOutput>;

const TASK_PROMPTS: Record<WorkbenchAITaskName, string> = {
  semantic_interpreter:
    "Interpret dataset semantics from safe profiles only. Return proposed mappings and relationships as reviewable knowledge. Do not infer employee values or claim an unobserved join match rate.",
  metric_codesigner:
    "Return a reviewable semantic metric patch. Expressions must use the supplied structured metric expression objects only. Never return SQL, code, or mark a patch as already applied.",
  analysis_planner:
    "Plan analysis using only these operations: summary, distribution, validate_trend, segment, compare_periods, contribution, association, duration, funnel, rate, data_gap. Do not return SQL, executable code, or claim that an operation has run.",
  insight_interpreter:
    "Interpret only the supplied aggregate results. Cite aggregate result ids, do not invent values, and describe limitations or missing evidence explicitly.",
  executive_storyteller:
    "Create only an executive story outline grounded in supplied insights. Keep source notes and limitations visible. Do not generate queries or new quantitative evidence.",
};

function stableId(...parts: string[]): string {
  const value = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
  return value || "item";
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

export function deterministicSemanticFallback(
  input: SemanticInterpreterInput,
): SemanticInterpreterOutput {
  const knownMappingKeys = new Set(
    input.knownMappings.map(
      (mapping) => `${mapping.datasetId}\u0000${mapping.sourceColumn}`,
    ),
  );

  const mappingProposals: FieldMapping[] = input.datasets.flatMap(
    ({ datasetId, profile }) =>
      profile.columns
        .filter(
          (column) =>
            !knownMappingKeys.has(`${datasetId}\u0000${column.sourceName}`) &&
            Boolean(column.canonicalField || column.semanticMeaning),
        )
        .map((column) => ({
          id: stableId("mapping", datasetId, column.sourceName),
          datasetId,
          sourceColumn: column.sourceName,
          semanticMeaning:
            column.semanticMeaning ??
            `Review the intended meaning of ${column.sourceName}.`,
          canonicalField: column.canonicalField,
          confidence: column.confidence ?? 0.5,
          status: "Needs Review" as const,
        })),
  );

  return semanticInterpreterOutputSchema.parse({
    task: "semantic_interpreter",
    summary:
      "Deterministic fallback preserved profile-provided semantics for human review; no model interpretation was used.",
    datasetSemantics: input.datasets.map(({ datasetId, profile }) => ({
      datasetId,
      inferredType: profile.inferredType,
      grain: profile.grain,
      confidence: profile.grainConfidence,
      rationale: "Copied from the locally computed safe dataset profile.",
    })),
    mappingProposals: uniqueById(mappingProposals),
    relationshipProposals: [],
    assumptions: [],
    missingEvidence:
      input.datasets.length > 1
        ? [
            "Cross-dataset relationships require approved keys and aggregate match evidence.",
          ]
        : ["Semantic proposals require human confirmation before approval."],
  });
}

export function deterministicMetricFallback(
  input: MetricCodesignerInput,
): MetricCodesignerOutput {
  return metricCodesignerOutputSchema.parse({
    task: "metric_codesigner",
    patch: {
      metricId: input.metric.id,
      summary:
        "No metric changes were generated because live structured AI was unavailable or invalid.",
      items: [],
      nextDefinition: input.metric,
      status: "Cancelled",
    },
    ambiguities: [],
    assumptions: [],
    missingEvidence: [
      `Human review is required to translate this instruction into a metric patch: ${input.instruction}`,
    ],
  });
}

export function deterministicAnalysisFallback(
  input: AnalysisPlannerInput,
): AnalysisPlannerOutput {
  const requestedMetrics = input.question.metricIds
    .map((id) => input.metrics.find((metric) => metric.id === id))
    .filter((metric): metric is MetricDefinition => Boolean(metric));
  const primaryMetric = requestedMetrics[0] ?? input.metrics[0];
  const primaryDimension = primaryMetric.dimensions[0];
  const hasTimeCoverage = input.datasetProfiles.some(
    ({ profile }) => Boolean(profile.timeRange),
  );

  const steps: AnalysisPlannerOutput["plan"]["steps"] = [
    {
      id: stableId("step", input.question.id, "validate-trend"),
      objective: `Validate the aggregate trend for ${primaryMetric.name}.`,
      operation: "validate_trend",
      metricId: primaryMetric.id,
      status: hasTimeCoverage ? "planned" : "blocked",
      blockedReason: hasTimeCoverage
        ? undefined
        : "No time range is present in the supplied safe dataset profiles.",
    },
  ];

  if (primaryDimension) {
    steps.push({
      id: stableId("step", input.question.id, "segment", primaryDimension),
      objective: `Compare ${primaryMetric.name} across ${primaryDimension}.`,
      operation: "segment",
      metricId: primaryMetric.id,
      dimensions: [primaryDimension],
      status: "planned",
    });
  }

  if (hasTimeCoverage) {
    steps.push({
      id: stableId("step", input.question.id, "compare-periods"),
      objective: `Compare available periods for ${primaryMetric.name}.`,
      operation: "compare_periods",
      metricId: primaryMetric.id,
      status: "planned",
    });
  }

  return analysisPlannerOutputSchema.parse({
    task: "analysis_planner",
    plan: {
      id: stableId("plan", input.question.id),
      questionId: input.question.id,
      summary:
        "Deterministic plan limited to declared metrics, dimensions, and safe profile coverage.",
      steps,
      createdAt: input.question.createdAt,
    },
    assumptions: [],
    missingEvidence: hasTimeCoverage
      ? []
      : ["A comparable time period is required for trend and period analysis."],
  });
}

function formatAggregateValue(value: number, unit: string): string {
  const formatted = Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (unit === "percent") return `${formatted}%`;
  if (unit === "percentage points") return `${formatted} percentage points`;
  if (unit === "days") return `${formatted} days`;
  return `${formatted} ${unit}`;
}

export function deterministicInsightFallback(
  input: InsightInterpreterInput,
): InsightInterpreterOutput {
  const primary = input.aggregatedResults[0];
  const comparison =
    primary.comparisonValue === undefined
      ? ""
      : ` compared with ${formatAggregateValue(primary.comparisonValue, primary.unit)}`;
  const hasSampleSizes = input.aggregatedResults.every(
    (result) => result.sampleSize !== undefined,
  );
  const hasDimension = input.aggregatedResults.some(
    (result) => Object.keys(result.dimensions).length > 0,
  );

  return insightInterpreterOutputSchema.parse({
    task: "insight_interpreter",
    interpretation: {
      headline: `${primary.label}: ${formatAggregateValue(primary.value, primary.unit)}`,
      finding: `The supplied aggregate reports ${formatAggregateValue(primary.value, primary.unit)}${comparison}. This fallback does not infer causality or statistical significance.`,
      confidence: hasSampleSizes ? "Medium" : "Low",
      limitations: [
        hasSampleSizes
          ? "Aggregate sample sizes are available, but significance was not tested."
          : "Aggregate sample sizes were not supplied.",
      ],
      suggestedFollowUps: [
        {
          key: "trend",
          label: "Validate the trend across comparable periods",
          available: input.aggregatedResults.some((result) => Boolean(result.period)),
          unavailableReason: input.aggregatedResults.some((result) =>
            Boolean(result.period),
          )
            ? undefined
            : "No period labels were supplied.",
        },
        {
          key: "organization",
          label: "Compare approved organizational segments",
          available: hasDimension,
          unavailableReason: hasDimension
            ? undefined
            : "No aggregate dimensions were supplied.",
        },
      ],
    },
    evidenceResultIds: input.aggregatedResults.slice(0, 10).map(({ id }) => id),
    assumptions: [],
    missingEvidence: hasSampleSizes
      ? []
      : ["Sample sizes are needed to assess reliability."],
  });
}

function selectedInsights(insights: Insight[]): Insight[] {
  const selected = insights.filter(
    (insight) => insight.selectedForExecutiveStory,
  );
  return selected.length > 0 ? selected : insights;
}

export function deterministicStoryFallback(
  input: ExecutiveStorytellerInput,
): ExecutiveStorytellerOutput {
  const availableInsights = selectedInsights(input.insights);
  const slides = Array.from({ length: input.slideCount }, (_, index) => {
    const insight = availableInsights[index % availableInsights.length];
    return {
      index: index + 1,
      kicker:
        index === 0
          ? "Decision context"
          : index === input.slideCount - 1
            ? "Next decision"
            : "Supporting evidence",
      headline: insight.headline,
      insightIds: [insight.id],
      evidence: insight.evidence
        .slice(0, 3)
        .map((item) => `${item.label}: ${item.value}`),
      sourceNote: insight.validated
        ? `Grounded in validated Workbench insight ${insight.id}.`
        : `Grounded in Workbench insight ${insight.id}; validation is pending.`,
      limitation: insight.limitations[0],
    };
  });

  return executiveStorytellerOutputSchema.parse({
    task: "executive_storyteller",
    outline: {
      workspaceId: input.workspaceId,
      audience: input.audience,
      purpose: input.purpose,
      slideCount: input.slideCount,
      slides,
    },
    assumptions: [],
    missingEvidence: availableInsights.some((insight) => !insight.validated)
      ? ["One or more selected insights still require validation."]
      : [],
  });
}

function invalidLiveOutput(message: string, details?: string[]): never {
  throw new LLMProviderError("schema_validation_failed", message, details);
}

function validateSemanticOutput(
  input: SemanticInterpreterInput,
  output: SemanticInterpreterOutput,
): void {
  const datasetIds = new Set(input.datasets.map(({ datasetId }) => datasetId));
  const invalidDatasetId = [
    ...output.datasetSemantics.map(({ datasetId }) => datasetId),
    ...output.mappingProposals.map(({ datasetId }) => datasetId),
    ...output.relationshipProposals.flatMap((relationship) => [
      relationship.fromDatasetId,
      relationship.toDatasetId,
    ]),
  ].find((id) => !datasetIds.has(id));
  if (invalidDatasetId) {
    invalidLiveOutput("DeepSeek referenced a dataset that was not supplied.", [
      invalidDatasetId,
    ]);
  }

  const nonReviewableProposal = [
    ...output.mappingProposals,
    ...output.relationshipProposals,
  ].find(
    (proposal) =>
      proposal.status !== "Proposed" && proposal.status !== "Needs Review",
  );
  if (nonReviewableProposal) {
    invalidLiveOutput(
      "DeepSeek semantic knowledge must remain a reviewable proposal.",
    );
  }
}

function validateMetricOutput(
  input: MetricCodesignerInput,
  output: MetricCodesignerOutput,
): void {
  if (
    output.patch.metricId !== input.metric.id ||
    output.patch.nextDefinition.id !== input.metric.id
  ) {
    invalidLiveOutput("DeepSeek changed the identity of the metric.");
  }
  if (
    output.patch.status !== "Ready to apply" ||
    !["Proposed", "Needs Review"].includes(output.patch.nextDefinition.status)
  ) {
    invalidLiveOutput(
      "DeepSeek metric changes must remain reviewable proposals.",
    );
  }
}

function validateAnalysisOutput(
  input: AnalysisPlannerInput,
  output: AnalysisPlannerOutput,
): void {
  const metricIds = new Set(input.metrics.map(({ id }) => id));
  if (output.plan.questionId !== input.question.id) {
    invalidLiveOutput("DeepSeek changed the analysis question identity.");
  }
  if (
    output.plan.steps.some(
      (step) =>
        (step.metricId && !metricIds.has(step.metricId)) ||
        !["planned", "blocked"].includes(step.status),
    )
  ) {
    invalidLiveOutput(
      "DeepSeek returned an unknown metric or claimed an analysis step had run.",
    );
  }
}

function validateInsightOutput(
  input: InsightInterpreterInput,
  output: InsightInterpreterOutput,
): void {
  const resultIds = new Set(input.aggregatedResults.map(({ id }) => id));
  if (output.evidenceResultIds.some((id) => !resultIds.has(id))) {
    invalidLiveOutput(
      "DeepSeek cited aggregate evidence that was not supplied.",
    );
  }
}

function validateStoryOutput(
  input: ExecutiveStorytellerInput,
  output: ExecutiveStorytellerOutput,
): void {
  const insightIds = new Set(input.insights.map(({ id }) => id));
  const outline = output.outline;
  if (
    outline.workspaceId !== input.workspaceId ||
    outline.audience !== input.audience ||
    outline.purpose !== input.purpose ||
    outline.slideCount !== input.slideCount ||
    outline.slides.length !== input.slideCount
  ) {
    invalidLiveOutput("DeepSeek changed the requested story constraints.");
  }
  if (
    outline.slides.some((slide) =>
      slide.insightIds.some((id) => !insightIds.has(id)),
    )
  ) {
    invalidLiveOutput("DeepSeek cited an insight that was not supplied.");
  }
}

async function generateOrFallback<T>(
  provider: LLMProvider,
  task: WorkbenchAITaskName,
  input: unknown,
  schema: ZodType<T>,
  fallback: () => T,
  validateLive: (output: T) => void,
): Promise<{
  source: "deepseek" | "deterministic";
  data: T;
  warning?: WorkbenchAIWarning;
}> {
  try {
    const data = await provider.generateStructured({
      schema,
      schemaName: task,
      systemPrompt: TASK_PROMPTS[task],
      input,
    });
    validateLive(data);
    return { source: "deepseek", data };
  } catch (error) {
    const providerError =
      error instanceof LLMProviderError
        ? error
        : new LLMProviderError(
            "provider_error",
            "The configured AI provider failed unexpectedly.",
          );
    return {
      source: "deterministic",
      data: fallback(),
      warning: {
        code: providerError.code,
        message: providerError.message,
        details: providerError.details,
      },
    };
  }
}

export async function executeWorkbenchAITask(
  request: WorkbenchAIRequest,
  provider: LLMProvider = createDeepSeekProviderFromEnv(),
): Promise<WorkbenchAIExecutionResult> {
  switch (request.task) {
    case "semantic_interpreter": {
      const result = await generateOrFallback(
        provider,
        request.task,
        request.input,
        semanticInterpreterOutputSchema,
        () => deterministicSemanticFallback(request.input),
        (output) => validateSemanticOutput(request.input, output),
      );
      return { task: request.task, ...result };
    }
    case "metric_codesigner": {
      const result = await generateOrFallback(
        provider,
        request.task,
        request.input,
        metricCodesignerOutputSchema,
        () => deterministicMetricFallback(request.input),
        (output) => validateMetricOutput(request.input, output),
      );
      return { task: request.task, ...result };
    }
    case "analysis_planner": {
      const result = await generateOrFallback(
        provider,
        request.task,
        request.input,
        analysisPlannerOutputSchema,
        () => deterministicAnalysisFallback(request.input),
        (output) => validateAnalysisOutput(request.input, output),
      );
      return { task: request.task, ...result };
    }
    case "insight_interpreter": {
      const result = await generateOrFallback(
        provider,
        request.task,
        request.input,
        insightInterpreterOutputSchema,
        () => deterministicInsightFallback(request.input),
        (output) => validateInsightOutput(request.input, output),
      );
      return { task: request.task, ...result };
    }
    case "executive_storyteller": {
      const result = await generateOrFallback(
        provider,
        request.task,
        request.input,
        executiveStorytellerOutputSchema,
        () => deterministicStoryFallback(request.input),
        (output) => validateStoryOutput(request.input, output),
      );
      return { task: request.task, ...result };
    }
  }
}

export type {
  AnalysisPlannerInput,
  AnalysisPlannerOutput,
  ExecutiveStorytellerInput,
  ExecutiveStorytellerOutput,
  InsightInterpreterInput,
  InsightInterpreterOutput,
  MetricCodesignerInput,
  MetricCodesignerOutput,
  SemanticInterpreterInput,
  SemanticInterpreterOutput,
};
