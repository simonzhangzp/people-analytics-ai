import type {
  AnalysisPlan,
  AnalysisQuestion,
  AnalysisStep,
  ConfidenceLevel,
  DatasetRelationship,
  ExecutiveSlide,
  ExecutiveStory,
  FieldMapping,
  Insight,
  KnowledgeStatus,
  MetricAmbiguity,
  MetricDefinition,
  MetricExpression,
  MetricPatch,
  MetricRule,
  PeopleDomain,
  SafeDatasetProfile,
} from "@/types/workbench";
import { z } from "zod";

const idSchema = z.string().trim().min(1).max(160);
const shortTextSchema = z.string().trim().min(1).max(500);
const longTextSchema = z.string().trim().min(1).max(4_000);
const optionalLongTextSchema = z.string().trim().max(4_000).optional();
const boundedNumberSchema = z.number().finite();
const confidenceScoreSchema = boundedNumberSchema.min(0).max(1);
const percentSchema = boundedNumberSchema.min(0).max(100);

export const knowledgeStatusSchema = z.enum([
  "Proposed",
  "Needs Review",
  "Approved",
  "Superseded",
]) satisfies z.ZodType<KnowledgeStatus>;

export const confidenceLevelSchema = z.enum([
  "High",
  "Medium",
  "Low",
]) satisfies z.ZodType<ConfidenceLevel>;

export const peopleDomainSchema = z.enum([
  "workforce",
  "retention",
  "recruiting",
  "mobility",
  "compensation",
  "performance",
  "absence",
  "engagement",
  "learning",
  "diversity",
  "other",
]) satisfies z.ZodType<PeopleDomain>;

const columnDataTypeSchema = z.enum([
  "string",
  "number",
  "date",
  "boolean",
  "unknown",
]);

const semanticRoleSchema = z.enum([
  "entity_id",
  "person_id",
  "event_id",
  "period",
  "event_date",
  "as_of_date",
  "status",
  "category",
  "measure",
  "numerator",
  "denominator",
  "rating",
  "amount",
  "sensitive_dimension",
  "pii",
  "ignore",
]);

const safeColumnProfileSchema = z
  .object({
    sourceName: shortTextSchema,
    inferredType: columnDataTypeSchema,
    nullPct: percentSchema,
    distinctPct: percentSchema,
    likelyPII: z.boolean(),
    sensitive: z.boolean().optional(),
    canonicalField: shortTextSchema.optional(),
    semanticRole: semanticRoleSchema.optional(),
    semanticMeaning: longTextSchema.optional(),
    confidence: confidenceScoreSchema.optional(),
  })
  .strict();

export const safeDatasetProfileSchema = z
  .object({
    fileName: shortTextSchema,
    rowCount: z.number().int().nonnegative().max(10_000_000_000),
    columnCount: z.number().int().nonnegative().max(10_000),
    inferredType: shortTextSchema,
    grain: shortTextSchema,
    grainConfidence: confidenceScoreSchema,
    timeRange: shortTextSchema.optional(),
    columns: z.array(safeColumnProfileSchema).max(1_000),
  })
  .strict() satisfies z.ZodType<SafeDatasetProfile>;

export const fieldMappingSchema = z
  .object({
    id: idSchema,
    datasetId: idSchema,
    sourceColumn: shortTextSchema,
    semanticMeaning: longTextSchema,
    canonicalField: shortTextSchema.optional(),
    confidence: confidenceScoreSchema,
    status: knowledgeStatusSchema,
  })
  .strict() satisfies z.ZodType<FieldMapping>;

export const datasetRelationshipSchema = z
  .object({
    id: idSchema,
    fromDatasetId: idSchema,
    fromField: shortTextSchema,
    toDatasetId: idSchema,
    toField: shortTextSchema,
    cardinality: z.enum(["1:1", "1:N", "N:1", "N:N", "unknown"]),
    matchRate: confidenceScoreSchema,
    confidence: confidenceScoreSchema,
    status: knowledgeStatusSchema,
    evidence: z.array(longTextSchema).max(20),
    conflicts: z.array(longTextSchema).max(20),
  })
  .strict() satisfies z.ZodType<DatasetRelationship>;

