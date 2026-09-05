export type PeopleDemoCase = "trust" | "incident" | "attrition";

export const CASE_FOLLOW_UPS: Record<PeopleDemoCase, string[]> = {
  trust: [
    "How is Headcount defined?",
    "What is current Engineering headcount?",
    "Who owns this metric?",
    "What quality tests ran?",
  ],
  incident: [
    "Why did APAC headcount drop?",
    "Was this published as a workforce change?",
    "Which metrics were affected?",
    "What does the lineage show?",
  ],
  attrition: [
    "Show me the tenure breakdown",
    "What about compensation?",
    "Which locations matter most?",
    "How is voluntary attrition defined?",
    "What should we investigate next?",
    "Which critical skills have the largest gaps?",
  ],
};

export interface PeopleAskAnswer {
  question: string;
  supported: boolean;
  headline: string;
  facts: string[];
  interpretation: string[];
  quality_status: string;
  freshness: unknown;
  definition?: unknown;
  evidence: unknown[];
  lineage?: unknown;
  tools_used: string[];
  trace_id?: string;
  tier?: 1 | 2 | "refuse";
  identity_id?: string;
  snapshot?: {
    pointer_id: string;
    run_id: string;
    as_of: string;
  };
  observed?: {
    headline: string;
    facts: Array<{ text: string; metric_id?: string; value?: number | null }>;
  };
  hypotheses?: string[];
  suppressed_cells?: Array<{ key?: string; n?: number | null; min_cell?: number }>;
  skills_used?: string[];
  critic?: { ok: boolean; failures: string[] };
  error_state?: "rpc" | "critic" | null;
  withheld?: boolean;
  llm_skipped?: string | null;
  trace?: {
    tools: Array<{
      seq: number;
      name: string;
      args: Record<string, unknown>;
      latency_ms: number;
      ok: boolean;
      rpc?: string;
      error?: string;
    }>;
    latency_ms: number;
    llm_skipped: string | null;
    llm_calls: number;
  };
}
