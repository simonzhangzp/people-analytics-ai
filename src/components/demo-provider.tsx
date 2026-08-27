"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { analyzeLocalWorkforceData } from "@/lib/analytics/local-workforce-analysis";
import { targetDaysFromBrief } from "@/lib/analytics/metric-dashboards";
import { assessReadiness } from "@/lib/data/local-profiler";
import { analyzeStrategyBrief } from "@/lib/strategy/analyze-brief";
import {
  emptyMeasurementBrief,
  getMetricCatalogItem,
  proposalFromCatalogItem,
  proposalFromCustomDraft,
} from "@/lib/strategy/metric-catalog";
import type { WorkflowStageId, WorkflowStatus } from "@/types/domain";
import type { LocalDataWorkspace } from "@/types/local-data";
import type { CustomMetricDraft, StrategyBrief, StrategyIntent } from "@/types/strategy";

interface DemoProgressState {
  strategyApproved: boolean;
  metricReviewed: boolean;
  mappingConfirmed: boolean;
  analysisRun: boolean;
  storyGenerated: boolean;
  pilotCreated: boolean;
}

interface DemoContextValue extends DemoProgressState, LocalDataWorkspace {
  processingFiles: boolean;
  dataError: string | null;
  brief: StrategyBrief | null;
  analyzingStrategy: boolean;
  strategyError: string | null;
  processFiles: (files: File[]) => Promise<void>;
  clearLocalData: () => void;
  selectCatalogItem: (catalogId: string) => Promise<void>;
  submitCustomBrief: (
    kind: StrategyIntent,
    title: string,
    statement: string,
  ) => Promise<void>;
  updateMetricTarget: (metricId: string, target: string) => void;
  addCatalogMetric: (metricId: string) => void;
  addCustomMetric: (draft: CustomMetricDraft) => void;
  removeMetric: (metricId: string) => void;
  skipTargets: () => void;
  approveStrategy: () => void;
  reviewMetric: () => void;
  confirmMapping: () => void;
  runAnalysis: () => void;
  generateStory: () => void;
  createPilot: () => void;
  resetDemo: () => void;
  getStageStatus: (stage: WorkflowStageId) => WorkflowStatus;
}

const initialProgress: DemoProgressState = {
  strategyApproved: false,
  metricReviewed: false,
  mappingConfirmed: false,
  analysisRun: false,
  storyGenerated: false,
  pilotCreated: false,
};

const initialDataWorkspace: LocalDataWorkspace = {
  datasets: [],
  readiness: null,
  analysis: null,
  processedAt: null,
};

