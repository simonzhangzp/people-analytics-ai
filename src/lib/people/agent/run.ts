import { randomUUID } from "node:crypto";
import { DEMO_IDENTITIES, DEFAULT_IDENTITY } from "../demo-identities";
import type { PeopleAskAnswer, PeopleDemoCase } from "../ask-types";
import { peopleWriteAgentToolCall, peopleWriteAgentTrace } from "../v2-client";
import { clientIpFromHeaders, completeLlmBudget, hashClientIp, tryConsumeLlmBudget } from "./budget";
import { applyCritic, criticCheck } from "./critic";
import { composeAnswerContract } from "./compose";
import { deepSeekPlanner, type PeoplePlanner } from "./planner";
import { executeRegistryTool } from "./registry";
import { routePeopleQuestion } from "./router";
import { PEOPLE_TOOL_NAMES, type PeopleAnswerContract, type PeopleToolCall } from "./types";
import { resolveLlmInvocation, classifyPlannerFailure } from "./llm-invocation";
import { wrapUntrustedToolData } from "./wrap-data";

const ALLOWED_IDENTITIES = new Set<string>(DEMO_IDENTITIES.map((row) => row.identity_id));

export function resolveAskIdentity(raw?: string | null): string {
  const id = raw?.trim() || DEFAULT_IDENTITY;
  return ALLOWED_IDENTITIES.has(id) ? id : DEFAULT_IDENTITY;
}

async function runTools(input: {
  tools: PeopleToolCall[];
  identityId: string;
  traceId: string;
  allowReplay: boolean;
  purpose: "agent" | "mcp";
}): Promise<Array<{ call: PeopleToolCall; result: unknown; ok: boolean; error?: string; latency_ms: number; rpc: string }>> {
  const out = [];
  for (const [index, call] of input.tools.entries()) {
    const started = Date.now();
    const executed = await executeRegistryTool({
      call,
      identityId: input.identityId,
      purpose: input.purpose,
      traceId: input.traceId,
      allowReplay: input.allowReplay,
    });
    const latency = Date.now() - started;
    const row = executed.ok
      ? { call, result: executed.result, ok: true as const, latency_ms: latency, rpc: executed.rpc }
      : {
          call,
          result: { error: executed.error },
          ok: false as const,
          error: executed.error,
          latency_ms: latency,
          rpc: executed.rpc,
        };
    out.push(row);
    try {
      await peopleWriteAgentToolCall({
        traceId: input.traceId,
        seq: index + 1,
        toolName: call.name,
        args: call.args ?? {},
        resultSummary: executed.ok ? executed.summary : { error: executed.error },
        latencyMs: latency,
        rpc: executed.rpc,
        ok: executed.ok,
        error: executed.ok ? null : executed.error,
        identityId: input.identityId,
      });
    } catch {
      /* trace write is best-effort */
    }
  }
  return out;
}

export interface RunPeopleAgentOptions {
  question: string;
  identityId?: string | null;
  demoCase?: PeopleDemoCase;
  headers?: Headers;
  planner?: PeoplePlanner | null;
  consume?: typeof tryConsumeLlmBudget;
  forceRpcError?: boolean;
  injectToolResult?: (call: PeopleToolCall, result: unknown) => unknown;
  fixtureResults?: Array<{ call: PeopleToolCall; result: unknown; ok?: boolean }>;
}

