export const LLM_INVOCATIONS = [
  "skipped_by_design",
  "skipped_by_budget",
  "attempted_ok",
  "attempted_failed",
] as const;

export type LlmInvocation = (typeof LLM_INVOCATIONS)[number];

export const FAILURE_REASONS = [
  "upstream_timeout",
  "upstream_error",
  "upstream_refusal",
  "internal_code_error",
  "schema_violation",
] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number];

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

const FAILURE_SET = new Set<string>(FAILURE_REASONS);

export type LlmInvocationState = {
  llm_invocation: LlmInvocation;
  failure_reason: string | null;
  llm_skipped: string | null;
  llm_used: boolean;
  llm_calls: number;
};

export type PlannerFailureClass = {
  failure_reason: FailureReason;
  llm_skipped: FailureReason;
  internal: { type: string; frame: string } | null;
};

function firstStackFrame(stack?: string): string {
  const line = (stack ?? "").split("\n").map((row) => row.trim()).find((row) => row.startsWith("at "));
  return line ?? "";
}

export function classifyPlannerFailure(error: unknown): PlannerFailureClass {
  if (!(error instanceof Error)) {
    return {
      failure_reason: "internal_code_error",
      llm_skipped: "internal_code_error",
      internal: { type: typeof error, frame: "" },
    };
  }
  const name = error.name || "Error";
  const message = error.message || "";
  if (
    name === "ReferenceError" ||
    name === "TypeError" ||
    name === "SyntaxError" ||
    name === "RangeError" ||
    name === "EvalError" ||
    name === "URIError"
  ) {
    return {
      failure_reason: "internal_code_error",
      llm_skipped: "internal_code_error",
      internal: { type: name, frame: firstStackFrame(error.stack) },
    };
  }
  if (name === "ZodError" || message.startsWith("llm_schema")) {
    return {
      failure_reason: "schema_violation",
      llm_skipped: "schema_violation",
      internal: null,
    };
  }
  if (message.startsWith("llm_timeout") || message === "upstream_timeout") {
    return { failure_reason: "upstream_timeout", llm_skipped: "upstream_timeout", internal: null };
  }
  if (message.startsWith("llm_refusal") || message === "upstream_refusal") {
    return { failure_reason: "upstream_refusal", llm_skipped: "upstream_refusal", internal: null };
  }
  if (message.startsWith("llm_")) {
    return { failure_reason: "upstream_error", llm_skipped: "upstream_error", internal: null };
  }
  return {
    failure_reason: "internal_code_error",
    llm_skipped: "internal_code_error",
    internal: { type: name, frame: firstStackFrame(error.stack) },
  };
}

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
  if (skipped && FAILURE_SET.has(skipped)) {
    return {
      llm_invocation: "attempted_failed",
      failure_reason: skipped,
      llm_skipped: skipped,
      llm_used: false,
      llm_calls: 0,
    };
  }
  if (skipped) {
    return {
      llm_invocation: "attempted_failed",
      failure_reason: "upstream_error",
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
