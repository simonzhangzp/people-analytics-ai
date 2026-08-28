import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DeepSeekProvider } from "./provider";
import {
  analysisPlannerInputSchema,
  executiveStorytellerInputSchema,
  insightInterpreterInputSchema,
  insightSchema,
  metricCodesignerInputSchema,
  metricCodesignerOutputSchema,
  metricDefinitionSchema,
  semanticInterpreterInputSchema,
  semanticInterpreterOutputSchema,
  workbenchAIRequestSchema,
} from "./schemas";
import {
  deterministicAnalysisFallback,
  deterministicInsightFallback,
  deterministicSemanticFallback,
  deterministicStoryFallback,
  executeWorkbenchAITask,
} from "./tasks";

const metric = metricDefinitionSchema.parse({
  id: "headcount",
  key: "headcount",
  name: "Headcount",
  domain: "other",
  description: "Distinct active employees at the end of a reporting period.",
  formula: {
    kind: "count",
    entity: "employee",
    distinctField: "employee_id",
  },
  inclusions: [],
  exclusions: [],
  timeBasis: "period end",
  sourceFields: ["employee_id", "snapshot_date"],
  dimensions: ["organization"],
  status: "Needs Review",
  confidence: "Medium",
  version: 1,
});

const semanticInput = semanticInterpreterInputSchema.parse({
  datasets: [
    {
      datasetId: "dataset-1",
      profile: {
        fileName: "workforce.csv",
        rowCount: 1_200,
        columnCount: 2,
        inferredType: "workforce_snapshot",
        grain: "employee-month",
        grainConfidence: 0.9,
        timeRange: "2025-01 to 2025-12",
        columns: [
          {
            sourceName: "employee_id",
            inferredType: "string",
            nullPct: 0,
            distinctPct: 90,
            likelyPII: true,
            canonicalField: "employee_id",
            semanticMeaning: "Stable employee identifier",
            confidence: 0.9,
          },
          {
            sourceName: "snapshot_date",
            inferredType: "date",
            nullPct: 0,
            distinctPct: 1,
            likelyPII: false,
            canonicalField: "snapshot_date",
            semanticMeaning: "Month-end snapshot date",
            confidence: 0.95,
          },
        ],
      },
    },
  ],
});

const question = {
  id: "question-1",
  text: "How did headcount change over time?",
  metricIds: ["headcount"],
  createdAt: "2026-08-27T00:00:00.000Z",
};

const insight = insightSchema.parse({
  id: "insight-1",
  questionId: question.id,
  branchKey: "trend",
  headline: "Headcount was 1,200",
  finding: "The supplied period-end aggregate reports 1,200 people.",
  metricIds: ["headcount"],
  filters: {},
  period: "2025-12",
  population: "Active employees",
  evidence: [
    {
      id: "evidence-1",
      label: "Period-end headcount",
      value: "1,200",
      sourceDatasetIds: ["dataset-1"],
    },
  ],
  confidence: "Medium",
  limitations: ["No prior period was supplied."],
  suggestedFollowUps: [],
  selectedForExecutiveStory: true,
  validated: true,
});

describe("typed Workbench AI tasks", () => {
  it("uses a strict discriminated request schema", () => {
    const valid = workbenchAIRequestSchema.safeParse({
      task: "metric_codesigner",
      input: {
        metric,
        instruction: "Use period-end active employees.",
      },
    });
    expect(valid.success).toBe(true);

    const extraField = workbenchAIRequestSchema.safeParse({
      task: "metric_codesigner",
      input: {
        metric,
        instruction: "Use period-end active employees.",
        sql: "select * from employees",
      },
    });
    expect(extraField.success).toBe(false);
  });

  it("can publish the recursive metric patch contract as JSON Schema", () => {
    expect(() => z.toJSONSchema(metricCodesignerOutputSchema)).not.toThrow();
  });

  it("returns a clearly labelled deterministic metric fallback", async () => {
    const input = metricCodesignerInputSchema.parse({
      metric,
      instruction: "Count only active employees at period end.",
    });
    const result = await executeWorkbenchAITask(
      { task: "metric_codesigner", input },
      new DeepSeekProvider(),
    );

    expect(result.source).toBe("deterministic");
    expect(result.warning?.code).toBe("not_configured");
    expect(result.data.task).toBe("metric_codesigner");
    if (result.data.task !== "metric_codesigner") {
      throw new Error("Unexpected fallback task.");
    }
    expect(result.data.patch.status).toBe("Cancelled");
    expect(result.data.patch.items).toEqual([]);
  });

  it("falls back when DeepSeek JSON fails the strict output schema", async () => {
    const fetchImplementation: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  task: "semantic_interpreter",
                  summary: "Missing all required structured fields",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      fetchImplementation,
    });

    const result = await executeWorkbenchAITask(
      { task: "semantic_interpreter", input: semanticInput },
      provider,
    );

    expect(result.source).toBe("deterministic");
    expect(result.warning?.code).toBe("schema_validation_failed");
    expect(result.data.task).toBe("semantic_interpreter");
  });

  it("rejects executable SQL even when it appears in an allowed text field", async () => {
    const unsafeOutput = {
      ...deterministicSemanticFallback(semanticInput),
      summary: "Run SELECT employee_id FROM employees to complete the mapping.",
    };
    const fetchImplementation: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(unsafeOutput) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      fetchImplementation,
    });

    const result = await executeWorkbenchAITask(
      { task: "semantic_interpreter", input: semanticInput },
      provider,
    );

    expect(result.source).toBe("deterministic");
    expect(result.warning?.code).toBe("unsafe_model_output");
  });

  it("requests low-temperature JSON-only generation", async () => {
    const expected = deterministicSemanticFallback(semanticInput);
    let requestBody: Record<string, unknown> | undefined;
    const fetchImplementation: typeof fetch = async (_request, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(expected) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      fetchImplementation,
    });

    const output = await provider.generateStructured({
      schema: semanticInterpreterOutputSchema,
      schemaName: "semantic_interpreter",
      systemPrompt: "Return semantic proposals.",
      input: semanticInput,
    });

    expect(output).toEqual(expected);
    expect(requestBody?.temperature).toBe(0.1);
    expect(requestBody?.response_format).toEqual({ type: "json_object" });
  });

  it("keeps every deterministic task output inside its Zod contract", () => {
    const analysisInput = analysisPlannerInputSchema.parse({
      question,
      metrics: [metric],
      datasetProfiles: semanticInput.datasets,
    });
    const insightInput = insightInterpreterInputSchema.parse({
      question,
      metrics: [metric],
      aggregatedResults: [
        {
          id: "aggregate-1",
          label: "Headcount",
          metricId: metric.id,
          value: 1_200,
          unit: "people",
          period: "2025-12",
          sampleSize: 1_200,
          sourceDatasetIds: ["dataset-1"],
        },
      ],
    });
    const storyInput = executiveStorytellerInputSchema.parse({
      workspaceId: "workspace-1",
      audience: "CHRO",
      purpose: "Inform",
      slideCount: 3,
      insights: [insight],
    });

    expect(deterministicSemanticFallback(semanticInput).task).toBe(
      "semantic_interpreter",
    );
    expect(deterministicAnalysisFallback(analysisInput).plan.steps.length).toBeGreaterThan(
      0,
    );
    expect(deterministicInsightFallback(insightInput).evidenceResultIds).toEqual([
      "aggregate-1",
    ]);
    expect(deterministicStoryFallback(storyInput).outline.slides).toHaveLength(3);
  });
});
