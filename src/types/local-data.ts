import type {
  ExecutiveInsight,
  FieldMapping,
  RecommendedAction,
  StorySlide,
} from "@/types/domain";

export type CellValue = string | number | boolean | null;
export type DataRow = Record<string, CellValue>;

export interface ColumnProfile {
  name: string;
  inferredType: "string" | "number" | "boolean" | "date" | "mixed";
  nullPercent: number;
  uniquePercent: number;
  canonicalField?: string;
  confidence?: number;
  likelyPii: boolean;
}

export interface DataHealthIssue {
  id: string;
  severity: "High" | "Medium" | "Low";
  title: string;
  detail: string;
  impact: string;
  recommendation: string;
}

export interface CountSegment {
  segment: string;
  count: number;
}

export interface DatasetAggregates {
  sampled: boolean;
  sampleRows: number;
  encoding?: string;
  uniqueEmployees: number;
  monthlyHeadcount: Array<{ month: string; count: number }>;
  statusCounts: Record<string, number>;
  latestMonth?: string;
  latestMonthSegmentField?: string;
  latestMonthSegments?: CountSegment[];
  mixCounts?: Record<string, CountSegment[]>;
  hireYearCounts?: Array<{ year: string; count: number }>;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  headerLayout?: "single" | "section_then_fields";
}

export interface LocalDataset {
  id: string;
  name: string;
  size: number;
  sheetName?: string;
  entity: string;
  grain: string;
  rows: DataRow[];
  rowCount: number;
  columns: ColumnProfile[];
  mappings: FieldMapping[];
  timeRange: string;
  health: number;
  mappingStatus: "Mapped" | "Review" | "Needs input";
  issues: DataHealthIssue[];
  aggregates?: DatasetAggregates;
}

export interface ReadinessAssessment {
  overall: number;
  scores: Record<string, number>;
  answerability: number;
  canAnswer: string[];
  cannotAnswer: string[];
}

export interface FunnelStep {
  stage: string;
  count: number;
  conversionFromPrior: number;
  conversionFromApplication: number;
}

export interface MeasuredStage {
  stage: string;
  medianDays: number;
  sampleSize: number;
}

export interface SegmentMetric {
  segment: string;
  medianDays: number;
  hires: number;
}

export interface SourceMetric {
  source: string;
  applications: number;
  hires: number;
  hireRate: number;
}

export interface DashboardPoint {
  label: string;
  value: number;
}

export interface MetricDashboard {
  id: string;
  metricId: string;
  name: string;
  role: "Outcome" | "Guardrail" | "Driver";
  status: "calculated" | "partial" | "unanswerable";
  sentence: string;
  value: string;
  unit: string;
  target: string;
  chartTitle: string;
  chartUnit: string;
  points: DashboardPoint[];
  missingFields: string[];
  sourceNote: string;
}

export interface WorkforceAnalysis {
  generatedAt: string;
  sourceDatasetNames: string[];
  question: string;
  dashboards: MetricDashboard[];
  metricName: "Time to Fill" | "Time to Hire" | "Headcount" | "Workforce mix";
  metricDefinition: string;
  headlineValue: string;
  valueCaption: string;
  currentDays: number | null;
  targetDays: number;
  comparisonValid: boolean;
  gapDays: number | null;
  sampleSize: number;
  chartTitle: string;
  chartUnit: string;
  chartPoints: Array<{ stage: string; medianDays: number }>;
  stageDurations: MeasuredStage[];
  funnelTitle: string;
  segmentTitle: string;
  funnel: FunnelStep[];
  segments: SegmentMetric[];
  sources: SourceMetric[];
  readiness: ReadinessAssessment;
  insight: ExecutiveInsight;
  storySlides: StorySlide[];
  action: RecommendedAction;
  sourceNote: string;
}

export interface LocalDataWorkspace {
  datasets: LocalDataset[];
  readiness: ReadinessAssessment | null;
  analysis: WorkforceAnalysis | null;
  processedAt: string | null;
}
