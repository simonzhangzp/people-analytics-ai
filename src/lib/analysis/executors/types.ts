import type {
  AnalysisPlan,
  AnalysisQuestion,
  Insight,
  LocalWorkbenchDataset,
  MetricDefinition,
  PeopleDomain,
} from "@/types/workbench";
import type {
  CapabilityReport,
  GenericAnalysisOperation,
} from "@/types/semantics";

export type SupportedAnalysisDomain = Exclude<PeopleDomain, "other">;

export interface AnalysisExecutionContext {
  question: AnalysisQuestion;
  capability: CapabilityReport;
  metric: MetricDefinition;
  datasets: LocalWorkbenchDataset[];
  plan: AnalysisPlan;
}

export interface DeterministicAnalysisOutput {
  plan: AnalysisPlan;
  insights: Insight[];
}

export interface DomainExecutor {
  domain: SupportedAnalysisDomain;
  requiredRoles: string[];
  metricKeys: string[];
  periodStrategy:
    | "as-of"
    | "event"
    | "reported-period"
    | "survey-wave"
    | "none";
  minSampleSize: number;
  branches: string[];
  limitations: string[];
  operations: GenericAnalysisOperation[];
  execute(
    context: AnalysisExecutionContext,
  ): Promise<DeterministicAnalysisOutput>;
}