export async function runPeopleAgent(options: RunPeopleAgentOptions): Promise<PeopleAnswerContract> {
  const started = Date.now();
  const identityId = resolveAskIdentity(options.identityId);
  const traceId = randomUUID();
  const plan = routePeopleQuestion(options.question, options.demoCase);
  const allowReplay = options.demoCase === "incident" || plan.snapshot_id === "incident_replay";

  if (!options.fixtureResults) {
    try {
      await peopleWriteAgentTrace({
        traceId,
        identityId,
        question: options.question,
        tier: String(plan.tier),
        snapshotId: plan.snapshot_id,
        llmCalls: 0,
      });
    } catch {
      /* ignore */
    }
  }

  let tools = plan.tools;
  let llmSkipped: string | null = null;
  let llmCalls = 0;
  let plannerHypotheses: string[] | undefined;
  let callId: number | null = null;
  let plannerInternal: { type: string; frame: string } | null = null;

  const injectedPlanner = options.planner;
  const livePlanner =
    injectedPlanner === undefined &&
    Boolean(process.env.DEEPSEEK_API_KEY?.trim() || process.env.DEEPSEEK_KEY?.trim());
  const useBudget = Boolean(options.consume) || livePlanner;

  async function invokePlanner(maxTokens: number) {
    const planner =
      injectedPlanner ??
      ((args: Parameters<NonNullable<PeoplePlanner>>[0]) =>
        deepSeekPlanner({
          question: args.question,
          registry: args.registry,
          skeleton: args.skeleton,
          evidence: [],
          maxTokens,
        }));
    return planner({
      question: options.question,
      registry: PEOPLE_TOOL_NAMES,
      skeleton: plan.tools,
      wrappedEvidence: wrapUntrustedToolData({ note: "pre-tool planning; no observed numbers yet" }),
      maxTokens,
    });
  }

  if (plan.llmEligible && plan.tools.length && injectedPlanner !== null && (injectedPlanner || livePlanner || useBudget)) {
    let allowed = !useBudget;
    let maxTokens = 1024;
    if (useBudget) {
      const ip =
        options.headers != null
          ? clientIpFromHeaders(options.headers)
          : { ip: "0.0.0.0", country: null };
      const ipHash = hashClientIp(ip.ip);
      if (!ipHash) {
        llmSkipped = "ip_hash_secret_missing";
      } else {
        const consume = options.consume ?? tryConsumeLlmBudget;
        const decision = await consume({
          ipHash,
          route: "people_ask",
          country: ip.country,
        });
        if (!decision.allowed) {
          llmSkipped = decision.blocked_by ?? "budget";
        } else {
          allowed = true;
          callId = decision.call_id;
          maxTokens = decision.max_tokens_per_call;
        }
      }
    }
    if (allowed && !llmSkipped) {
      const plannerStarted = Date.now();
      let planned = null;
      try {
        planned = await invokePlanner(maxTokens);
      } catch (error) {
        planned = null;
        const classified = classifyPlannerFailure(error);
        llmSkipped = classified.llm_skipped;
        plannerInternal = classified.internal;
      }
      const latency = Date.now() - plannerStarted;
      if (!planned) {
        llmSkipped = llmSkipped ?? "upstream_error";
        if (callId) {
          await completeLlmBudget({ callId, traceId, ok: false, latencyMs: latency, model: "deepseek-chat" });
        }
      } else {
        llmCalls = 1;
        plannerHypotheses = planned.hypotheses;
        if (callId) {
          await completeLlmBudget({
            callId,
            traceId,
            ok: true,
            latencyMs: latency,
            model: "deepseek-chat",
          });
        }
      }
    }
  }

  if (options.forceRpcError) {
    const llm = resolveLlmInvocation({ llmEligible: plan.llmEligible, llmCalls, llmSkipped });
    const failed = {
      question: options.question,
      supported: false,
      headline: "People serving could not complete this lookup. No substitute numbers were generated.",
      facts: ["A serving RPC failed. The answer is in an error state and does not include invented metric values."],
      interpretation: [],
      quality_status: "unknown",
      freshness: null,
      evidence: [],
      tools_used: [],
      trace_id: traceId,
      tier: plan.tier,
      identity_id: identityId,
      snapshot: { pointer_id: plan.snapshot_id, run_id: "data-v1", as_of: "2026-08-31" },
      observed: {
        headline: "People serving could not complete this lookup. No substitute numbers were generated.",
        facts: [],
      },
      hypotheses: [],
      suppressed_cells: [],
      skills_used: [],
      critic: { ok: true, failures: [] },
      error_state: "rpc" as const,
      withheld: false,
      llm_skipped: llm.llm_skipped,
      llm_invocation: llm.llm_invocation,
      failure_reason: llm.failure_reason,
      trace: {
        tools: [],
        latency_ms: Date.now() - started,
        llm_skipped: llm.llm_skipped,
        llm_calls: llm.llm_calls,
        llm_used: llm.llm_used,
        llm_invocation: llm.llm_invocation,
        failure_reason: llm.failure_reason,
      },
    };
    return failed;
  }

  const executed =
    options.fixtureResults?.length
      ? options.fixtureResults.map((row) => ({
          call: row.call,
          result: row.result,
          ok: row.ok !== false,
          latency_ms: 0,
          rpc: row.call.name,
        }))
      : tools.length === 0
      ? []
      : await runTools({
          tools,
          identityId,
          traceId,
          allowReplay,
          purpose: "agent",
        });

  const injected = options.injectToolResult
    ? executed.map((row) => ({
        ...row,
        result: options.injectToolResult!(row.call, row.result),
      }))
    : executed;

  const composed = composeAnswerContract({
    question: options.question,
    identityId,
    traceId,
    demoCase: options.demoCase,
    plan,
    tools,
    results: injected,
    hypotheses: plannerHypotheses,
    llmSkipped,
    llmCalls,
    latencyMs: Date.now() - started,
    toolTrace: injected.map((row, seq) => ({
      seq: seq + 1,
      name: row.call.name,
      args: (row.call.args ?? {}) as Record<string, unknown>,
      latency_ms: row.latency_ms,
      ok: row.ok,
      rpc: row.rpc,
      error: "error" in row ? row.error : undefined,
    })),
  });

  const critic = criticCheck({
    observed: composed.observed,
    evidence: composed.evidence,
  });
  const answer = applyCritic({ ...composed, critic: { ok: true, failures: [] } }, critic);

  if (!options.fixtureResults) {
    try {
      await peopleWriteAgentTrace({
        traceId,
        identityId,
        question: options.question,
        tier: String(plan.tier),
        snapshotId: plan.snapshot_id,
        latencyMs: Date.now() - started,
        llmCalls,
        criticOk: answer.critic.ok,
        llmSkipped,
        answerSummary: {
          quality_status: answer.quality_status,
          withheld: answer.withheld,
          error_state: answer.error_state,
          headline: answer.observed.headline.slice(0, 240),
          llm_invocation: answer.llm_invocation,
          failure_reason: answer.failure_reason,
          ...(plannerInternal
            ? { internal_error_type: plannerInternal.type, internal_error_frame: plannerInternal.frame }
            : {}),
        },
      });
    } catch {
      /* ignore */
    }
  }

  return answer;
}

