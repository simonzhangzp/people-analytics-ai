"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DEMO_QUESTION, loadWorkbenchDemoFiles } from "@/lib/demo/workbench-demo";
import { ingestWithLegacyProfiler } from "@/lib/workbench/legacy-adapter";
import {
  createDemoInsight,
  createInitialInterventions,
  createRetirementAmbiguity,
  createRetirementMetricPatch,
  createVoluntaryAttritionMetric,
} from "@/lib/workbench/fallbacks";
import { createAttritionAnalysisPlan } from "@/lib/analysis";
import { applyMetricDefinitionPatch } from "@/lib/metrics";
import type {
  AIIntervention,
  ExecutiveStory,
  Insight,
  MetricDefinition,
  MetricPatch,
  WorkbenchState,
  WorkbenchView,
} from "@/types/workbench";

interface StoredWorkbenchState {
  workspaceName: string;
  datasetMetadata: WorkbenchState["datasets"][number]["metadata"][];
  fieldMappings: WorkbenchState["fieldMappings"];
  relationships: WorkbenchState["relationships"];
  question: WorkbenchState["question"];
  metrics: WorkbenchState["metrics"];
  activeMetricId: string | null;
  insights: WorkbenchState["insights"];
  story: WorkbenchState["story"];
  progress: WorkbenchState["progress"];
}