export const metricRuleSchema = z
  .object({
    field: shortTextSchema,
    operator: z.enum([
      "equals",
      "not_equals",
      "in",
      "not_in",
      "is_null",
      "is_not_null",
      "before",
      "after",
    ]),
    value: z
      .union([
        z.string().max(500),
        boundedNumberSchema,
        z.boolean(),
        z.array(z.union([z.string().max(500), boundedNumberSchema])).max(100),
      ])
      .optional(),
    label: shortTextSchema,
  })
  .strict() satisfies z.ZodType<MetricRule>;

export const metricExpressionSchema: z.ZodType<MetricExpression> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("count"),
        entity: z.enum([
          "employee",
          "exit",
          "hire",
          "application",
          "requisition",
          "review",
          "absence",
          "survey_response",
          "learning_record",
          "mobility_event",
          "aggregate_record",
        ]),
        distinctField: shortTextSchema.optional(),
        rules: z.array(metricRuleSchema).max(100).optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("average"),
        field: shortTextSchema,
        rules: z.array(metricRuleSchema).max(100).optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("ratio"),
        numerator: metricExpressionSchema,
        denominator: metricExpressionSchema,
        multiplier: boundedNumberSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("duration"),
        startField: shortTextSchema,
        endField: shortTextSchema,
        aggregation: z.enum(["mean", "median"]),
      })
      .strict(),
  ]),
);

export const metricDefinitionSchema = z
  .object({
    id: idSchema,
    key: idSchema,
    name: shortTextSchema,
    domain: peopleDomainSchema,
    description: longTextSchema,
    numerator: metricExpressionSchema.optional(),
    denominator: metricExpressionSchema.optional(),
    formula: metricExpressionSchema,
    inclusions: z.array(metricRuleSchema).max(100),
    exclusions: z.array(metricRuleSchema).max(100),
    startEvent: shortTextSchema.optional(),
    endEvent: shortTextSchema.optional(),
    timeBasis: shortTextSchema.optional(),
    sourceFields: z.array(shortTextSchema).max(200),
    dimensions: z.array(shortTextSchema).max(100),
    status: knowledgeStatusSchema,
    confidence: confidenceLevelSchema,
    version: z.number().int().positive().max(1_000_000),
    approvedAt: shortTextSchema.optional(),
  })
  .strict() satisfies z.ZodType<MetricDefinition>;

const metricPatchItemSchema = z
  .object({
    field: z.enum([
      "numerator",
      "denominator",
      "formula",
      "inclusions",
      "exclusions",
      "timeBasis",
      "startEvent",
      "endEvent",
    ]),
    label: shortTextSchema,
    before: longTextSchema.optional(),
    after: longTextSchema,
  })
  .strict();

export const metricPatchSchema = z
  .object({
    metricId: idSchema,
    summary: longTextSchema,
    items: z.array(metricPatchItemSchema).max(30),
    nextDefinition: metricDefinitionSchema,
    status: z.enum(["Ready to apply", "Applied", "Cancelled"]),
  })
  .strict() satisfies z.ZodType<MetricPatch>;

const metricAmbiguitySchema = z
  .object({
    id: idSchema,
    metricId: idSchema,
    question: longTextSchema,
    whyItMatters: longTextSchema,
    options: z
      .array(
        z
          .object({
            id: idSchema,
            label: shortTextSchema,
            value: longTextSchema,
          })
          .strict(),
      )
      .min(2)
      .max(10),
    selectedOptionId: idSchema.optional(),
    status: z.enum(["Open", "Resolved"]),
  })
  .strict() satisfies z.ZodType<MetricAmbiguity>;

export const analysisQuestionSchema = z
  .object({
    id: idSchema,
    text: longTextSchema,
    metricIds: z.array(idSchema).max(100),
    createdAt: shortTextSchema,
  })
  .strict() satisfies z.ZodType<AnalysisQuestion>;

