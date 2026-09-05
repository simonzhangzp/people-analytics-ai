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
  createInitialInterventions,
  createRetirementAmbiguity,
  createRetirementMetricPatch,
  createVoluntaryAttritionMetric,
} from "@/lib/workbench/fallbacks";
import { assertSafeAIPayload } from "@/lib/ai/payload-guard";
import {
  createAttritionAnalysisPlan,
  isDirectlyExecutableIntent,
  resolveQueryIntent,
  runAnalystAgent,
} from "@/lib/analysis";
import {
  createCapabilityAnalysisPlan,
  metricForCapability,
} from "@/lib/analysis/registry";
import { applyMetricDefinitionPatch } from "@/lib/metrics";
import { HEADCOUNT_METRIC } from "@/lib/metrics/library";
import {
  buildCapabilityReports,
  selectCapabilityForQuestion,
} from "@/lib/semantics";
import type {
  AIIntervention,
  DataThreadTurn,
  ExecutiveStory,
  Insight,
  MetricDefinition,
  MetricPatch,
  ResolvedQueryIntent,
  StorySlideCount,
  WorkbenchState,
  WorkbenchView,
} from "@/types/workbench";

interface StoredWorkbenchState {
  workspaceName: string;
  datasetMetadata: WorkbenchState["datasets"][number]["metadata"][];
  fieldMappings: WorkbenchState["fieldMappings"];
  relationships: WorkbenchState["relationships"];
  capabilities: WorkbenchState["capabilities"];
  activeCapabilityId: string | null;
  question: WorkbenchState["question"];
  metrics: WorkbenchState["metrics"];
  activeMetricId: string | null;
  insights: WorkbenchState["insights"];
  thread?: WorkbenchState["thread"];
  activeTurnId?: string | null;
  story: WorkbenchState["story"];
  progress: WorkbenchState["progress"];
}

