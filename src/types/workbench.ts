import type { DataRow } from "@/types/local-data";
import type {
  CapabilityReport,
  SemanticRole,
  TableContract,
} from "@/types/semantics";

export type WorkbenchView = "data" | "metrics" | "analysis" | "story";

export type KnowledgeStatus =
  | "Proposed"
  | "Needs Review"
  | "Approved"
  | "Superseded";

export type ConfidenceLevel = "High" | "Medium" | "Low";

export type PeopleDomain =
  | "workforce"
  | "retention"
  | "recruiting"
  | "mobility"
  | "compensation"
  | "performance"
  | "absence"
  | "engagement"
  | "learning"
  | "diversity"
  | "other";

export type ColumnDataType =
  | "string"
  | "number"
  | "date"
  | "boolean"
  | "unknown";

export interface ColumnProfile {
  sourceName: string;
  sourceIndex?: number;
  inferredType: ColumnDataType;
  rowCount: number;
  nullCount: number;
  nullPct: number;
  distinctCount: number;
  distinctPct: number;
  min?: number | string;
  max?: number | string;
  likelyPII: boolean;
  sensitive?: boolean;
  canonicalField?: string;
  semanticRole?: SemanticRole;
  semanticMeaning?: string;
  confidence?: number;
}

export interface GrainDefinition {
  label: string;
  keys: string[];
  evidence: string[];
}

export interface DataQualityIssue {
  id: string;
  severity: "High" | "Medium" | "Low";
  title: string;
  detail: string;
  impact: string;
  recommendation: string;
}

export interface SafeDatasetProfile {
  fileName: string;
  rowCount: number;
  columnCount: number;
  inferredType: string;
  grain: string;
  grainConfidence: number;
  timeRange?: string;
  columns: Array<
    Pick<
      ColumnProfile,
      | "sourceName"
      | "inferredType"
      | "nullPct"
      | "distinctPct"
      | "likelyPII"
      | "sensitive"
      | "canonicalField"
      | "semanticRole"
      | "semanticMeaning"
      | "confidence"
    >
  >;
}

export interface DatasetMetadata {
  id: string;
  name: string;
  sourceFileName?: string;
  sheetName?: string;
  fingerprint: string;
  localTableName: string;
  fileSize: number;
  rowCount: number;
  inferredType: string;
  typeConfidence: number;
  grain: GrainDefinition;
  grainConfidence: number;
  columns: ColumnProfile[];
  timeRange?: string;
  healthScore: number;
  issues: DataQualityIssue[];
  status: KnowledgeStatus;
  tableContract?: TableContract;
  safeProfile: SafeDatasetProfile;
}

export interface LocalWorkbenchDataset {
  metadata: DatasetMetadata;
  /**
   * A bounded local-only sample used by the embedded explorer. It must never be
   * included in AI or persistence payloads.
   */
  explorationRows: DataRow[];
}

export interface FieldMapping {
  id: string;
  datasetId: string;
  sourceColumn: string;
  semanticMeaning: string;
  canonicalField?: string;
  confidence: number;
  status: KnowledgeStatus;
}

export interface DatasetRelationship {
  id: string;
  fromDatasetId: string;
  fromField: string;
  toDatasetId: string;
  toField: string;
  cardinality: "1:1" | "1:N" | "N:1" | "N:N" | "unknown";
  matchRate: number;
  confidence: number;
  status: KnowledgeStatus;
  evidence: string[];
  conflicts: string[];
}

export type MetricRuleOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "is_null"
  | "is_not_null"
  | "before"
  | "after";

export interface MetricRule {
  field: string;
  operator: MetricRuleOperator;
  value?: string | number | boolean | Array<string | number>;
  label: string;
}

export type MetricExpression =
  | {
      kind: "count";
      entity:
        | "employee"
        | "exit"
        | "hire"
        | "application"
        | "requisition"
        | "review"
        | "absence"
        | "survey_response"
        | "learning_record"
        | "mobility_event"
        | "aggregate_record";
      distinctField?: string;
      rules?: MetricRule[];
    }
  | {
      kind: "average";
      field: string;
      rules?: MetricRule[];
    }
  | {
      kind: "sum";
      field: string;
      rules?: MetricRule[];
    }
  | {
      kind: "ratio";
      numerator: MetricExpression;
      denominator: MetricExpression;
      multiplier: number;
    }
  | {
      kind: "duration";
      startField: string;
      endField: string;
      aggregation: "mean" | "median";
    };

export interface MetricDefinition {
  id: string;
  key: string;
  name: string;
  domain: PeopleDomain;
  description: string;
  numerator?: MetricExpression;
  denominator?: MetricExpression;
  formula: MetricExpression;
  inclusions: MetricRule[];
  exclusions: MetricRule[];
  startEvent?: string;
  endEvent?: string;
  timeBasis?: string;
  sourceFields: string[];
  dimensions: string[];
  status: KnowledgeStatus;
  confidence: ConfidenceLevel;
  version: number;
  approvedAt?: string;
}

export interface MetricPatchItem {
  field:
    | "numerator"
    | "denominator"
    | "formula"
    | "inclusions"
    | "exclusions"
    | "timeBasis"
    | "startEvent"
    | "endEvent";
  label: string;
  before?: string;
  after: string;
}

export interface MetricPatch {
  metricId: string;
  summary: string;
  items: MetricPatchItem[];
  nextDefinition: MetricDefinition;
  status: "Ready to apply" | "Applied" | "Cancelled";
}

export interface MetricAmbiguity {
  id: string;
  metricId: string;
  question: string;
  whyItMatters: string;
  options: Array<{ id: string; label: string; value: string }>;
  selectedOptionId?: string;
  status: "Open" | "Resolved";
}