const analysisStepSchema = z
  .object({
    id: idSchema,
    objective: longTextSchema,
    operation: z.enum([
      "validate_trend",
      "segment",
      "compare_periods",
      "contribution",
      "association",
      "summary",
      "distribution",
      "duration",
      "funnel",
      "rate",
      "data_gap",
    ]),
    metricId: idSchema.optional(),
    dimensions: z.array(shortTextSchema).max(100).optional(),
    status: z.enum(["planned", "running", "complete", "blocked"]),
    blockedReason: longTextSchema.optional(),
  })
  .strict() satisfies z.ZodType<AnalysisStep>;

export const analysisPlanSchema = z
  .object({
    id: idSchema,
    questionId: idSchema,
    summary: longTextSchema,
    steps: z.array(analysisStepSchema).min(1).max(20),
    createdAt: shortTextSchema,
  })
  .strict() satisfies z.ZodType<AnalysisPlan>;

const suggestedFollowUpSchema = z
  .object({
    key: idSchema,
    label: shortTextSchema,
    available: z.boolean(),
    unavailableReason: longTextSchema.optional(),
  })
  .strict();

const evidenceItemSchema = z
  .object({
    id: idSchema,
    label: shortTextSchema,
    value: shortTextSchema,
    detail: longTextSchema.optional(),
    sourceDatasetIds: z.array(idSchema).max(100),
  })
  .strict();

const chartDatumSchema = z
  .object({
    label: shortTextSchema,
    value: boundedNumberSchema,
    secondaryValue: boundedNumberSchema.optional(),
    group: shortTextSchema.optional(),
  })
  .strict();

const insightChartSpecSchema = z
  .object({
    kind: z.enum(["line", "bar", "stacked-bar", "scatter", "table"]),
    title: shortTextSchema,
    xLabel: shortTextSchema.optional(),
    yLabel: shortTextSchema.optional(),
    unit: z.enum(["people", "percent", "percentage points", "days", "ratio"]),
    data: z.array(chartDatumSchema).max(500),
  })
  .strict();

export const insightSchema = z
  .object({
    id: idSchema,
    questionId: idSchema,
    branchKey: idSchema,
    headline: longTextSchema,
    finding: longTextSchema,
    metricIds: z.array(idSchema).max(100),
    filters: z.record(
      z.string().max(100),
      z.union([
        z.string().max(500),
        boundedNumberSchema,
        z.boolean(),
        z.array(z.string().max(500)).max(100),
      ]),
    ),
    period: shortTextSchema.optional(),
    comparisonPeriod: shortTextSchema.optional(),
    population: shortTextSchema,
    evidence: z.array(evidenceItemSchema).max(100),
    chartSpec: insightChartSpecSchema.optional(),
    confidence: confidenceLevelSchema,
    limitations: z.array(longTextSchema).max(30),
    suggestedFollowUps: z.array(suggestedFollowUpSchema).max(20),
    selectedForExecutiveStory: z.boolean(),
    validated: z.boolean(),
  })
  .strict() satisfies z.ZodType<Insight>;

const audienceSchema = z.enum([
  "CHRO",
  "HR Leadership Team",
  "Business Leadership",
  "TA Leadership",
  "People Analytics Leadership",
]);

const purposeSchema = z.enum([
  "Inform",
  "Diagnose",
  "Recommend action",
  "Strategy review",
]);

const datasetProfileEnvelopeSchema = z
  .object({
    datasetId: idSchema,
    profile: safeDatasetProfileSchema,
  })
  .strict();

export const semanticInterpreterInputSchema = z
  .object({
    datasets: z.array(datasetProfileEnvelopeSchema).min(1).max(100),
    businessContext: optionalLongTextSchema,
    knownMappings: z.array(fieldMappingSchema).max(2_000).default([]),
    knownRelationships: z.array(datasetRelationshipSchema).max(500).default([]),
  })
  .strict();

const datasetSemanticSchema = z
  .object({
    datasetId: idSchema,
    inferredType: shortTextSchema,
    grain: shortTextSchema,
    confidence: confidenceScoreSchema,
    rationale: longTextSchema,
  })
  .strict();

