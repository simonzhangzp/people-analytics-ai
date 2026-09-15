"use client";

import { useState } from "react";
import { CASE_FOLLOW_UPS, type PeopleAskAnswer, type PeopleDemoCase } from "@/lib/people/ask-types";
import { LLM_BUDGET_NOTICE } from "@/lib/people/agent/llm-invocation";
import { QualityBadge } from "./format";

export function FollowUpAsk({
  demoCase,
  identityId,
}: {
  demoCase: PeopleDemoCase;
  identityId?: string;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<PeopleAskAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [showCritic, setShowCritic] = useState(false);
  const chips = CASE_FOLLOW_UPS[demoCase];

  async function ask(next: string) {
    const trimmed = next.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setShowTrace(false);
    setShowCritic(false);
    setQuestion(trimmed);
    try {
      const response = await fetch("/api/people/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          caseId: demoCase,
          identityId: identityId ?? undefined,
        }),
      });
      const payload = (await response.json()) as PeopleAskAnswer & {
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(payload.error?.message ?? "The People tools could not answer.");
        setAnswer(null);
        return;
      }
      setAnswer(payload);
    } catch {
      setError("The People tools could not answer.");
    } finally {
      setBusy(false);
    }
  }

  const withheld = Boolean(answer?.withheld || answer?.error_state === "critic");
  const rpcError = answer?.error_state === "rpc";

  return (
    <section className="mt-10 border-t border-edge pt-8">
      <p className="eyebrow">Follow-up</p>
      <h2 className="mt-2 text-[18px] font-semibold text-ink">Ask a follow-up</h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-6 text-body-2">
        Answers come from governed People serving tools. Arithmetic stays in the
        database; this is not an unconstrained “ask anything” assistant.
      </p>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about this case…"
          className="min-h-11 flex-1 rounded-[8px] border border-edge-strong bg-white px-3 text-[14px] text-ink"
          aria-label="Follow-up question"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-[8px] bg-primary px-4 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Looking up…" : "Ask"}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => void ask(chip)}
            className="rounded-full border border-edge bg-white px-3 py-1.5 text-[12px] text-body-2 hover:border-edge-strong"
          >
            {chip}
          </button>
        ))}
      </div>
      {error ? <p className="mt-4 text-[13px] text-danger">{error}</p> : null}
      {answer ? (
        <div
          className="surface mt-5 p-4"
          data-testid="people-ai-answer"
          data-error-state={answer.error_state ?? ""}
          data-tier={String(answer.tier ?? "")}
        >
          <div className="flex items-center gap-2">
            <QualityBadge status={withheld ? "withheld" : rpcError ? "error" : answer.quality_status} />
          </div>
          <h3
            className="mt-2 text-[15px] font-semibold text-ink"
            data-testid="people-ai-headline"
          >
            {answer.headline}
          </h3>
          {answer.llm_invocation === "skipped_by_budget" ? (
            <p className="mt-3 text-[13px] leading-6 text-body-2" data-testid="people-ai-budget">
              {LLM_BUDGET_NOTICE}
            </p>
          ) : null}
          {rpcError ? (
            <p className="mt-3 text-[13px] leading-6 text-danger" data-testid="people-ai-rpc-error">
              Serving lookup failed. No substitute numbers were generated.
            </p>
          ) : null}
          {withheld ? (
            <div className="mt-3" data-testid="people-ai-critic">
              <button
                type="button"
                className="text-[12px] font-semibold text-primary"
                onClick={() => setShowCritic((value) => !value)}
              >
                {showCritic ? "Hide critic failures" : "Show critic failures"}
              </button>
              {showCritic && answer.critic?.failures?.length ? (
                <ul className="mt-2 space-y-1 text-[13px] leading-6 text-danger">
                  {answer.critic.failures.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Facts</p>
              <ul className="mt-1 space-y-1 text-[13px] leading-6 text-body">
                {answer.facts.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {answer.interpretation.length ? (
                <>
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                    Hypotheses
                  </p>
                  <ul className="mt-1 space-y-1 text-[13px] leading-6 text-body-2">
                    {answer.interpretation.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
          {answer.trace_id ? (
            <div className="mt-4 border-t border-edge pt-3">
              <p className="text-[12px] leading-5 text-body-2" data-testid="people-ai-trace-b2a">
                The model chooses which tools to call. Values and fact sentences come from SQL and
                deterministic templates; the model does not rewrite them. The only model-authored
                text is hypotheses. If the planner fails, headline, facts, and the tool sequence
                stay the same — see Architecture (b2a_diff).
              </p>
              <button
                type="button"
                className="text-[12px] font-semibold text-primary"
                data-testid="people-ai-trace-toggle"
                onClick={() => setShowTrace((value) => !value)}
              >
                {showTrace ? "Hide trace" : "Show trace"}
              </button>
              {showTrace ? (
                <dl className="mt-2 space-y-1 text-[12px] leading-5 text-body-2" data-testid="people-ai-trace">
                  <div>trace_id {answer.trace_id}</div>
                  <div>tier {String(answer.tier)}</div>
                  <div>identity {answer.identity_id}</div>
                  <div>snapshot {answer.snapshot?.pointer_id} · {answer.snapshot?.as_of}</div>
                  <div data-testid="people-ai-trace-min-cell">
                    metric_min_cell {answer.metric_min_cell ?? "—"} · identity_min_cell{" "}
                    {answer.identity_min_cell ?? "—"} · effective_min_cell {answer.effective_min_cell ?? "—"}{" "}
                    ({answer.min_cell_source ?? "—"})
                  </div>
                  <div data-testid="people-ai-trace-llm">
                    llm_invocation {answer.llm_invocation ?? answer.trace?.llm_invocation ?? "skipped_by_design"}
                  </div>
                  {answer.llm_invocation === "attempted_failed" && answer.failure_reason ? (
                    <div data-testid="people-ai-trace-failure">failure_reason {answer.failure_reason}</div>
                  ) : null}
                  {(answer.trace?.tools ?? []).map((tool) => (
                    <div key={`${tool.seq}-${tool.name}`}>
                      {tool.seq}. {tool.name} ({tool.latency_ms} ms) {tool.ok ? "ok" : "not ok"}
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
