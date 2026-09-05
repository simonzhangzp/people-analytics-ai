import { describe, expect, it } from "vitest";
import { resolveLlmInvocation } from "./llm-invocation";

describe("resolveLlmInvocation", () => {
  it("marks chips as skipped_by_design", () => {
    const state = resolveLlmInvocation({ llmEligible: false, llmCalls: 0 });
    expect(state).toMatchObject({
      llm_invocation: "skipped_by_design",
      failure_reason: null,
      llm_skipped: null,
      llm_used: false,
      llm_calls: 0,
    });
  });

  it("marks a ledger refusal as skipped_by_budget, not failed", () => {
    const state = resolveLlmInvocation({
      llmEligible: true,
      llmSkipped: "per_ip_daily",
    });
    expect(state).toMatchObject({
      llm_invocation: "skipped_by_budget",
      failure_reason: null,
      llm_skipped: "per_ip_daily",
      llm_used: false,
    });
  });

  it("marks a successful planner pass as attempted_ok", () => {
    const state = resolveLlmInvocation({ llmEligible: true, llmCalls: 1 });
    expect(state).toMatchObject({
      llm_invocation: "attempted_ok",
      failure_reason: null,
      llm_used: true,
      llm_calls: 1,
    });
  });

  it("requires a classified failure_reason for attempted_failed", () => {
    const state = resolveLlmInvocation({
      llmEligible: true,
      llmSkipped: "upstream_timeout",
    });
    expect(state.llm_invocation).toBe("attempted_failed");
    expect(state.failure_reason).toBe("upstream_timeout");
  });
});