const DemoContext = createContext<DemoContextValue | null>(null);
const STORAGE_KEY = "people-strategy-demo-progress";
const BRIEF_KEY = "people-strategy-brief";

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DemoProgressState>(initialProgress);
  const [dataWorkspace, setDataWorkspace] =
    useState<LocalDataWorkspace>(initialDataWorkspace);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [brief, setBrief] = useState<StrategyBrief | null>(null);
  const [analyzingStrategy, setAnalyzingStrategy] = useState(false);
  const [strategyError, setStrategyError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setState({ ...initialProgress, ...JSON.parse(saved) });
      }
      const savedBrief = window.localStorage.getItem(BRIEF_KEY);
      if (savedBrief) {
        setBrief(JSON.parse(savedBrief) as StrategyBrief);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(BRIEF_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (brief) {
      window.localStorage.setItem(BRIEF_KEY, JSON.stringify(brief));
    } else {
      window.localStorage.removeItem(BRIEF_KEY);
    }
  }, [brief]);

  const update = useCallback(
    (change: Partial<DemoProgressState>) =>
      setState((current) => ({ ...current, ...change })),
    [],
  );

  const getStageStatus = useCallback(
    (stage: WorkflowStageId): WorkflowStatus => {
      switch (stage) {
        case "strategy":
          return state.strategyApproved ? "Approved" : "In progress";
        case "measurement":
          return state.metricReviewed
            ? "Approved"
            : state.strategyApproved
              ? "Ready"
              : "Not started";
        case "data":
          return state.mappingConfirmed
            ? "Approved"
            : state.metricReviewed
              ? "Needs input"
              : "Not started";
        case "analysis":
          return state.analysisRun
            ? "Approved"
            : state.mappingConfirmed
              ? "Ready"
              : "Not started";
        case "story":
          return state.storyGenerated
            ? "Approved"
            : state.analysisRun
              ? "Ready"
              : "Not started";
        case "actions":
          return state.pilotCreated
            ? "Approved"
            : state.storyGenerated
              ? "Ready"
              : "Not started";
      }
    },
    [state],
  );

  const processFiles = useCallback(async (files: File[]) => {
    setProcessingFiles(true);
    setDataError(null);
    try {
      const { parseAndProfileFiles } = await import("@/lib/data/local-profiler");
      const datasets = await parseAndProfileFiles(files);
      const readiness = assessReadiness(datasets);
      setDataWorkspace({
        datasets,
        readiness,
        analysis: null,
        processedAt: new Date().toISOString(),
      });
      setState((current) => ({
        ...current,
        mappingConfirmed: false,
        analysisRun: false,
        storyGenerated: false,
        pilotCreated: false,
      }));
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : "The selected files could not be processed.",
      );
    } finally {
      setProcessingFiles(false);
    }
  }, []);

  const runAnalysis = useCallback(() => {
    if (dataWorkspace.datasets.length === 0) {
      setDataError("Upload People files in Data before generating dashboards.");
      return;
    }
    try {
      const analysis = analyzeLocalWorkforceData(
        dataWorkspace.datasets,
        targetDaysFromBrief(brief),
        brief,
      );
      setDataWorkspace((current) => ({ ...current, analysis }));
      setDataError(null);
      update({ analysisRun: true });
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : "The local analysis could not be completed.",
      );
    }
  }, [brief, dataWorkspace.datasets, update]);

  const clearLocalData = useCallback(() => {
    setDataWorkspace(initialDataWorkspace);
    setDataError(null);
    setState((current) => ({
      ...current,
      mappingConfirmed: false,
      analysisRun: false,
      storyGenerated: false,
      pilotCreated: false,
    }));
  }, []);

  const enrichBrief = useCallback(async (seed: StrategyBrief) => {
    setAnalyzingStrategy(true);
    setStrategyError(null);
    try {
      const response = await fetch("/api/strategy/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: seed.intentKind,
          title: seed.title,
          statement: seed.statement,
          catalogId: seed.catalogId,
        }),
      });
      if (!response.ok) {
        throw new Error("The strategy agent could not complete the proposal.");
      }
      const payload = (await response.json()) as { brief: StrategyBrief };
      setBrief((current) => {
        if (!current || current.title !== seed.title) return current;
        const targets = Object.fromEntries(
          current.metrics.map((metric) => [metric.id, metric.target]),
        );
        return {
          ...payload.brief,
          targetsSkipped: current.targetsSkipped,
          metrics: payload.brief.metrics.map((metric) => ({
            ...metric,
            target: targets[metric.id] ?? metric.target,
          })),
        };
      });
    } catch (error) {
      setStrategyError(
        error instanceof Error
          ? error.message
          : "The strategy agent could not complete the proposal.",
      );
    } finally {
      setAnalyzingStrategy(false);
    }
  }, []);

  const selectCatalogItem = useCallback(
    async (catalogId: string) => {
      const seed = analyzeStrategyBrief({
        catalogId,
        kind: "strategy",
        title: "",
        statement: "",
      });
      setBrief(seed);
      setState((current) => ({
        ...current,
        strategyApproved: false,
        metricReviewed: false,
      }));
      await enrichBrief(seed);
    },
    [enrichBrief],
  );

  const submitCustomBrief = useCallback(
    async (kind: StrategyIntent, title: string, statement: string) => {
      const seed = analyzeStrategyBrief({ kind, title, statement });
      setBrief(seed);
      setState((current) => ({
        ...current,
        strategyApproved: false,
        metricReviewed: false,
      }));
      await enrichBrief(seed);
    },
    [enrichBrief],
  );

  const updateMetricTarget = useCallback((metricId: string, target: string) => {
    setBrief((current) => {
      if (!current) return current;
      return {
        ...current,
        targetsSkipped: false,
        metrics: current.metrics.map((metric) =>
          metric.id === metricId
            ? {
                ...metric,
                target,
                status: target.trim() ? "Confirmed" : "Proposed",
              }
            : metric,
        ),
      };
    });
  }, []);

  const addCatalogMetric = useCallback((metricId: string) => {
    const item = getMetricCatalogItem(metricId);
    if (!item) return;
    setBrief((current) => {
      const base = current ?? emptyMeasurementBrief();
      if (base.metrics.some((metric) => metric.id === metricId)) return base;
      return {
        ...base,
        metrics: [...base.metrics, proposalFromCatalogItem(item)],
      };
    });
    setState((current) => ({ ...current, metricReviewed: false }));
  }, []);

  const addCustomMetric = useCallback((draft: CustomMetricDraft) => {
    if (!draft.name.trim() || !draft.definition.trim()) return;
    const proposal = proposalFromCustomDraft(draft);
    setBrief((current) => {
      const base = current ?? emptyMeasurementBrief();
      return { ...base, metrics: [...base.metrics, proposal] };
    });
    setState((current) => ({ ...current, metricReviewed: false }));
  }, []);

  const removeMetric = useCallback((metricId: string) => {
    setBrief((current) => {
      if (!current) return current;
      return {
        ...current,
        metrics: current.metrics.filter((metric) => metric.id !== metricId),
      };
    });
    setState((current) => ({ ...current, metricReviewed: false }));
  }, []);

  const skipTargets = useCallback(() => {
    setBrief((current) => {
      if (!current) return current;
      return {
        ...current,
        targetsSkipped: true,
        metrics: current.metrics.map((metric) => ({
          ...metric,
          target: "",
          status: "Proposed" as const,
        })),
      };
    });
  }, []);

  const resetDemo = useCallback(() => {
    setState(initialProgress);
    setDataWorkspace(initialDataWorkspace);
    setDataError(null);
    setBrief(null);
    setStrategyError(null);
    setAnalyzingStrategy(false);
  }, []);

  const value = useMemo<DemoContextValue>(
    () => ({
      ...state,
      ...dataWorkspace,
      processingFiles,
      dataError,
      brief,
      analyzingStrategy,
      strategyError,
      processFiles,
      clearLocalData,
      selectCatalogItem,
      submitCustomBrief,
      updateMetricTarget,
      addCatalogMetric,
      addCustomMetric,
      removeMetric,
      skipTargets,
      approveStrategy: () => update({ strategyApproved: true }),
      reviewMetric: () => update({ metricReviewed: true }),
      confirmMapping: () => update({ mappingConfirmed: true }),
      runAnalysis,
      generateStory: () => update({ storyGenerated: true }),
      createPilot: () => update({ pilotCreated: true }),
      resetDemo,
      getStageStatus,
    }),
    [
      analyzingStrategy,
      brief,
      clearLocalData,
      dataError,
      dataWorkspace,
      getStageStatus,
      processFiles,
      processingFiles,
      resetDemo,
      runAnalysis,
      addCatalogMetric,
      addCustomMetric,
      removeMetric,
      selectCatalogItem,
      skipTargets,
      state,
      strategyError,
      submitCustomBrief,
      update,
      updateMetricTarget,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemo must be used inside DemoProvider");
  }
  return context;
}