interface WorkbenchContextValue {
  state: WorkbenchState;
  activeDatasetId?: string;
  draftQuestion: string;
  processing: boolean;
  processingMessage?: string;
  busy: boolean;
  error?: string;
  setDraftQuestion: (value: string) => void;
  setActiveDatasetId: (value: string) => void;
  setActiveView: (view: WorkbenchView) => void;
  addFiles: (files: File[]) => Promise<void>;
  askQuestion: () => Promise<void>;
  resolveAmbiguity: (optionId: string) => void;
  requestMetricPatch: (instruction: string) => Promise<void>;
  applyMetricPatch: () => Promise<void>;
  cancelMetricPatch: () => void;
  runAnalysis: () => Promise<void>;
  runBranch: (branch: Insight["branchKey"]) => Promise<void>;
  toggleInsightStory: (insightId: string) => void;
  buildStory: (
    audience: ExecutiveStory["audience"],
    purpose: ExecutiveStory["purpose"],
    slideCount: 3 | 5,
  ) => Promise<void>;
  exportStory: () => Promise<void>;
  submitCoDesignerContext: (text: string) => Promise<void>;
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

function initialState(workspaceId: string): WorkbenchState {
  const demo = workspaceId === "demo";
  return {
    workspaceId,
    workspaceName: demo
      ? "Engineering Voluntary Attrition"
      : "Untitled People Analytics Workspace",
    activeView: "data",
    datasets: [],
    fieldMappings: [],
    relationships: [],
    question: null,
    metrics: [],
    activeMetricId: null,
    ambiguity: null,
    pendingMetricPatch: null,
    analysisPlan: null,
    insights: [],
    story: null,
    interventions: createInitialInterventions(demo),
    progress: {
      data: demo ? "In progress" : "Not started",
      metrics: "Not started",
      analysis: "Not started",
      story: "Not started",
    },
    engineStatus: "idle",
    persistenceStatus: "local-only",
  };
}

function safeStoredState(state: WorkbenchState): StoredWorkbenchState {
  return {
    workspaceName: state.workspaceName,
    datasetMetadata: state.datasets.map(({ metadata }) => metadata),
    fieldMappings: state.fieldMappings,
    relationships: state.relationships,
    question: state.question,
    metrics: state.metrics,
    activeMetricId: state.activeMetricId,
    insights: state.insights,
    story: state.story,
    progress: state.progress,
  };
}

function intervention(
  kind: AIIntervention["kind"],
  title: string,
  body: string,
  rationale?: string,
): AIIntervention {
  return {
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    title,
    body,
    rationale,
    createdAt: new Date().toISOString(),
  };
}

async function safeAIRequest(task: string, input: unknown) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    try {
      const { ensureAnonymousSession, getSupabaseBrowserClient } = await import(
        "@/lib/supabase"
      );
      const client = getSupabaseBrowserClient();
      if (client) {
        const session = await ensureAnonymousSession(client);
        headers.authorization = `Bearer ${session.access_token}`;
      }
    } catch {
      // The API route will force a visibly deterministic response when a live
      // provider is not protected by an authenticated quota.
    }
    const response = await fetch("/api/workbench/ai", {
      method: "POST",
      headers,
      body: JSON.stringify({ task, input }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as {
      source?: "deepseek" | "deterministic";
      data?: unknown;
      warning?: { code?: string; message?: string };
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function WorkbenchProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: React.ReactNode;
}) {
  const isDemo = workspaceId === "demo";
  const [state, setState] = useState<WorkbenchState>(() => initialState(workspaceId));
  const [activeDatasetId, setActiveDatasetId] = useState<string>();
  const [draftQuestion, setDraftQuestion] = useState(isDemo ? DEMO_QUESTION : "");
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const demoStarted = useRef(false);
  const hydrated = useRef(false);
  const calculatedInsights = useRef<Insight[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  const appendIntervention = useCallback((item: AIIntervention) => {
    setState((current) => ({
      ...current,
      interventions: [item, ...current.interventions].slice(0, 12),
    }));
  }, []);

  useEffect(() => {
    if (workspaceId === "new" || workspaceId === "demo" || hydrated.current) return;
    hydrated.current = true;
    let timer: number | undefined;
    try {
      const saved = window.localStorage.getItem(`people-workbench:${workspaceId}`);
      if (!saved) return;
      const parsed = JSON.parse(saved) as StoredWorkbenchState;
      timer = window.setTimeout(() => {
        setState((current) => ({
          ...current,
          workspaceName: parsed.workspaceName,
          datasets: parsed.datasetMetadata.map((metadata) => ({
            metadata,
            explorationRows: [],
          })),
          fieldMappings: parsed.fieldMappings,
          relationships: parsed.relationships,
          question: parsed.question,
          metrics: parsed.metrics,
          activeMetricId: parsed.activeMetricId,
          insights: parsed.insights,
          story: parsed.story,
          progress: {
            ...parsed.progress,
            data: parsed.datasetMetadata.length
              ? "Needs input"
              : parsed.progress.data,
            analysis: parsed.insights.length ? "Ready" : parsed.progress.analysis,
          },
          interventions: [
            intervention(
              "Needs confirmation",
              "Reattach local files to recalculate",
              "Safe metadata and approved knowledge were restored. Raw rows were not persisted, so analysis execution remains unavailable until the source files are attached again.",
            ),
            ...current.interventions,
          ],
        }));
        setDraftQuestion(parsed.question?.text ?? "");
        setActiveDatasetId(parsed.datasetMetadata[0]?.id);
      }, 0);
    } catch {
      window.localStorage.removeItem(`people-workbench:${workspaceId}`);
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [workspaceId]);

  useEffect(() => {
    if (
      workspaceId === "new" ||
      workspaceId === "demo" ||
      !hydrated.current ||
      state.datasets.length === 0
    ) {
      return;
    }
    window.localStorage.setItem(
      `people-workbench:${workspaceId}`,
      JSON.stringify(safeStoredState(state)),
    );
  }, [state, workspaceId]);

  const persistenceSignature = useMemo(
    () => JSON.stringify(safeStoredState(state)),
    [state],
  );

  useEffect(() => {
    if (workspaceId === "new" || stateRef.current.datasets.length === 0) return;
    const timer = window.setTimeout(async () => {
      setState((current) => ({ ...current, persistenceStatus: "syncing" }));
      try {
        const runtime = await import("@/lib/workbench/runtime");
        const status = await runtime.persistWorkbenchState(stateRef.current);
        setState((current) => ({
          ...current,
          persistenceStatus: status === "synced" ? "synced" : "local-only",
        }));
      } catch {
        setState((current) => ({
          ...current,
          persistenceStatus: "unavailable",
        }));
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [persistenceSignature, workspaceId]);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setProcessing(true);
      setError(undefined);
      setProcessingMessage("Reading files and starting local SQL…");
      setState((current) => ({
        ...current,
        engineStatus: "loading",
        progress: { ...current.progress, data: "In progress" },
      }));
      try {
        let result: Awaited<ReturnType<typeof ingestWithLegacyProfiler>>;
        try {
          const runtime = await import("@/lib/workbench/runtime");
          result = await runtime.ingestWorkbenchFiles(files);
        } catch {
          // The fallback parser preserves the experience if WebAssembly cannot
          // initialize. It is bounded and cannot be used to imply a full result.
          result = await ingestWithLegacyProfiler(files);
          appendIntervention(
            intervention(
              "Warning",
              "Local SQL used a compatibility parser",
              "DuckDB-Wasm was unavailable, so file understanding used the bounded compatibility profiler. Reattach the files in a modern browser before treating a calculation as complete.",
            ),
          );
        }

        const idMap = new Map<string, string>();
        if (isDemo) {
          for (const dataset of result.datasets) {
            const name = dataset.metadata.name.toLowerCase();
            const nextId = name.includes("headcount")
              ? "demo-headcount"
              : name.includes("termination")
                ? "demo-terminations"
                : name.includes("compensation")
                  ? "demo-compensation"
                  : dataset.metadata.id;
            idMap.set(dataset.metadata.id, nextId);
          }
        }
        const datasets = result.datasets.map((dataset) => ({
          ...dataset,
          metadata: {
            ...dataset.metadata,
            id: idMap.get(dataset.metadata.id) ?? dataset.metadata.id,
          },
        }));
        const mappings = result.mappings.map((mapping) => ({
          ...mapping,
          datasetId: idMap.get(mapping.datasetId) ?? mapping.datasetId,
        }));
        const relationships = result.relationships.map((relationship) => ({
          ...relationship,
          fromDatasetId:
            idMap.get(relationship.fromDatasetId) ?? relationship.fromDatasetId,
          toDatasetId:
            idMap.get(relationship.toDatasetId) ?? relationship.toDatasetId,
        }));
        setActiveDatasetId(datasets[0]?.metadata.id);
        setProcessingMessage("Confirming relationships and answerability…");
        setState((current) => ({
          ...current,
          datasets,
          fieldMappings: mappings,
          relationships,
          engineStatus: "ready",
          progress: { ...current.progress, data: "Ready" },
          interventions: [
            intervention(
              "Proposal",
              `${datasets.length} People datasets understood`,
              `${datasets
                .map(
                  ({ metadata }) =>
                    `${metadata.inferredType} at ${metadata.grain.label} grain`,
                )
                .join("; ")}. ${relationships.length} relationship${
                relationships.length === 1 ? "" : "s"
              } can support the question.`,
            ),
            ...current.interventions,
          ],
        }));
        void safeAIRequest("semantic_interpreter", {
          datasets: datasets.map(({ metadata }) => ({
            datasetId: metadata.id,
            profile: metadata.safeProfile,
          })),
          businessContext: draftQuestion || undefined,
          knownMappings: mappings,
          knownRelationships: relationships,
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not profile the files.");
        setState((current) => ({
          ...current,
          engineStatus: "error",
          progress: { ...current.progress, data: "Needs input" },
        }));
      } finally {
        setProcessing(false);
        setProcessingMessage(undefined);
      }
    },
    [appendIntervention, draftQuestion, isDemo],
  );

  useEffect(() => {
    if (!isDemo || demoStarted.current) return;
    demoStarted.current = true;
    void loadWorkbenchDemoFiles().then(addFiles);
  }, [addFiles, isDemo]);

  const askQuestion = useCallback(async () => {
    const text = draftQuestion.trim();
    if (!text || state.datasets.length === 0) return;
    setBusy(true);
    const question = {
      id: `question-${Date.now()}`,
      text,
      metricIds: ["metric-voluntary-attrition"],
      createdAt: new Date().toISOString(),
    };
    const metric = createVoluntaryAttritionMetric();
    const ambiguity = createRetirementAmbiguity(metric.id);
    setState((current) => ({
      ...current,
      activeView: "metrics",
      question,
      metrics: [metric],
      activeMetricId: metric.id,
      ambiguity,
      pendingMetricPatch: null,
      analysisPlan: null,
      insights: [],
      story: null,
      progress: {
        ...current.progress,
        metrics: "Needs input",
        analysis: "Not started",
        story: "Not started",
      },
      interventions: [
        intervention(
          "Needs confirmation",
          "Retirement changes the meaning of voluntary attrition",
          "I propose Voluntary Attrition Rate, but the source distinguishes retirement from resignation. Confirm this treatment before calculation.",
          "Combining retirement with potentially preventable resignation can lead to a different leadership action.",
        ),
        ...current.interventions,
      ],
    }));
    const aiResult = await safeAIRequest("metric_codesigner", {
      metric,
      instruction: `Propose the metric for this question and surface only material ambiguities: ${text}`,
      datasetProfiles: state.datasets.map(({ metadata }) => ({
        datasetId: metadata.id,
        profile: metadata.safeProfile,
      })),
    });
    if (aiResult?.source === "deterministic") {
      appendIntervention(
        intervention(
          "Warning",
          "Deterministic AI fallback is active",
          aiResult.warning?.message ??
            "DeepSeek is unavailable or not configured. The visible metric proposal comes from the typed local fallback.",
        ),
      );
    }
    setBusy(false);
  }, [appendIntervention, draftQuestion, state.datasets]);

  const resolveAmbiguity = useCallback((optionId: string) => {
    setState((current) => {
      const metric = current.metrics.find(
        (item) => item.id === current.activeMetricId,
      );
      if (!metric || !current.ambiguity) return current;
      if (optionId === "separate-retirement") {
        return {
          ...current,
          ambiguity: {
            ...current.ambiguity,
            selectedOptionId: optionId,
            status: "Resolved",
          },
          pendingMetricPatch: createRetirementMetricPatch(metric),
        };
      }
      const approved: MetricDefinition = {
        ...metric,
        status: "Approved",
        confidence: "High",
        version: metric.version + 1,
        approvedAt: new Date().toISOString(),
      };
      return {
        ...current,
        metrics: current.metrics.map((item) =>
          item.id === metric.id ? approved : item,
        ),
        ambiguity: null,
        progress: { ...current.progress, metrics: "Ready" },
        interventions: [
          intervention(
            "Applied",
            "Retirement included in voluntary attrition",
            "The organizational definition was approved and versioned. Reopen the metric if this convention changes.",
          ),
          ...current.interventions,
        ],
      };
    });
  }, []);

  const requestMetricPatch = useCallback(
    async (instruction: string) => {
      const metric = state.metrics.find((item) => item.id === state.activeMetricId);
      if (!metric) return;
      setBusy(true);
      const aiResult = await safeAIRequest("metric_codesigner", {
        metric,
        instruction,
        datasetProfiles: state.datasets.map(({ metadata }) => ({
          datasetId: metadata.id,
          profile: metadata.safeProfile,
        })),
      });
      const livePatch =
        aiResult?.source === "deepseek" &&
        aiResult.data &&
        typeof aiResult.data === "object" &&
        "patch" in aiResult.data
          ? ((aiResult.data as { patch: MetricPatch }).patch)
          : null;
      const nextPatch =
        livePatch?.items.length
          ? livePatch
          : createRetirementMetricPatch(metric, instruction);
      setState((current) => ({
        ...current,
        pendingMetricPatch: nextPatch,
        interventions: [
          intervention(
            "Proposal",
            "Two semantic changes are ready for review",
            "Retirement moves to a separately reported exclusion and the denominator uses beginning headcount. Nothing changes until you apply the diff.",
          ),
          ...current.interventions,
        ],
      }));
      setBusy(false);
    },
    [state.activeMetricId, state.datasets, state.metrics],
  );

  const applyMetricPatch = useCallback(async () => {
    const patch = state.pendingMetricPatch;
    const question = state.question;
    if (!patch || !question) return;
    const approvedDefinition = applyMetricDefinitionPatch(patch);
    const availableFields = state.fieldMappings.flatMap((mapping) =>
      mapping.canonicalField
        ? [mapping.sourceColumn, mapping.canonicalField]
        : [mapping.sourceColumn],
    );
    setState((current) => ({
      ...current,
      metrics: current.metrics.map((metric) =>
        metric.id === patch.metricId ? approvedDefinition : metric,
      ),
      ambiguity: null,
      pendingMetricPatch: null,
      analysisPlan: createAttritionAnalysisPlan(question, {
        metricId: patch.metricId,
        availableFields,
      }),
      progress: {
        ...current.progress,
        metrics: "Ready",
        analysis: "In progress",
      },
      interventions: [
        intervention(
          "Applied",
          `${approvedDefinition.name} v${approvedDefinition.version} approved`,
          "The definition is versioned and the deterministic analysis plan now uses it.",
        ),
        ...current.interventions,
      ],
    }));
    const runtime = await import("@/lib/workbench/runtime").catch(() => null);
    if (runtime) {
      await runtime.persistApprovedMetric(
        state.workspaceId,
        approvedDefinition,
      );
    }
    void safeAIRequest("analysis_planner", {
      question,
      metrics: [approvedDefinition],
      datasetProfiles: state.datasets.map(({ metadata }) => ({
        datasetId: metadata.id,
        profile: metadata.safeProfile,
      })),
      businessContext:
        "Validate the Engineering attrition change before following tenure, level, compensation, and manager evidence.",
    });
  }, [
    state.datasets,
    state.fieldMappings,
    state.pendingMetricPatch,
    state.question,
    state.workspaceId,
  ]);

  const cancelMetricPatch = useCallback(() => {
    setState((current) => ({ ...current, pendingMetricPatch: null }));
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!state.question || !state.activeMetricId || !state.analysisPlan) return;
    setBusy(true);
    try {
      const runtime = await import("@/lib/workbench/runtime").catch(() => null);
      if (!runtime) {
        throw new Error("The local attrition runtime is unavailable.");
      }
      const result = await runtime.executeWorkbenchAnalysis({
        question: state.question,
        metric: state.metrics.find(
          (item) => item.id === state.activeMetricId,
        )!,
        datasets: state.datasets,
        plan: state.analysisPlan,
      });
      calculatedInsights.current = result.insights;
      const trend =
        result.insights.find(
          (insight) => insight.branchKey === "trend" && insight.validated,
        ) ?? result.insights.find((insight) => insight.validated);
      if (!trend) {
        throw new Error(
          "The attached datasets did not produce a validated attrition trend.",
        );
      }
      setState((current) => ({
        ...current,
        insights: [trend],
        analysisPlan: {
          ...result.plan,
          steps: result.plan.steps.map((step) =>
            step.operation === "validate_trend"
              ? { ...step, status: "complete" }
              : step.operation === "data_gap"
                ? step
                : { ...step, status: "planned" },
          ),
        },
        progress: { ...current.progress, analysis: "Ready" },
        interventions: [
          intervention(
            "Recommendation",
            "The increase is validated; locate its concentration next",
            `${trend.headline}. Segment contribution is the next defensible step before proposing a cause.`,
          ),
          ...current.interventions,
        ],
      }));
      const currentRate = Number.parseFloat(
        trend.evidence.find((item) => /current/i.test(item.label))?.value ?? "",
      );
      const comparisonRate = Number.parseFloat(
        trend.evidence.find((item) => /comparison/i.test(item.label))?.value ?? "",
      );
      if (Number.isFinite(currentRate)) {
        void safeAIRequest("insight_interpreter", {
          question: state.question,
          metrics: state.metrics.filter(
            (metric) => metric.id === state.activeMetricId,
          ),
          plan: result.plan,
          aggregatedResults: [
            {
              id: "attrition-trend-rate",
              label: "Engineering voluntary attrition",
              metricId: state.activeMetricId,
              value: currentRate,
              unit: "percent",
              period: trend.period,
              comparisonValue: Number.isFinite(comparisonRate)
                ? comparisonRate
                : undefined,
              comparisonPeriod: trend.comparisonPeriod,
              population: trend.population,
              dimensions: { department: "Engineering" },
              sourceDatasetIds: state.datasets.map(
                ({ metadata }) => metadata.id,
              ),
            },
          ],
        });
      }
    } catch (cause) {
      if (isDemo) {
        const trend = createDemoInsight(
          "trend",
          state.question.id,
          state.activeMetricId,
        );
        calculatedInsights.current = [
          trend,
          createDemoInsight("tenure", state.question.id, state.activeMetricId),
          createDemoInsight("level", state.question.id, state.activeMetricId),
          createDemoInsight(
            "compensation",
            state.question.id,
            state.activeMetricId,
          ),
        ];
        setState((current) => ({
          ...current,
          insights: [trend],
          analysisPlan: current.analysisPlan
            ? {
                ...current.analysisPlan,
                steps: current.analysisPlan.steps.map((step) =>
                  step.operation === "validate_trend"
                    ? { ...step, status: "complete" }
                    : step,
                ),
              }
            : current.analysisPlan,
          progress: { ...current.progress, analysis: "Ready" },
          interventions: [
            intervention(
              "Warning",
              "Guided demo aggregate fallback used",
              cause instanceof Error
                ? `${cause.message} The displayed demo evidence comes from the versioned synthetic fixture aggregates.`
                : "The displayed demo evidence comes from the versioned synthetic fixture aggregates.",
            ),
            ...current.interventions,
          ],
        }));
      } else {
        appendIntervention(
          intervention(
            "Data gap",
            "No supported attrition execution path for these fields",
            cause instanceof Error
              ? cause.message
              : "Confirm employee snapshot, termination classification, and comparable period fields before running.",
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }, [
    appendIntervention,
    isDemo,
    state.activeMetricId,
    state.analysisPlan,
    state.datasets,
    state.metrics,
    state.question,
  ]);

  const runBranch = useCallback(
    async (branch: Insight["branchKey"]) => {
      if (!state.question || !state.activeMetricId || branch === "trend") return;
      if (branch === "organization") {
        appendIntervention(
          intervention(
            "Data gap",
            "Manager effectiveness cannot be tested",
            "No manager effectiveness, team climate, or manager quality measure exists in the attached data. The hypothesis remains unknown.",
          ),
        );
        return;
      }
      setBusy(true);
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      const next =
        calculatedInsights.current.find(
          (insight) => insight.branchKey === branch && insight.validated,
        ) ??
        (isDemo
          ? createDemoInsight(branch, state.question.id, state.activeMetricId)
          : undefined);
      if (!next) {
        appendIntervention(
          intervention(
            "Data gap",
            `${branch} analysis is not available`,
            "The approved local evidence does not contain the fields required for this branch.",
          ),
        );
        setBusy(false);
        return;
      }
      setState((current) => ({
        ...current,
        insights: current.insights.some((item) => item.id === next.id)
          ? current.insights
          : [...current.insights, next],
        analysisPlan: current.analysisPlan
          ? {
              ...current.analysisPlan,
              steps: current.analysisPlan.steps.map((step) => {
                const matches =
                  (branch === "tenure" &&
                    step.dimensions?.includes("tenure_band")) ||
                  (branch === "level" &&
                    (step.dimensions?.includes("level") ||
                      step.dimensions?.includes("seniority_level"))) ||
                  (branch === "compensation" &&
                    step.operation === "association");
                return matches ? { ...step, status: "complete" } : step;
              }),
            }
          : current.analysisPlan,
        interventions: [
          ...(branch === "compensation"
            ? [
                intervention(
                  "Data gap",
                  "Manager effectiveness cannot be tested",
                  "Manager effectiveness data is absent. Compensation positioning is associated with exits, but it is not a causal conclusion.",
                ),
              ]
            : []),
          intervention(
            "Recommendation",
            next.headline,
            next.limitations[0],
          ),
          ...current.interventions,
        ],
      }));
      setBusy(false);
    },
    [appendIntervention, isDemo, state.activeMetricId, state.question],
  );

  const toggleInsightStory = useCallback((insightId: string) => {
    setState((current) => {
      const insights = current.insights.map((insight) =>
        insight.id === insightId
          ? {
              ...insight,
              selectedForExecutiveStory: !insight.selectedForExecutiveStory,
            }
          : insight,
      );
      return {
        ...current,
        insights,
        story: null,
        progress: {
          ...current.progress,
          story: insights.some((item) => item.selectedForExecutiveStory)
            ? "In progress"
            : "Not started",
        },
      };
    });
  }, []);

  const buildStory = useCallback(
    async (
      audience: ExecutiveStory["audience"],
      purpose: ExecutiveStory["purpose"],
      slideCount: 3 | 5,
    ) => {
      setBusy(true);
      await safeAIRequest("executive_storyteller", {
        workspaceId: state.workspaceId,
        audience,
        purpose,
        slideCount,
        insights: state.insights
          .filter(
            (item) => item.validated && item.selectedForExecutiveStory,
          )
          .map((item) => item),
      });
      const runtime = await import("@/lib/workbench/runtime").catch(() => null);
      const story = runtime
        ? runtime.buildWorkbenchStory(
            state.workspaceId,
            state.insights,
            audience,
            purpose,
            slideCount,
          )
        : null;
      if (!story) {
        throw new Error("Executive Story Builder is unavailable.");
      }
      setState((current) => ({
        ...current,
        story,
        progress: { ...current.progress, story: "Ready" },
        interventions: [
          intervention(
            "Proposal",
            `${slideCount}-slide ${audience} story is ready`,
            "Each page uses a validated finding, one primary chart at most, and explicit source or limitation notes.",
          ),
          ...current.interventions,
        ],
      }));
      setBusy(false);
    },
    [state.insights, state.workspaceId],
  );

  const exportStory = useCallback(async () => {
    if (!state.story) return;
    setBusy(true);
    try {
      const runtime = await import("@/lib/workbench/runtime");
      await runtime.exportWorkbenchStory(state.story);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The editable PowerPoint could not be generated.",
      );
    } finally {
      setBusy(false);
    }
  }, [state.story]);

  const submitCoDesignerContext = useCallback(
    async (text: string) => {
      if (/retire|headcount|denominator|definition/i.test(text)) {
        setState((current) => ({ ...current, activeView: "metrics" }));
        await requestMetricPatch(text);
        return;
      }
      appendIntervention(
        intervention(
          "Proposal",
          "Business context captured",
          text,
          "The context is visible but has not changed an approved metric or calculation.",
        ),
      );
    },
    [appendIntervention, requestMetricPatch],
  );

  const value = useMemo<WorkbenchContextValue>(
    () => ({
      state,
      activeDatasetId,
      draftQuestion,
      processing,
      processingMessage,
      busy,
      error,
      setDraftQuestion,
      setActiveDatasetId,
      setActiveView: (view) =>
        setState((current) => ({ ...current, activeView: view })),
      addFiles,
      askQuestion,
      resolveAmbiguity,
      requestMetricPatch,
      applyMetricPatch,
      cancelMetricPatch,
      runAnalysis,
      runBranch,
      toggleInsightStory,
      buildStory,
      exportStory,
      submitCoDesignerContext,
    }),
    [
      activeDatasetId,
      addFiles,
      applyMetricPatch,
      askQuestion,
      buildStory,
      busy,
      cancelMetricPatch,
      draftQuestion,
      error,
      exportStory,
      processing,
      processingMessage,
      requestMetricPatch,
      resolveAmbiguity,
      runAnalysis,
      runBranch,
      state,
      submitCoDesignerContext,
      toggleInsightStory,
    ],
  );

  return (
    <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>
  );
}

export function useWorkbench() {
  const context = useContext(WorkbenchContext);
  if (!context) {
    throw new Error("useWorkbench must be used inside WorkbenchProvider.");
  }
  return context;
}

