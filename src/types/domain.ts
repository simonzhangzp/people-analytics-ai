export type WorkflowStageId =
  | "strategy"
  | "measurement"
  | "data"
  | "analysis"
  | "story"
  | "actions";

export type WorkflowStatus =
  | "Not started"
  | "In progress"
  | "Ready"
  | "Needs input"
  | "Approved";

export type Confidence = "High" | "Medium" | "Low";

export interface WorkflowStage {
  id: WorkflowStageId;
  label: string;
  eyebrow: string;
  status: WorkflowStatus;
}

export interface StrategicObjective {
  id: string;
  title: string;
  originalText: string;
  refinedObjective: string;
  businessOutcome: string;
  population: string;
  baseline: number;
  target: number;
  unit: string;
  deadline: string;
  status: "Proposed" | "Approved";
  guardrails: string[];
}

export interface MetricDefinition {
  id: string;
  name: string;
  category: "Outcome" | "Guardrail" | "Driver";
  currentValue: string;
  target?: string;
  trend: string;
  definition: string;
  formula: string;
  requiredFields: string[];
  status: "Proposed" | "Needs Review" | "Approved";
  version: string;
  confidence: Confidence;
}

export interface DatasetProfile {
  id: string;
  name: string;
  entity: string;
  grain: string;
  rows: number;
  timeRange: string;
  health: number;
  mappingStatus: "Mapped" | "Review" | "Needs input";
}

export interface FieldMapping {
  id: string;
  sourceField: string;
  proposedMeaning: string;
  canonicalField: string;
  confidence: number;
  status: "Confirmed" | "Review";
}

export interface StageDuration {
  stage: string;
  currentDays: number;
  targetDays: number;
}

export interface StageContribution extends StageDuration {
  excessDays: number;
  contributionPercent: number;
}

export interface TimeToFillAnalysis {
  currentDays: number;
  targetDays: number;
  gapDays: number;
  primaryDriver: StageContribution;
  stageContributions: StageContribution[];
}

export interface ExecutiveInsight {
  headline: string;
  evidence: string[];
  limitation: string;
  confidence: Confidence;
  metricVersion: string;
}

export interface StorySlide {
  id: number;
  kicker: string;
  headline: string;
  visual: "summary" | "bar" | "segments" | "answerability" | "actions";
  facts: string[];
}

export interface RecommendedAction {
  title: string;
  evidence: string;
  hypothesis: string;
  owner: string;
  population: string;
  successMetric: string;
  guardrail: string;
  duration: string;
}