interface WorkbenchContextValue {
  state: WorkbenchState;
  activeDatasetId?: string;
  localDataAvailable: boolean;
  draftQuestion: string;
  processing: boolean;
  processingMessage?: string;
  busy: boolean;
  error?: string;
  setDraftQuestion: (value: string) => void;
  setActiveDatasetId: (value: string) => void;
  setActiveView: (view: WorkbenchView) => void;
  approveRelationship: (relationshipId: string) => void;
  addFiles: (files: File[]) => Promise<void>;
  askQuestion: (questionText?: string, parentTurnId?: string) => Promise<void>;
  resolveAmbiguity: (optionId: string) => Promise<void>;
  requestMetricPatch: (instruction: string) => Promise<void>;
  applyMetricPatch: () => Promise<void>;
  cancelMetricPatch: () => void;
  runAnalysis: () => Promise<void>;
  runBranch: (branch: Insight["branchKey"]) => Promise<void>;
  toggleInsightStory: (insightId: string) => void;
  buildStory: (
    audience: ExecutiveStory["audience"],
    purpose: ExecutiveStory["purpose"],
    slideCount: StorySlideCount,
  ) => Promise<void>;
  exportStory: () => Promise<void>;
  submitCoDesignerContext: (text: string) => Promise<void>;
  handleInterventionAction: (
    interventionId: string,
    actionId: string,
  ) => void;
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

const MISSING_LOCAL_TABLE =
  /Catalog Error:[\s\S]*Table with name[\s\S]*does not exist/i;

function sourceDatasetKey(
  dataset: WorkbenchState["datasets"][number],
): string {
  return [
    dataset.metadata.sourceFileName ?? dataset.metadata.name,
    dataset.metadata.sheetName ?? "",
    String(dataset.metadata.fileSize),
    dataset.metadata.fingerprint,
  ].join("|");
}

function canResumeRestoredThread(
  previous: WorkbenchState["datasets"],
  next: WorkbenchState["datasets"],
): boolean {
  if (previous.length === 0 || previous.length !== next.length) return false;
  const previousKeys = previous.map(sourceDatasetKey).sort();
  const nextKeys = next.map(sourceDatasetKey).sort();
  return previousKeys.every((key, index) => key === nextKeys[index]);
}

function restoredDatasetIdMap(
  previous: WorkbenchState["datasets"],
  next: WorkbenchState["datasets"],
): Map<string, string> {
  const nextByKey = new Map(
    next.map((dataset) => [sourceDatasetKey(dataset), dataset.metadata.id]),
  );
  return new Map(
    previous.flatMap((dataset) => {
      const nextId = nextByKey.get(sourceDatasetKey(dataset));
      return nextId ? [[dataset.metadata.id, nextId] as const] : [];
    }),
  );
}

function localFilesLabel(datasets: WorkbenchState["datasets"]): string {
  return [
    ...new Set(
      datasets.map(
        ({ metadata }) => metadata.sourceFileName ?? metadata.name,
      ),
    ),
  ].join(", ");
}

function userFacingCalculationError(
  cause: unknown,
  datasets: WorkbenchState["datasets"],
): { message: string; needsReattach: boolean } {
  const technicalMessage =
    cause instanceof Error ? cause.message : String(cause ?? "");
  if (MISSING_LOCAL_TABLE.test(technicalMessage)) {
    return {
      message: `Reattach ${localFilesLabel(
        datasets,
      )} to continue. Raw employee rows intentionally remain session-only and were not retained after the page reloaded.`,
      needsReattach: true,
    };
  }
  if (/(?:Catalog|Binder|Parser|Internal) Error:/i.test(technicalMessage)) {
    return {
      message:
        "The local calculation could not safely translate this question. Try a more specific People Analytics question or review the inferred data meaning.",
      needsReattach: false,
    };
  }
  return {
    message:
      technicalMessage || "The local calculation could not be completed.",
    needsReattach: false,
  };
}

function isInternalCalculationMessage(value: string | undefined): boolean {
  return Boolean(
    value &&
      (MISSING_LOCAL_TABLE.test(value) ||
        /(?:Catalog|Binder|Parser|Internal) Error:/i.test(value)),
  );
}

function sanitizeRestoredInsight(
  insight: Insight,
  datasets: WorkbenchState["datasets"],
): Insight {
  const technicalMessage = [
    insight.finding,
    ...insight.evidence.map((item) => item.detail),
    ...insight.limitations,
  ].find(isInternalCalculationMessage);
  if (!technicalMessage) return insight;
  const failure = userFacingCalculationError(
    new Error(technicalMessage),
    datasets,
  );
  return {
    ...insight,
    headline: failure.needsReattach
      ? "Reattach local files to continue"
      : "This question needs more evidence",
    finding: failure.message,
    evidence: insight.evidence.map((item) => ({
      ...item,
      detail: isInternalCalculationMessage(item.detail)
        ? failure.message
        : item.detail,
    })),
    limitations: insight.limitations.map((item) =>
      isInternalCalculationMessage(item) ? failure.message : item,
    ),
  };
}

function initialState(workspaceId: string): WorkbenchState {
  const demo = workspaceId === "demo";
  return {
    workspaceId,
    workspaceName: demo
      ? "Guided Voluntary Attrition Analysis"
      : "Untitled People Analytics Workspace",
    activeView: "data",
    datasets: [],
    fieldMappings: [],
    relationships: [],
    capabilities: [],
    activeCapabilityId: null,
    question: null,
    metrics: [],
    activeMetricId: null,
    ambiguity: null,
    pendingMetricPatch: null,
    analysisPlan: null,
    insights: [],
    thread: [],
    activeTurnId: null,
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
    capabilities: state.capabilities,
    activeCapabilityId: state.activeCapabilityId,
    question: state.question,
    metrics: state.metrics,
    activeMetricId: state.activeMetricId,
    insights: state.insights,
    thread: state.thread,
    activeTurnId: state.activeTurnId,
    story: state.story,
    progress: state.progress,
  };
}

function intervention(
  kind: AIIntervention["kind"],
  title: string,
  body: string,
  rationale?: string,
  actions?: AIIntervention["actions"],
): AIIntervention {
  return {
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    title,
    body,
    rationale,
    actions,
    createdAt: new Date().toISOString(),
  };
}

function metricForIntent(intent: ResolvedQueryIntent): MetricDefinition {
  const formula: MetricDefinition["formula"] =
    intent.aggregation === "sum" && intent.measureField
      ? { kind: "sum", field: intent.measureField }
      : intent.aggregation === "count_distinct" && intent.measureField
        ? {
            kind: "count",
            entity: "employee",
            distinctField: intent.measureField,
          }
        : { kind: "count", entity: "aggregate_record" };
  return {
    ...HEADCOUNT_METRIC,
    id: `${HEADCOUNT_METRIC.id}:${intent.id}`,
    formula,
    sourceFields: [
      ...(intent.measureField ? [intent.measureField] : []),
      ...(intent.timeField ? [intent.timeField] : []),
    ],
    dimensions: [...intent.dimensions, ...intent.profileDimensions],
    description: intent.assumptions.join(" "),
    status: "Approved",
    confidence: intent.confidence,
    version: 1,
    approvedAt: new Date().toISOString(),
  };
}

async function safeAIRequest(task: string, input: unknown) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const requestBody = { task, input };
    assertSafeAIPayload(requestBody);
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
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as {
      source?: "deepseek" | "deterministic";
      data?: unknown;
      warning?: { code?: string; message?: string };
      error?: { code?: string; message?: string };
    } | null;
    if (!response.ok) {
      return {
        source: "deterministic" as const,
        warning: {
          code: payload?.error?.code ?? "invalid_request",
          message:
            payload?.error?.message ??
            "The AI request was rejected before any provider call.",
        },
      };
    }
    return payload;
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
  const [localDataAvailable, setLocalDataAvailable] = useState(false);
  const [draftQuestion, setDraftQuestion] = useState(isDemo ? DEMO_QUESTION : "");
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const demoStarted = useRef(false);
  const hydrated = useRef(false);
  const calculatedInsights = useRef<Insight[]>([]);
  const stateRef = useRef(state);
  const localDataAvailableRef = useRef(false);

