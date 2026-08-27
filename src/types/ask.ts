export type AskScenario =
  | "talent_review"
  | "recruiting"
  | "headcount"
  | "roster"
  | "generic";

export type AskEvidenceKind = "proposal" | "assumption" | "approved" | "missing";

export type AskInsightIcon =
  | "alert"
  | "check"
  | "users"
  | "target"
  | "clock"
  | "shield";

export interface AskConfirmationChoice {
  id: string;
  label: string;
}

export interface AskDefinition {
  id: string;
  label: string;
  why: string;
  kind: AskEvidenceKind;
  options: AskConfirmationChoice[];
}

export interface AskColumnUsed {
  source: string;
  meaning: string;
  fillRate: number;
}

export interface AskMetric {
  name: string;
  formula: string;
  value: string;
  status: "calculated" | "assumption";
}

export interface AskInsight {
  id: string;
  icon: AskInsightIcon;
  title: string;
  body: string;
  evidence: string;
}

export interface AskFileResult {
  scenario: AskScenario;
  suggestedQuestion: string;
  question: string;
  fileSummary: string;
  structure: string;
  qualityScore: number;
  qualityCaption: string;
  answerable: boolean;
  conclusion: string;
  columnsUsed: AskColumnUsed[];
  metrics: AskMetric[];
  pendingDefinitions: AskDefinition[];
  assumptions: string[];
  approvedDefinitions: string[];
  missingEvidence: string[];
  headerLayout: "single" | "section_then_fields";
}

export type AskConfirmations = Record<string, string>;
