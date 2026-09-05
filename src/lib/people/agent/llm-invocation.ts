export const LLM_INVOCATIONS = [
  "skipped_by_design",
  "skipped_by_budget",
  "attempted_ok",
  "attempted_failed",
] as const;

export type LlmInvocation = (typeof LLM_INVOCATIONS)[number];

export const LLM_BUDGET_NOTICE =
  "The free-form demo has reached today's limit for this network. The six prepared questions below still work.";

const BUDGET_REASONS = new Set([
  "per_ip_daily",
  "site_rolling_30d",
  "per_route_daily",
  "ledger_write_failed",
  "ip_hash_secret_missing",
  "budget",
  "serving_unconfigured",
]);

export type LlmInvocationState = {
  llm_invocation: LlmInvocation;
  failure_reason: string | null;
  llm_skipped: string | null;
  llm_used: boolean;
  llm_calls: number;
};

export function resolveLlmInvocation(input: {
  llmEligible: boolean;
  llmCalls?: number;
  llmSkipped?: string | null;
}): LlmInvocationState {
  const calls = Number(input.llmCalls) > 0 ? Number(input.llmCalls) : 0;
  if (calls > 0) {
    return {
      llm_invocation: "attempted_ok",
      failure_reason: null,
      llm_skipped: null,
      llm_used: true,
      llm_calls: calls,
    };
  }
  if (!input.llmEligible) {
    return {
      llm_invocation: "skipped_by_design",
      failure_reason: null,
      llm_skipped: null,
      llm_used: false,
      llm_calls: 0,
    };
  }
  const skipped = input.llmSkipped?.trim() || null;
  if (skipped && BUDGET_REASONS.has(skipped)) {
    return {
      llm_invocation: "skipped_by_budget",
      failure_reason: null,
      llm_skipped: skipped,
      llm_used: false,
      llm_calls: 0,
    };
  }
  if (skipped) {
    return {
      llm_invocation: "attempted_failed",
      failure_reason: skipped,
      llm_skipped: skipped,
      llm_used: false,
      llm_calls: 0,
    };
  }
  return {
    llm_invocation: "skipped_by_design",
    failure_reason: null,
    llm_skipped: null,
    llm_used: false,
    llm_calls: 0,
  };
}
