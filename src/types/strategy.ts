import type { Confidence } from "@/types/domain";

export type StrategyIntent = "strategy" | "problem";

export type StrategyCategory =
  | "Talent Acquisition"
  | "Retention"
  | "Skills & Capability"
  | "Leadership"
  | "Internal Mobility"
  | "Engagement & Culture"
  | "DEI"
  | "Workforce Planning"
  | "Compensation"
  | "Performance"
  | "Wellbeing"
  | "People Operations";

export type MetricRole = "Outcome" | "Guardrail" | "Driver";

export interface MetricTemplate {
  id: string;
  name: string;
  category: MetricRole;
  definition: string;
  measurementStandard: string;
  formula: string;
  unit: string;
  requiredFields: string[];
  suggestedTarget: string;
  confidence: Confidence;
}

export interface MetricCatalogItem extends MetricTemplate {
  domain: StrategyCategory;
  source: string;
  sourceUrl: string;
}

export interface CustomMetricDraft {
  name: string;
  definition: string;
  measurementStandard: string;
  formula: string;
  unit: string;
  category: MetricRole;
  domain: StrategyCategory;
  suggestedTarget: string;
  requiredFields: string;
}

export interface CatalogItem {
  id: string;
  kind: StrategyIntent;
  category: StrategyCategory;
  title: string;
  statement: string;
  source: string;
  sourceUrl: string;
  metricIds: string[];
  population?: string;
}

export interface MetricProposal {
  id: string;
  name: string;
  category: MetricRole;
  definition: string;
  measurementStandard: string;
  formula: string;
  unit: string;
  requiredFields: string[];
  suggestedTarget: string;
  target: string;
  confidence: Confidence;
  status: "Proposed" | "Confirmed";
  origin: "catalog" | "ai" | "custom";
}

export interface StrategyAnalysis {
  summary: string;
  decisions: string[];
  assumptions: string[];
  missingEvidence: string[];
  source: "catalog" | "ai" | "mixed";
  modelNote: string;
}

export interface StrategyBrief {
  intentKind: StrategyIntent;
  source: "catalog" | "custom";
  catalogId?: string;
  category: StrategyCategory | "Custom";
  title: string;
  statement: string;
  population: string;
  analysis: StrategyAnalysis | null;
  metrics: MetricProposal[];
  targetsSkipped: boolean;
}

export interface StrategyWorkspaceState {
  brief: StrategyBrief | null;
  analyzing: boolean;
  analysisError: string | null;
  strategyApproved: boolean;
  metricReviewed: boolean;
}