export const semanticInterpreterOutputSchema = z
  .object({
    task: z.literal("semantic_interpreter"),
    summary: longTextSchema,
    datasetSemantics: z.array(datasetSemanticSchema).max(100),
    mappingProposals: z.array(fieldMappingSchema).max(2_000),
    relationshipProposals: z.array(datasetRelationshipSchema).max(500),
    assumptions: z.array(longTextSchema).max(30),
    missingEvidence: z.array(longTextSchema).max(30),
  })
  .strict();

export const metricCodesignerInputSchema = z
  .object({
    metric: metricDefinitionSchema,
    instruction: longTextSchema,
    datasetProfiles: z.array(datasetProfileEnvelopeSchema).max(100).default([]),
  })
  .strict();

export const metricCodesignerOutputSchema = z
  .object({
    task: z.literal("metric_codesigner"),
    patch: metricPatchSchema,
    ambiguities: z.array(metricAmbiguitySchema).max(20),
    assumptions: z.array(longTextSchema).max(30),
    missingEvidence: z.array(longTextSchema).max(30),
  })
  .strict();

export const analysisPlannerInputSchema = z
  .object({
    question: analysisQuestionSchema,
    metrics: z.array(metricDefinitionSchema).min(1).max(100),
    datasetProfiles: z.array(datasetProfileEnvelopeSchema).max(100).default([]),
    businessContext: optionalLongTextSchema,
  })
  .strict();

export const analysisPlannerOutputSchema = z
  .object({
    task: z.literal("analysis_planner"),
    plan: analysisPlanSchema,
    assumptions: z.array(longTextSchema).max(30),
    missingEvidence: z.array(longTextSchema).max(30),
  })
  .strict();

export const aggregatedResultSchema = z
  .object({
    id: idSchema,
    label: shortTextSchema,
    metricId: idSchema.optional(),
    value: boundedNumberSchema,
    unit: z.enum(["people", "percent", "percentage points", "days", "ratio"]),
    period: shortTextSchema.optional(),
    comparisonValue: boundedNumberSchema.optional(),
    comparisonPeriod: shortTextSchema.optional(),
    population: shortTextSchema.optional(),
    dimensions: z
      .record(
        z.string().max(100),
        z.union([z.string().max(500), boundedNumberSchema, z.boolean()]),
      )
      .default({}),
    sampleSize: z.number().int().nonnegative().optional(),
    sourceDatasetIds: z.array(idSchema).max(100),
  })
  .strict();

export const insightInterpreterInputSchema = z
  .object({
    question: analysisQuestionSchema,
    metrics: z.array(metricDefinitionSchema).min(1).max(100),
    plan: analysisPlanSchema.optional(),
    aggregatedResults: z.array(aggregatedResultSchema).min(1).max(500),
  })
  .strict();

export type InsightInterpretation = Pick<
  Insight,
  "headline" | "finding" | "confidence" | "limitations" | "suggestedFollowUps"
>;

const insightInterpretationSchema = z
  .object({
    headline: longTextSchema,
    finding: longTextSchema,
    confidence: confidenceLevelSchema,
    limitations: z.array(longTextSchema).max(30),
    suggestedFollowUps: z.array(suggestedFollowUpSchema).max(20),
  })
  .strict() satisfies z.ZodType<InsightInterpretation>;

export const insightInterpreterOutputSchema = z
  .object({
    task: z.literal("insight_interpreter"),
    interpretation: insightInterpretationSchema,
    evidenceResultIds: z.array(idSchema).min(1).max(100),
    assumptions: z.array(longTextSchema).max(30),
    missingEvidence: z.array(longTextSchema).max(30),
  })
  .strict();

export type StoryOutlineSlide = Pick<
  ExecutiveSlide,
  | "index"
  | "kicker"
  | "headline"
  | "insightIds"
  | "evidence"
  | "sourceNote"
  | "limitation"
>;

const storyOutlineSlideSchema = z
  .object({
    index: z.number().int().nonnegative().max(10),
    kicker: shortTextSchema,
    headline: longTextSchema,
    insightIds: z.array(idSchema).min(1).max(100),
    evidence: z.array(longTextSchema).max(30),
    sourceNote: longTextSchema,
    limitation: longTextSchema.optional(),
  })
  .strict() satisfies z.ZodType<StoryOutlineSlide>;

