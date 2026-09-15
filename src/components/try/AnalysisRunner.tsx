"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LiveTag } from "@/components/site/LiveTag";
import { CASE_FOLLOW_UPS, type PeopleAskAnswer } from "@/lib/people/ask-types";
import { LLM_BUDGET_NOTICE } from "@/lib/people/agent/llm-invocation";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const ROADMAP_SKILLS = [
  ["Significance testing", "Is the APAC-SIN gap larger than noise for cells this small?"],
  ["Driver analysis", "Which observed signals move with attrition after controlling for tenure and grade?"],
  ["Cohort analysis", "Do the 2025Q4 reorg cohorts separate from their peers over time?"],
  ["Segmentation", "Automated slicing across location × tenure × grade with suppression built in."],
  ["Causal inference", "Design a quasi-experiment before anyone calls compa-ratio lag a cause."],
  ["Survey sentiment / NLP", "Engagement free text is in the ontology but not in any public output."],
] as const;

export type CertifiedMetricSummary = {
  label: string;
  value: string;
  scope: string;
  window: string;
  asOf: string;
  companyValue: string;
};

/**
 * Module 5 — run Case 3 through the live agent and show the seven artefacts the
 * brief asks for. The roadmap grid below is tagged Target architecture.
 */
/** Case 3's own question. It routes to Tier 2, the only tier where the planner (LLM) is invoked. */
const CASE_QUESTION = "Why is Engineering voluntary attrition increasing?";