  const markLocalDataAvailable = useCallback((available: boolean) => {
    localDataAvailableRef.current = available;
    setLocalDataAvailable(available);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const appendIntervention = useCallback((item: AIIntervention) => {
    setState((current) => ({
      ...current,
      interventions: [item, ...current.interventions].slice(0, 12),
    }));
  }, []);

  useEffect(() => {
    if (workspaceId === "new" || workspaceId === "demo" || hydrated.current) return;
    let timer: number | undefined;
    try {
      const saved = window.localStorage.getItem(`people-workbench:${workspaceId}`);
      if (!saved) {
        hydrated.current = true;
        return;
      }
      const parsed = JSON.parse(saved) as StoredWorkbenchState;
      timer = window.setTimeout(() => {
        hydrated.current = true;
        const restoredDatasets = (parsed.datasetMetadata ?? []).map(
          (metadata) => ({
            metadata,
            explorationRows: [],
          }),
        );
        const restoredInsights = (parsed.insights ?? []).map((insight) =>
          sanitizeRestoredInsight(insight, restoredDatasets),
        );
        const restoredThread = (parsed.thread ?? []).map((turn) => ({
          ...turn,
          methodNote: isInternalCalculationMessage(turn.methodNote)
            ? userFacingCalculationError(
                new Error(turn.methodNote),
                restoredDatasets,
              ).message
            : turn.methodNote,
        }));
        setState((current) => ({
          ...current,
          workspaceName: parsed.workspaceName,
          datasets: restoredDatasets,
          fieldMappings: parsed.fieldMappings ?? [],
          relationships: parsed.relationships ?? [],
          capabilities:
            parsed.capabilities ??
            buildCapabilityReports(
              restoredDatasets.map(({ metadata }) => metadata),
            ),
          activeCapabilityId: parsed.activeCapabilityId ?? null,
          question: parsed.question,
          metrics: parsed.metrics ?? [],
          activeMetricId: parsed.activeMetricId,
          insights: restoredInsights,
          thread: restoredThread,
          activeTurnId: parsed.activeTurnId ?? null,
          story: parsed.story,
          progress: {
            ...parsed.progress,
            data: restoredDatasets.length
              ? "Needs input"
              : parsed.progress.data,
            analysis: restoredInsights.length
              ? "Ready"
              : parsed.progress.analysis,
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
      hydrated.current = true;
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
      const previousDatasets = stateRef.current.datasets;
      const wasLocalDataAvailable = localDataAvailableRef.current;
      setProcessing(true);
      setError(undefined);
      setProcessingMessage("Reading files and starting local SQL…");
      setState((current) => ({
        ...current,
        engineStatus: "loading",
        progress: { ...current.progress, data: "In progress" },
      }));
      try {
        let result:
          | Awaited<ReturnType<typeof ingestWithLegacyProfiler>>
          | undefined;
        const runtime = await import("@/lib/workbench/runtime").catch(
          () => null,
        );
        let useCompatibilityParser = !runtime;
        if (runtime) {
          try {
            result = await runtime.ingestWorkbenchFiles(files);
          } catch (cause) {
            if (!runtime.isDuckDBInitializationError(cause)) throw cause;
            useCompatibilityParser = true;
          }
        }
        if (useCompatibilityParser) {
          result = await ingestWithLegacyProfiler(files);
          appendIntervention(
            intervention(
              "Warning",
              "Local SQL used a compatibility parser",
              "DuckDB-Wasm was unavailable, so file understanding used the bounded compatibility profiler. Reattach the files in a modern browser before treating a calculation as complete.",
            ),
          );
        }
        if (!result) {
          throw new Error("The local file profiler did not return a result.");
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
            tableContract: dataset.metadata.tableContract
              ? {
                  ...dataset.metadata.tableContract,
                  datasetId:
                    idMap.get(dataset.metadata.id) ?? dataset.metadata.id,
                }
              : undefined,
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
        const capabilities = buildCapabilityReports(
          datasets.map(({ metadata }) => metadata),
        );
        const firstRunnable = capabilities.find((item) => item.runnable);
        const resumeRestoredThread =
          !wasLocalDataAvailable &&
          canResumeRestoredThread(previousDatasets, datasets);
        const restoredIds = resumeRestoredThread
          ? restoredDatasetIdMap(previousDatasets, datasets)
          : new Map<string, string>();
        setActiveDatasetId(datasets[0]?.metadata.id);
        setProcessingMessage("Confirming relationships and answerability…");
        setState((current) => ({
          ...current,
          datasets,
          fieldMappings: mappings,
          relationships,
          capabilities,
          activeCapabilityId: firstRunnable?.id ?? null,
          question: resumeRestoredThread ? current.question : null,
          metrics: resumeRestoredThread ? current.metrics : [],
          activeMetricId: resumeRestoredThread
            ? current.activeMetricId
            : null,
          ambiguity: null,
          pendingMetricPatch: null,
          analysisPlan: resumeRestoredThread ? current.analysisPlan : null,
          insights: resumeRestoredThread
            ? current.insights.map((insight) => ({
                ...insight,
                evidence: insight.evidence.map((item) => ({
                  ...item,
                  sourceDatasetIds: item.sourceDatasetIds.map(
                    (id) => restoredIds.get(id) ?? id,
                  ),
                })),
              }))
            : [],
          thread: resumeRestoredThread
            ? current.thread.map((turn) => ({
                ...turn,
                intent: turn.intent
                  ? {
                      ...turn.intent,
                      datasetId:
                        restoredIds.get(turn.intent.datasetId) ??
                        turn.intent.datasetId,
                    }
                  : undefined,
              }))
            : [],
          activeTurnId: resumeRestoredThread ? current.activeTurnId : null,
          story: resumeRestoredThread ? current.story : null,
          engineStatus: "ready",
          progress: {
            data: "Ready",
            metrics: resumeRestoredThread
              ? current.progress.metrics
              : "Not started",
            analysis: resumeRestoredThread
              ? current.progress.analysis
              : "Not started",
            story: resumeRestoredThread
              ? current.progress.story
              : "Not started",
          },
          interventions: [
            intervention(
              resumeRestoredThread ? "Applied" : "Proposal",
              resumeRestoredThread
                ? "Local files reattached"
                : `${datasets.length} People datasets understood`,
              resumeRestoredThread
                ? "The source structure matches the restored workspace. Previous answers remain visible and new local calculations are available."
                : `${datasets
                    .map(
                      ({ metadata }) =>
                        `${metadata.inferredType} at ${metadata.grain.label} grain`,
                    )
                    .join("; ")}. ${
                    capabilities.filter((item) => item.runnable).length
                  } deterministic domain path${
                    capabilities.filter((item) => item.runnable).length === 1
                      ? ""
                      : "s"
                  } and ${relationships.length} relationship${
                    relationships.length === 1 ? "" : "s"
                  } can support the question.`,
            ),
            ...current.interventions,
          ],
        }));
        markLocalDataAvailable(true);
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
    [appendIntervention, isDemo, markLocalDataAvailable],
  );

  useEffect(() => {
    if (!isDemo || demoStarted.current) return;
    demoStarted.current = true;
    void loadWorkbenchDemoFiles().then(addFiles);
  }, [addFiles, isDemo]);

  const askQuestion = useCallback(async (
    questionText?: string,
    parentTurnId?: string,
  ) => {
    const text = (questionText ?? draftQuestion).trim();
    const snapshot = stateRef.current;
    if (!text || snapshot.datasets.length === 0) return;
    if (!localDataAvailableRef.current) {
      setError(
        `Reattach ${localFilesLabel(
          snapshot.datasets,
        )} to continue. Raw employee rows intentionally remain session-only and were not retained after the page reloaded.`,
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    const intent = resolveQueryIntent({
      question: text,
      datasets: snapshot.datasets,
      capabilities: snapshot.capabilities,
      thread: snapshot.thread,
      parentTurnId: parentTurnId ?? snapshot.activeTurnId ?? undefined,
    });
    const capability = selectCapabilityForQuestion(
      text,
      snapshot.capabilities,
    );
    const guidedAttrition =
      isDemo && capability?.domain === "retention";
    const metric =
      intent && isDirectlyExecutableIntent(intent)
        ? metricForIntent(intent)
        : guidedAttrition
          ? applyMetricDefinitionPatch(
              createRetirementMetricPatch(createVoluntaryAttritionMetric()),
            )
          : capability
            ? metricForCapability(capability)
            : intent
              ? metricForIntent(intent)
              : HEADCOUNT_METRIC;
    const definitionAmbiguity = guidedAttrition
      ? createRetirementAmbiguity(metric.id)
      : undefined;
    const question = {
      id: `question-${Date.now()}`,
      text,
      metricIds: [metric.id],
      createdAt: new Date().toISOString(),
    };
    const turn: DataThreadTurn = {
      id: question.id,
      parentTurnId: parentTurnId ?? snapshot.activeTurnId ?? undefined,
      question: text,
      status: "running",
      intent,
      insightIds: [],
      metricId: metric.id,
      methodNote: guidedAttrition
        ? "Using: voluntary exits / beginning HC · Retirement excluded · Employees only"
        : undefined,
      provisional: guidedAttrition,
      definitionAmbiguity,
      createdAt: question.createdAt,
    };
    const analysisPlan = !capability
      ? null
      : createCapabilityAnalysisPlan(question, capability, metric);
    setState((current) => ({
      ...current,
      activeView: "data",
      question,
      metrics: [
        ...current.metrics.filter((item) => item.id !== metric.id),
        metric,
      ],
      activeMetricId: metric.id,
      activeCapabilityId: capability?.id ?? null,
      ambiguity: null,
      pendingMetricPatch: null,
      analysisPlan,
      story: null,
      thread: [...current.thread, turn],
      activeTurnId: turn.id,
      progress: {
        ...current.progress,
        metrics: "Ready",
        analysis:
          capability?.runnable || Boolean(intent) ? "In progress" : "Blocked",
      },
      interventions: [
        guidedAttrition
          ? intervention(
              "Proposal",
              "Provisional People metric used",
              "Voluntary exits over beginning headcount, retirement excluded, employees only. Change the definition if your organization uses a different rule.",
            )
          : intervention(
              "Proposal",
              "Question translated into a local calculation",
              intent?.assumptions.join(" ") ??
                "The analyst loop inspects schema, profiles the measure, and calculates locally.",
            ),
        ...current.interventions,
      ],
    }));
    setDraftQuestion("");

    try {
      if (intent && isDirectlyExecutableIntent(intent)) {
        const dataset = snapshot.datasets.find(
          ({ metadata }) => metadata.id === intent.datasetId,
        );
        if (!dataset) throw new Error("The selected local dataset is unavailable.");
        const result = await runAnalystAgent({
          question: text,
          dataset,
          intent,
          turn,
          metricId: metric.id,
        });
        calculatedInsights.current = [
          ...calculatedInsights.current,
          ...result.insights,
        ];
        setState((current) => ({
          ...current,
          analysisPlan: result.plan,
          insights: [...current.insights, ...result.insights],
          thread: current.thread.map((item) =>
            item.id === turn.id
              ? {
                  ...item,
                  status: result.insights.some((insight) => insight.validated)
                    ? ("complete" as const)
                    : ("blocked" as const),
                  insightIds: result.insights.map((insight) => insight.id),
                  methodNote: result.methodNote,
                }
              : item,
          ),
          progress: {
            ...current.progress,
            analysis: result.insights.some((insight) => insight.validated)
              ? "Ready"
              : "Blocked",
          },
        }));
        return;
      }

      if (!capability || !analysisPlan) {
        throw new Error(
          capability?.missing.join(" ") ||
            "The attached data does not yet contain the evidence required for this question.",
        );
      }
      const runtime = await import("@/lib/workbench/runtime");
      const result = await runtime.executeWorkbenchAnalysis({
        question,
        metric,
        datasets: snapshot.datasets,
        plan: analysisPlan,
        capability,
      });
      calculatedInsights.current = [
        ...calculatedInsights.current,
        ...result.insights,
      ];
      const visibleInsights =
        result.insights.filter((insight) => insight.validated).slice(0, 1).length
          ? result.insights.filter((insight) => insight.validated).slice(0, 1)
          : result.insights.slice(0, 1);
      setState((current) => ({
        ...current,
        analysisPlan: result.plan,
        insights: [...current.insights, ...visibleInsights],
        thread: current.thread.map((item) =>
          item.id === turn.id
            ? {
                ...item,
                status: visibleInsights.some((insight) => insight.validated)
                  ? ("complete" as const)
                  : ("blocked" as const),
                  insightIds: visibleInsights.map((insight) => insight.id),
                  methodNote: item.methodNote ?? result.plan.summary,
              }
            : item,
        ),
        progress: {
          ...current.progress,
          analysis: visibleInsights.some((insight) => insight.validated)
            ? "Ready"
            : "Blocked",
        },
      }));
    } catch (cause) {
      const failure = userFacingCalculationError(cause, snapshot.datasets);
      const reason = failure.message;
      if (failure.needsReattach) {
        markLocalDataAvailable(false);
        setError(reason);
      }
      const dataGap: Insight = {
        id: `${turn.id}-data-gap`,
        questionId: turn.id,
        branchKey: "data-gap",
        headline: failure.needsReattach
          ? "Reattach local files to continue"
          : "This question needs more evidence",
        finding: reason,
        metricIds: [metric.id],
        filters: {},
        population: capability?.population.label ?? "Attached local data",
        evidence: [
          {
            id: `${turn.id}-missing-evidence`,
            label: "Missing evidence",
            value: "Not calculated",
            detail: reason,
            sourceDatasetIds:
              capability?.datasetIds ??
              (intent ? [intent.datasetId] : snapshot.datasets.map(({ metadata }) => metadata.id)),
          },
        ],
        confidence: "Low",
        limitations: [
          ...(capability?.missing ?? []),
          "No substitute result or fabricated number was used.",
        ],
        suggestedFollowUps: [],
        selectedForExecutiveStory: false,
        validated: false,
      };
      setState((current) => ({
        ...current,
        insights: [...current.insights, dataGap],
        thread: current.thread.map((item) =>
          item.id === turn.id
            ? {
                ...item,
                status: "blocked" as const,
                insightIds: [dataGap.id],
                methodNote: reason,
              }
            : item,
        ),
        progress: { ...current.progress, analysis: "Blocked" },
      }));
      appendIntervention(
        intervention(
          "Data gap",
          failure.needsReattach
            ? "Local files need to be reattached"
            : "The question could not be calculated",
          reason,
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [
    appendIntervention,
    draftQuestion,
    isDemo,
    markLocalDataAvailable,
  ]);

  const resolveAmbiguity = useCallback(async (optionId: string) => {
    const snapshot = stateRef.current;
    const metric = snapshot.metrics.find(
      (item) => item.id === snapshot.activeMetricId,
    );
    const question = snapshot.question;
    const capability = snapshot.capabilities.find(
      (item) => item.id === snapshot.activeCapabilityId,
    );
    const turn = snapshot.thread.find(
      (item) => item.id === snapshot.activeTurnId,
    );
    const ambiguity = snapshot.ambiguity ?? turn?.definitionAmbiguity;
    if (!metric || !ambiguity || !question || !capability || !turn) {
      return;
    }
    setBusy(true);
    const approved =
      optionId === "separate-retirement"
        ? applyMetricDefinitionPatch(createRetirementMetricPatch(metric))
        : ({
            ...metric,
            status: "Approved",
            confidence: "High",
            version: metric.version + 1,
            approvedAt: new Date().toISOString(),
          } satisfies MetricDefinition);
    const availableFields = snapshot.fieldMappings.flatMap((mapping) =>
      mapping.canonicalField
        ? [mapping.sourceColumn, mapping.canonicalField]
        : [mapping.sourceColumn],
    );
    const analysisPlan = createAttritionAnalysisPlan(question, {
      metricId: approved.id,
      availableFields,
    });
    setState((current) => ({
      ...current,
      metrics: current.metrics.map((item) =>
        item.id === metric.id ? approved : item,
      ),
      ambiguity: null,
      pendingMetricPatch: null,
      analysisPlan,
      thread: current.thread.map((item) =>
        item.id === turn.id ? { ...item, status: "running" as const } : item,
      ),
      progress: {
        ...current.progress,
        metrics: "Ready",
        analysis: "In progress",
      },
    }));

    try {
      const runtime = await import("@/lib/workbench/runtime");
      const result = await runtime.executeWorkbenchAnalysis({
        question,
        metric: approved,
        datasets: snapshot.datasets,
        plan: analysisPlan,
        capability,
      });
      calculatedInsights.current = [
        ...calculatedInsights.current,
        ...result.insights,
      ];
      const visible =
        result.insights.find((insight) => insight.validated) ??
        result.insights[0];
      if (!visible) throw new Error("No deterministic result was produced.");
      setState((current) => ({
        ...current,
        insights: [
          ...current.insights.filter(
            (insight) => !turn.insightIds.includes(insight.id),
          ),
          visible,
        ],
        analysisPlan: result.plan,
        thread: current.thread.map((item) =>
          item.id === turn.id
            ? {
                ...item,
                status: visible.validated
                  ? ("complete" as const)
                  : ("blocked" as const),
                insightIds: [visible.id],
                methodNote:
                  optionId === "separate-retirement"
                    ? "Using: voluntary exits / beginning HC · Retirement excluded · Employees only"
                    : "Using: voluntary exits including retirement / beginning HC · Employees only",
                provisional: false,
                definitionAmbiguity: undefined,
              }
            : item,
        ),
        progress: {
          ...current.progress,
          analysis: visible.validated ? "Ready" : "Blocked",
        },
        interventions: [
          intervention(
            "Applied",
            optionId === "separate-retirement"
              ? "Retirement treated separately"
              : "Retirement included as voluntary",
            "The definition was applied, the answer was recalculated, and it was saved as this workspace's People metric.",
          ),
          ...current.interventions,
        ],
      }));
      const persistenceRuntime = await import("@/lib/workbench/runtime").catch(
        () => null,
      );
      await persistenceRuntime?.persistApprovedMetric(
        snapshot.workspaceId,
        approved,
      );
    } catch (cause) {
      const failure = userFacingCalculationError(cause, snapshot.datasets);
      const reason = failure.message;
      if (failure.needsReattach) {
        markLocalDataAvailable(false);
      }
      setState((current) => ({
        ...current,
        thread: current.thread.map((item) =>
          item.id === turn.id
            ? {
                ...item,
                status: "blocked" as const,
                methodNote: reason,
              }
            : item,
        ),
        progress: { ...current.progress, analysis: "Blocked" },
      }));
      setError(reason);
    } finally {
      setBusy(false);
    }
  }, [markLocalDataAvailable]);

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
      if (!livePatch?.items.length) {
        appendIntervention(
          intervention(
            "Data gap",
            "No safe metric patch was generated",
            aiResult?.warning?.message ??
              "The requested change could not be represented by the structured metric contract. The approved definition remains unchanged.",
          ),
        );
        setBusy(false);
        return;
      }
      const nextPatch = livePatch;
      setState((current) => ({
        ...current,
        pendingMetricPatch: nextPatch,
        interventions: [
          intervention(
            "Proposal",
            `${nextPatch.items.length} semantic change${nextPatch.items.length === 1 ? "" : "s"} ready for review`,
            `${nextPatch.summary} Nothing changes until you apply the visible diff.`,
          ),
          ...current.interventions,
        ],
      }));
      setBusy(false);
    },
    [
      appendIntervention,
      state.activeMetricId,
      state.datasets,
      state.metrics,
    ],
  );

  const applyMetricPatch = useCallback(async () => {
    const patch = state.pendingMetricPatch;
    const question = state.question;
    const capability = state.capabilities.find(
      (item) => item.id === state.activeCapabilityId,
    );
    if (!patch || !question || !capability) return;
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
      analysisPlan: isDemo
        ? createAttritionAnalysisPlan(question, {
            metricId: patch.metricId,
            availableFields,
          })
        : createCapabilityAnalysisPlan(
            question,
            capability,
            approvedDefinition,
          ),
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
  }, [
    state.activeCapabilityId,
    state.capabilities,
    state.fieldMappings,
    state.pendingMetricPatch,
    state.question,
    state.workspaceId,
    isDemo,
  ]);

  const cancelMetricPatch = useCallback(() => {
    setState((current) => ({ ...current, pendingMetricPatch: null }));
  }, []);

  const approveRelationship = useCallback((relationshipId: string) => {
    setState((current) => {
      const relationship = current.relationships.find(
        (item) => item.id === relationshipId,
      );
      if (
        !relationship ||
        relationship.matchRate <= 0 ||
        relationship.cardinality === "unknown" ||
        relationship.cardinality === "N:N" ||
        relationship.conflicts.length > 0
      ) {
        return {
          ...current,
          interventions: [
            intervention(
              "Data gap",
              "This relationship cannot be approved",
              "A join needs measured value overlap, known cardinality, and no material conflict before it can change an answer.",
            ),
            ...current.interventions,
          ],
        };
      }
      return {
        ...current,
        relationships: current.relationships.map((item) =>
          item.id === relationshipId
            ? { ...item, status: "Approved" as const }
            : item,
        ),
        interventions: [
          intervention(
            "Applied",
            "Measured relationship approved",
            `${relationship.fromField} ↔ ${relationship.toField} is approved at ${(relationship.matchRate * 100).toFixed(0)}% measured overlap with ${relationship.cardinality} cardinality.`,
          ),
          ...current.interventions,
        ],
      };
    });
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!state.question || !state.activeMetricId || !state.analysisPlan) return;
    const capability = state.capabilities.find(
      (item) => item.id === state.activeCapabilityId,
    );
    if (!capability) return;
    setBusy(true);
    try {
      const runtime = await import("@/lib/workbench/runtime").catch(() => null);
      if (!runtime) {
        throw new Error("The local deterministic analysis runtime is unavailable.");
      }
      const result = await runtime.executeWorkbenchAnalysis({
        question: state.question,
        metric: state.metrics.find(
          (item) => item.id === state.activeMetricId,
        )!,
        datasets: state.datasets,
        plan: state.analysisPlan,
        capability,
      });
      calculatedInsights.current = result.insights;
      const primary =
        result.insights.find(
          (insight) => insight.branchKey === "trend" && insight.validated,
        ) ??
        result.insights.find((insight) => insight.validated) ??
        result.insights[0];
      if (!primary) throw new Error("No deterministic result was produced.");
      setState((current) => ({
        ...current,
        insights: [primary],
        analysisPlan: result.plan,
        progress: {
          ...current.progress,
          analysis: primary.validated ? "Ready" : "Blocked",
        },
        interventions: [
          intervention(
            primary.validated ? "Recommendation" : "Data gap",
            primary.headline,
            primary.validated
              ? `${primary.finding} Follow only the evidence branches shown in the result.`
              : primary.limitations.join(" "),
          ),
          ...current.interventions,
        ],
      }));
    } catch (cause) {
      const failure = userFacingCalculationError(cause, state.datasets);
      const reason =
        failure.message ||
        capability.missing.join(" ") ||
        "Confirm the inferred identity, period, population, and measure roles before running.";
      if (failure.needsReattach) {
        markLocalDataAvailable(false);
        setError(reason);
      }
      const dataGap: Insight = {
        id: `${state.question.id}-${capability.domain}-runtime-data-gap`,
        questionId: state.question.id,
        branchKey: "data-gap",
        headline: `${capability.metricName} is blocked by a data gap`,
        finding: reason,
        metricIds: [state.activeMetricId],
        filters: {},
        population: capability.population.label,
        evidence: [
          {
            id: `${state.question.id}-runtime-missing-evidence`,
            label: "Missing evidence",
            value: "Analysis blocked",
            detail: reason,
            sourceDatasetIds: capability.datasetIds,
          },
        ],
        confidence: "Low",
        limitations: [
          ...capability.missing,
          reason,
          "No substitute metric or demo result was used.",
        ],
        suggestedFollowUps: [],
        selectedForExecutiveStory: false,
        validated: false,
      };
      calculatedInsights.current = [dataGap];
      setState((current) => ({
        ...current,
        insights: [dataGap],
        analysisPlan: current.analysisPlan
          ? {
              ...current.analysisPlan,
              steps: current.analysisPlan.steps.map((step) => ({
                ...step,
                status: "blocked",
                blockedReason: reason,
              })),
            }
          : current.analysisPlan,
        progress: { ...current.progress, analysis: "Blocked" },
        interventions: [
          intervention(
            "Data gap",
            `No supported ${capability.domain} execution path for these fields`,
            `${reason} No substitute metric or demo result was used.`,
          ),
          ...current.interventions,
        ],
      }));
    } finally {
      setBusy(false);
    }
  }, [
    state.activeMetricId,
    state.activeCapabilityId,
    state.analysisPlan,
    state.capabilities,
    state.datasets,
    state.metrics,
    state.question,
    markLocalDataAvailable,
  ]);

  const runBranch = useCallback(
    async (branch: Insight["branchKey"]) => {
      if (!state.question || !state.activeMetricId || branch === "trend") return;
      if (isDemo && branch === "organization") {
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
      const next = calculatedInsights.current.find(
        (insight) => insight.branchKey === branch && insight.validated,
      );
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
      slideCount: StorySlideCount,
    ) => {
      setBusy(true);
      setError(undefined);
      try {
        const runtime = await import("@/lib/workbench/runtime").catch(
          () => null,
        );
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
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Executive Story Builder is unavailable.",
        );
      } finally {
        setBusy(false);
      }
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
      if (
        /definition|metric|formula|denominator|include|exclude|口径|指标|分母/i.test(
          text,
        ) &&
        stateRef.current.activeMetricId
      ) {
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

  const handleInterventionAction = useCallback(
    (interventionId: string, actionId: string) => {
      setState((current) => {
        const item = current.interventions.find(
          (candidate) => candidate.id === interventionId,
        );
        const action = item?.actions?.find(
          (candidate) => candidate.id === actionId,
        );
        if (!action) return current;
        const view = ["data", "metrics", "analysis", "story"].includes(
          action.intent,
        )
          ? (action.intent as WorkbenchView)
          : actionId === "review-data"
            ? "data"
            : actionId === "review-metric"
              ? "metrics"
              : current.activeView;
        return { ...current, activeView: view };
      });
    },
    [],
  );

  const value = useMemo<WorkbenchContextValue>(
    () => ({
      state,
      activeDatasetId,
      localDataAvailable,
      draftQuestion,
      processing,
      processingMessage,
      busy,
      error,
      setDraftQuestion,
      setActiveDatasetId,
      setActiveView: (view) =>
        setState((current) => ({ ...current, activeView: view })),
      approveRelationship,
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
      handleInterventionAction,
    }),
    [
      activeDatasetId,
      addFiles,
      approveRelationship,
      applyMetricPatch,
      askQuestion,
      buildStory,
      busy,
      cancelMetricPatch,
      draftQuestion,
      error,
      exportStory,
      localDataAvailable,
      processing,
      processingMessage,
      requestMetricPatch,
      resolveAmbiguity,
      runAnalysis,
      runBranch,
      state,
      submitCoDesignerContext,
      handleInterventionAction,
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