export interface StoryOutline
  extends Pick<ExecutiveStory, "audience" | "purpose" | "slideCount"> {
  workspaceId: string;
  slides: StoryOutlineSlide[];
}

const storyOutlineSchema = z
  .object({
    workspaceId: idSchema,
    audience: audienceSchema,
    purpose: purposeSchema,
    slideCount: z.union([z.literal(3), z.literal(5)]),
    slides: z.array(storyOutlineSlideSchema).min(1).max(5),
  })
  .strict() satisfies z.ZodType<StoryOutline>;

export const executiveStorytellerInputSchema = z
  .object({
    workspaceId: idSchema,
    audience: audienceSchema,
    purpose: purposeSchema,
    slideCount: z.union([z.literal(3), z.literal(5)]),
    insights: z.array(insightSchema).min(1).max(50),
  })
  .strict();

export const executiveStorytellerOutputSchema = z
  .object({
    task: z.literal("executive_storyteller"),
    outline: storyOutlineSchema,
    assumptions: z.array(longTextSchema).max(30),
    missingEvidence: z.array(longTextSchema).max(30),
  })
  .strict();

export const workbenchAIRequestSchema = z.discriminatedUnion("task", [
  z
    .object({
      task: z.literal("semantic_interpreter"),
      input: semanticInterpreterInputSchema,
    })
    .strict(),
  z
    .object({
      task: z.literal("metric_codesigner"),
      input: metricCodesignerInputSchema,
    })
    .strict(),
  z
    .object({
      task: z.literal("analysis_planner"),
      input: analysisPlannerInputSchema,
    })
    .strict(),
  z
    .object({
      task: z.literal("insight_interpreter"),
      input: insightInterpreterInputSchema,
    })
    .strict(),
  z
    .object({
      task: z.literal("executive_storyteller"),
      input: executiveStorytellerInputSchema,
    })
    .strict(),
]);

export const workbenchAITaskSchemas = {
  semantic_interpreter: {
    input: semanticInterpreterInputSchema,
    output: semanticInterpreterOutputSchema,
  },
  metric_codesigner: {
    input: metricCodesignerInputSchema,
    output: metricCodesignerOutputSchema,
  },
  analysis_planner: {
    input: analysisPlannerInputSchema,
    output: analysisPlannerOutputSchema,
  },
  insight_interpreter: {
    input: insightInterpreterInputSchema,
    output: insightInterpreterOutputSchema,
  },
  executive_storyteller: {
    input: executiveStorytellerInputSchema,
    output: executiveStorytellerOutputSchema,
  },
} as const;

export type WorkbenchAIRequest = z.infer<typeof workbenchAIRequestSchema>;
export type WorkbenchAITaskName = WorkbenchAIRequest["task"];
export type SemanticInterpreterInput = z.infer<typeof semanticInterpreterInputSchema>;
export type SemanticInterpreterOutput = z.infer<typeof semanticInterpreterOutputSchema>;
export type MetricCodesignerInput = z.infer<typeof metricCodesignerInputSchema>;
export type MetricCodesignerOutput = z.infer<typeof metricCodesignerOutputSchema>;
export type AnalysisPlannerInput = z.infer<typeof analysisPlannerInputSchema>;
export type AnalysisPlannerOutput = z.infer<typeof analysisPlannerOutputSchema>;
export type AggregatedResult = z.infer<typeof aggregatedResultSchema>;
export type InsightInterpreterInput = z.infer<typeof insightInterpreterInputSchema>;
export type InsightInterpreterOutput = z.infer<typeof insightInterpreterOutputSchema>;
export type ExecutiveStorytellerInput = z.infer<typeof executiveStorytellerInputSchema>;
export type ExecutiveStorytellerOutput = z.infer<typeof executiveStorytellerOutputSchema>;
export type WorkbenchAIOutput =
  | SemanticInterpreterOutput
  | MetricCodesignerOutput
  | AnalysisPlannerOutput
  | InsightInterpreterOutput
  | ExecutiveStorytellerOutput;