export interface AnalysisQuestion {
  id: string;
  text: string;
  metricIds: string[];
  createdAt: string;
}

export type QueryDifficulty = "simple" | "semantic" | "diagnostic";

export interface ResolvedQueryIntent {
  id: string;
  difficulty: QueryDifficulty;
  domain: Exclude<PeopleDomain, "other">;
  metricKey: string;
  datasetId: string;
  aggregation: "count" | "count_distinct" | "sum";
  measureField?: string;
  dimensions: string[];
  profileDimensions: string[];
  exploreDimensions?: string[];
  dimensionFilters?: Array<{
    field: string;
    values: string[];
  }>;
  seriesValues: string[];
  timeField?: string;
  timeStrategy: "latest" | "all";
  limit?: number;
  populationHint?: "all" | "leadership";
  inheritedFromTurnId?: string;
  assumptions: string[];
  confidence: ConfidenceLevel;
}

export interface DataThreadTurn {
  id: string;
  parentTurnId?: string;
  question: string;
  status: "running" | "needs_confirmation" | "complete" | "blocked";
  intent?: ResolvedQueryIntent;
  insightIds: string[];
  metricId?: string;
  methodNote?: string;
  provisional?: boolean;
  definitionAmbiguity?: MetricAmbiguity;
  createdAt: string;
}

export interface AnalysisStep {
  id: string;
  objective: string;
  operation:
    | "validate_trend"
    | "segment"
    | "compare_periods"
    | "contribution"
    | "association"
    | "summary"
    | "distribution"
    | "duration"
    | "funnel"
    | "rate"
    | "data_gap";
  metricId?: string;
  dimensions?: string[];
  status: "planned" | "running" | "complete" | "blocked";
  blockedReason?: string;
}

export interface AnalysisPlan {
  id: string;
  questionId: string;
  summary: string;
  steps: AnalysisStep[];
  createdAt: string;
}

export type ChartKind = "line" | "bar" | "stacked-bar" | "scatter" | "table";

export interface ChartDatum {
  label: string;
  value: number;
  secondaryValue?: number;
  group?: string;
}

export interface InsightChartSpec {
  kind: ChartKind;
  title: string;
  xLabel?: string;
  yLabel?: string;
  unit: "people" | "percent" | "percentage points" | "days" | "ratio";
  data: ChartDatum[];
}

export interface EvidenceItem {
  id: string;
  label: string;
  value: string;
  detail?: string;
  sourceDatasetIds: string[];
}

export interface Insight {
  id: string;
  questionId: string;
  branchKey: string;
  headline: string;
  finding: string;
  metricIds: string[];
  filters: Record<string, string | number | boolean | string[]>;
  period?: string;
  comparisonPeriod?: string;
  population: string;
  evidence: EvidenceItem[];
  chartSpec?: InsightChartSpec;
  confidence: ConfidenceLevel;
  limitations: string[];
  suggestedFollowUps: Array<{
    key: Insight["branchKey"];
    label: string;
    available: boolean;
    unavailableReason?: string;
  }>;
  selectedForExecutiveStory: boolean;
  validated: boolean;
}

export interface ExecutiveSlide {
  id: string;
  index: number;
  kicker: string;
  headline: string;
  insightIds: string[];
  chartSpec?: InsightChartSpec;
  evidence: string[];
  sourceNote: string;
  limitation?: string;
}

export type StorySlideCount = 3 | 5 | 7;

export interface ExecutiveStory {
  id: string;
  workspaceId: string;
  audience:
    | "CHRO"
    | "HR Leadership Team"
    | "Business Leadership"
    | "TA Leadership"
    | "People Analytics Leadership";
  purpose: "Inform" | "Diagnose" | "Recommend action" | "Strategy review";
  slideCount: StorySlideCount;
  slides: ExecutiveSlide[];
  status: KnowledgeStatus;
  createdAt: string;
}

export type AIInterventionKind =
  | "Proposal"
  | "Needs confirmation"
  | "Data gap"
  | "Recommendation"
  | "Applied"
  | "Warning";

export interface AIIntervention {
  id: string;
  kind: AIInterventionKind;
  title: string;
  body: string;
  rationale?: string;
  actions?: Array<{ id: string; label: string; intent: string }>;
  createdAt: string;
}

export interface WorkbenchProgress {
  data: "Not started" | "In progress" | "Ready" | "Needs input";
  metrics: "Not started" | "In progress" | "Ready" | "Needs input";
  analysis: "Not started" | "In progress" | "Ready" | "Blocked";
  story: "Not started" | "In progress" | "Ready";
}

export interface WorkbenchState {
  workspaceId: string;
  workspaceName: string;
  activeView: WorkbenchView;
  datasets: LocalWorkbenchDataset[];
  fieldMappings: FieldMapping[];
  relationships: DatasetRelationship[];
  capabilities: CapabilityReport[];
  activeCapabilityId: string | null;
  question: AnalysisQuestion | null;
  metrics: MetricDefinition[];
  activeMetricId: string | null;
  ambiguity: MetricAmbiguity | null;
  pendingMetricPatch: MetricPatch | null;
  analysisPlan: AnalysisPlan | null;
  insights: Insight[];
  thread: DataThreadTurn[];
  activeTurnId: string | null;
  story: ExecutiveStory | null;
  interventions: AIIntervention[];
  progress: WorkbenchProgress;
  engineStatus: "idle" | "loading" | "ready" | "error";
  persistenceStatus: "local-only" | "syncing" | "synced" | "unavailable";
}

