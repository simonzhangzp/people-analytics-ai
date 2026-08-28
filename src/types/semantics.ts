export type PeopleDataShape = "row-level" | "aggregate";

export type PeopleTableType =
  | "employee_roster"
  | "employee_snapshot"
  | "employee_outcome"
  | "termination_event"
  | "requisition"
  | "candidate_application"
  | "compensation"
  | "performance_review"
  | "absence"
  | "engagement_survey"
  | "learning_record"
  | "mobility"
  | "demographics"
  | "aggregate_people_fact"
  | "unknown";

export type SemanticRole =
  | "entity_id"
  | "person_id"
  | "event_id"
  | "period"
  | "event_date"
  | "as_of_date"
  | "status"
  | "category"
  | "measure"
  | "numerator"
  | "denominator"
  | "rating"
  | "amount"
  | "sensitive_dimension"
  | "pii"
  | "ignore";

export interface IdentityBinding {
  sourceName: string;
  canonicalField?: string;
  entity: "employee" | "candidate" | "requisition" | "application" | "event";
  coverage: number;
  uniqueness: number;
  confidence: number;
}

export interface TimeBinding {
  sourceName: string;
  canonicalField?: string;
  role: "period" | "event_date" | "as_of_date";
  min?: string;
  max?: string;
  distinctCount: number;
  grain: "day" | "month" | "quarter" | "year" | "unknown";
  confidence: number;
}

export interface PopulationSpec {
  id: string;
  label: string;
  sourceField?: string;
  value?: string;
  confidence: number;
  status: "Proposed" | "Needs Review" | "Approved";
  evidence: string[];
}

export interface DateWindow {
  id: string;
  label: string;
  start?: string;
  end?: string;
  basis:
    | "as_of"
    | "snapshot_pair"
    | "event_range"
    | "reported_period"
    | "full_span";
  sourceField?: string;
  status: "Proposed" | "Needs Review" | "Approved";
}

export interface TableContract {
  datasetId: string;
  tableType: PeopleTableType;
  dataShape: PeopleDataShape;
  domains: string[];
  confidence: number;
  identity?: IdentityBinding;
  time?: TimeBinding;
  populationCandidates: PopulationSpec[];
  dateWindows: DateWindow[];
  alternatives: Array<{
    tableType: PeopleTableType;
    score: number;
    reason: string;
  }>;
  status: "Proposed" | "Needs Review" | "Approved";
  evidence: string[];
}

export type GenericAnalysisOperation =
  | "summary"
  | "distribution"
  | "validate_trend"
  | "compare_periods"
  | "segment"
  | "contribution"
  | "association"
  | "duration"
  | "funnel"
  | "rate"
  | "data_gap";

export interface CapabilityReport {
  id: string;
  domain:
    | "workforce"
    | "retention"
    | "recruiting"
    | "compensation"
    | "performance"
    | "absence"
    | "engagement"
    | "learning"
    | "mobility"
    | "diversity";
  metricKey: string;
  metricName: string;
  runnable: boolean;
  datasetIds: string[];
  supportedOperations: GenericAnalysisOperation[];
  missing: string[];
  assumptions: string[];
  confidence: "High" | "Medium" | "Low";
  population: PopulationSpec;
  currentWindow?: DateWindow;
  comparisonWindow?: DateWindow;
}