export function toAskAnswer(answer: PeopleAnswerContract): PeopleAskAnswer {
  return {
    question: answer.question,
    supported: answer.supported,
    headline: answer.headline,
    facts: answer.facts,
    interpretation: answer.interpretation,
    quality_status: answer.quality_status,
    freshness: answer.freshness,
    definition: answer.definition,
    evidence: answer.evidence,
    lineage: answer.lineage,
    tools_used: answer.tools_used,
    trace_id: answer.trace_id,
    tier: answer.tier,
    identity_id: answer.identity_id,
    snapshot: answer.snapshot,
    observed: answer.observed,
    hypotheses: answer.hypotheses,
    suppressed_cells: answer.suppressed_cells,
    skills_used: answer.skills_used,
    critic: answer.critic,
    error_state: answer.error_state,
    withheld: answer.withheld,
    llm_skipped: answer.llm_skipped,
    llm_invocation: answer.llm_invocation,
    failure_reason: answer.failure_reason,
    trace: {
      ...answer.trace,
      llm_used: answer.llm_invocation === "attempted_ok",
      llm_invocation: answer.llm_invocation,
      failure_reason: answer.failure_reason,
    },
  };
}

export async function answerPeopleDemoQuestion(
  question: string,
  demoCase?: PeopleDemoCase,
  identityId?: string,
  headers?: Headers,
): Promise<PeopleAskAnswer> {
  const answer = await runPeopleAgent({ question, demoCase, identityId, headers });
  return toAskAnswer(answer);
}