export function AnalysisRunner({ metric }: { metric: CertifiedMetricSummary }) {
  const reduce = useReducedMotion() ?? false;
  const chips = [CASE_QUESTION, ...CASE_FOLLOW_UPS.attrition];
  const [question, setQuestion] = useState<string>(CASE_QUESTION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<PeopleAskAnswer | null>(null);

  async function run(next: string) {
    setBusy(true);
    setError(null);
    setQuestion(next);
    try {
      const response = await fetch("/api/people/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: next, caseId: "attrition", identityId: "demo-external-viewer" }),
      });
      const payload = (await response.json()) as PeopleAskAnswer & { error?: { message?: string } };
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
  const suggested = chips.filter((chip) => chip !== question).slice(0, 3);
  const llmInvocation = answer?.llm_invocation ?? answer?.trace?.llm_invocation ?? "skipped_by_design";
  const llmUsed = llmInvocation === "attempted_ok";
  const hypothesesSource =
    llmInvocation === "attempted_ok"
      ? "Model-authored, then checked by the critic. Not proven causes."
      : llmInvocation === "skipped_by_design"
        ? "Deterministic template — this question is Tier 1, so the model was not invoked. Not proven causes."
        : llmInvocation === "skipped_by_budget"
          ? "Deterministic template — today's model budget for this network is used up. Not proven causes."
          : "Deterministic template — the model call failed, so the skeleton answered. Not proven causes.";

  return (
    <div className="mt-8" data-testid="analysis-runner">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">1 · Certified metric</p>
          <div className="surface mt-2 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{metric.label}</p>
            <p className="metric-number mt-2" data-testid="analysis-certified-rate">{metric.value}</p>
            <p className="mt-2 text-[12px] text-muted">
              {metric.scope} · {metric.window} · as of {metric.asOf} · company {metric.companyValue}
            </p>
          </div>

          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Question</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setQuestion(chip)}
                aria-pressed={chip === question}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                  chip === question
                    ? "border-primary bg-primary-soft text-primary-dark"
                    : "border-edge bg-white text-body-2 hover:border-edge-strong",
                )}
              >
                {chip}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void run(question)}
            disabled={busy}
            className="mt-4 inline-flex min-h-11 items-center rounded-[8px] bg-primary px-5 text-[14px] font-semibold text-white disabled:opacity-60"
            data-testid="analysis-run"
          >
            {busy ? "Running governed tools…" : "Run the analysis"}
          </button>
          {error ? <p className="mt-3 text-[13px] text-danger">{error}</p> : null}
        </div>

        <aside className="surface p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">What the model may do</p>
          <ul className="mt-3 space-y-2 text-[13px] leading-5 text-body">
            <li>Select which governed tools to call, in which order.</li>
            <li>Write hypotheses, clearly separated from observed evidence.</li>
          </ul>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">What it may not do</p>
          <ul className="mt-3 space-y-2 text-[13px] leading-5 text-body">
            <li>Produce or rewrite a number or fact sentence.</li>
            <li>Bypass min_cell, choose an identity, or run SQL.</li>
            <li>Turn a correlation into a causal conclusion — the critic withholds it.</li>
          </ul>
        </aside>
      </div>

      <AnimatePresence initial={false}>
        {answer ? (
          <motion.div
            key={answer.trace_id ?? question}
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0.1 : 0.45, ease: EASE }}
            className="mt-8 grid gap-4 md:grid-cols-2"
            data-testid="analysis-result"
          >
            <section className="surface p-5 md:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">2 · Breakdown headline</p>
              <p className="mt-2 text-[18px] font-semibold leading-snug text-ink" data-testid="analysis-headline">
                {answer.headline}
              </p>
              {answer.llm_invocation === "skipped_by_budget" ? (
                <p className="mt-2 text-[12px] text-gold-dark">{LLM_BUDGET_NOTICE}</p>
              ) : null}
            </section>

            <section className="surface p-5" data-testid="analysis-evidence">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">3 · Observed evidence</p>
              {withheld ? (
                <p className="mt-2 text-[13px] text-danger">
                  Withheld by the critic: {answer.critic?.failures?.join("; ") || "results and narrative did not reconcile"}.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-[13px] leading-5 text-ink">
                  {answer.facts
                    .filter((fact) => fact !== LLM_BUDGET_NOTICE)
                    .map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                </ul>
              )}
            </section>

            <section className="surface p-5" data-testid="analysis-hypotheses">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">4 · Hypotheses</p>
              <p className={cn("mt-1 text-[11px]", llmUsed ? "text-gold-dark" : "text-muted")} data-testid="analysis-hypotheses-source">
                {hypothesesSource}
              </p>
              {withheld || !answer.interpretation.length ? (
                <p className="mt-2 text-[13px] text-muted">
                  {withheld ? "No hypotheses are shown when the answer is withheld." : "No hypotheses for this question."}
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-[13px] leading-5 text-body-2">
                  {answer.interpretation.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="surface p-5" data-testid="analysis-tools">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">5 · Tool calls</p>
              <ol className="mt-2 space-y-1.5 text-[13px] text-ink">
                {(answer.trace?.tools ?? []).length
                  ? answer.trace!.tools.map((tool) => (
                      <li key={`${tool.seq}-${tool.name}`} className="flex items-baseline gap-2">
                        <span className="text-[11px] tabular-nums text-faint">{tool.seq}</span>
                        <code className="font-semibold">{tool.name}</code>
                        <span className="text-[11px] text-muted">
                          {tool.latency_ms} ms · {tool.ok ? "ok" : "not ok"}
                        </span>
                      </li>
                    ))
                  : answer.tools_used.map((tool, index) => (
                      <li key={tool} className="flex items-baseline gap-2">
                        <span className="text-[11px] tabular-nums text-faint">{index + 1}</span>
                        <code className="font-semibold">{tool}</code>
                      </li>
                    ))}
              </ol>
            </section>

            <section className="surface p-5" data-testid="analysis-next">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">6 · Suggested next questions</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggested.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => void run(chip)}
                    disabled={busy}
                    className="rounded-full border border-edge bg-white px-3 py-1.5 text-[12px] text-body-2 hover:border-edge-strong disabled:opacity-60"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </section>

            <section className="surface p-5 md:col-span-2" data-testid="analysis-trace">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">7 · Trace</p>
              <dl className="mt-2 grid gap-x-6 gap-y-2 text-[12px] text-body-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">trace_id</dt>
                  <dd className="mt-0.5 break-all text-ink">{answer.trace_id ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">tier · identity</dt>
                  <dd className="mt-0.5 text-ink">
                    {String(answer.tier ?? "—")} · {answer.identity_id ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">snapshot</dt>
                  <dd className="mt-0.5 text-ink">
                    {answer.snapshot?.pointer_id ?? "—"} · {answer.snapshot?.as_of ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">min_cell</dt>
                  <dd className="mt-0.5 text-ink">
                    metric {answer.metric_min_cell ?? "—"} · identity {answer.identity_min_cell ?? "—"} · effective{" "}
                    {answer.effective_min_cell ?? "—"} ({answer.min_cell_source ?? "—"})
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">llm_invocation</dt>
                  <dd className="mt-0.5 text-ink">
                    {llmInvocation}
                    {answer.failure_reason ? ` · ${answer.failure_reason}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">critic</dt>
                  <dd className="mt-0.5 text-ink">{answer.critic?.ok === false ? "failed" : "passed"}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[12px] leading-5 text-muted">
                Only the case question is Tier 2 and reaches the model; the six follow-ups are Tier 1 and
                answer from SQL and templates alone. Model calls are budgeted per network per day. When the
                planner is skipped or fails, headline, facts and tool sequence stay the same. The full case
                with trend, breakdown and skills context is on{" "}
                <Link href="/enterprise-demo/attrition" className="font-semibold text-primary hover:underline">
                  Case 3
                </Link>
                .
              </p>
            </section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mt-12">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">Reusable analytical skills</h3>
          <LiveTag status="target" />
        </div>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-body-2">
          Where this goes next: methods that are versioned, tested and certified so the agent can reuse
          them. None of these are live on the public site today. Live today: 15 governed tools and the
          deterministic case skeleton you just ran.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="roadmap-skills">
          {ROADMAP_SKILLS.map(([name, copy]) => (
            <li key={name} className="rounded-[8px] border border-dashed border-gold-line bg-gold-soft p-4">
              <p className="text-[13px] font-semibold text-gold-dark">{name}</p>
              <p className="mt-1 text-[12px] leading-5 text-gold-dark">{copy}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
