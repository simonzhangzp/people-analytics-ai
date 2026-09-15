"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { PeopleAskAnswer } from "@/lib/people/ask-types";
import { authzCellsForIdentity } from "@/lib/people/authz-policy";
import {
  DEMO_IDENTITIES,
  boundJobFamily,
  deniesCompanyConfidential,
  identityLabel,
  identityMinCell,
} from "@/lib/people/demo-identities";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Questions that route deterministically (Tier 1) so the comparison is about policy, not the LLM. */
const QUESTIONS: Array<{ id: string; label: string; question: string; caseId?: "attrition"; probe: string }> = [
  {
    id: "own-org",
    label: "Own-org Headcount",
    question: "What is current Engineering headcount?",
    probe: "Internal metric, Engineering scope. Every identity may read it.",
  },
  {
    id: "other-org-confidential",
    label: "Another org's confidential metric",
    question: "What is the Sales compa-ratio?",
    probe: "Confidential metric outside the bound org. Leader and HRBP are denied by org_scope; the visitor by sensitivity.",
  },
  {
    id: "company-confidential",
    label: "Company-level confidential",
    question: "What is the company compa-ratio?",
    probe: "Company-level confidential. The Engineering leader is denied (company_scope_confidential); HRBP and analyst may read it.",
  },
  {
    id: "small-groups",
    label: "Small-group breakdown",
    question: "Show me the tenure breakdown",
    caseId: "attrition",
    probe: "Same cells, different min_cell floor. Visitor 50 · leader 20 · HRBP 10 · analyst 5.",
  },
];

type Outcome =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "done"; answer: PeopleAskAnswer };

function scopeLine(identityId: string) {
  const bound = boundJobFamily(identityId);
  const parts = [
    bound ? `org scope ${bound}` : "org scope company-wide",
    `identity min_cell ${identityMinCell(identityId)}`,
    identityId === "demo-external-viewer"
      ? "confidential denied (sensitivity)"
      : deniesCompanyConfidential(identityId)
        ? "company-level confidential denied"
        : "company-level confidential allowed",
  ];
  return parts.join(" · ");
}

function decisionFor(answer: PeopleAskAnswer) {
  if (answer.tier === "refuse") return { label: "Refused", tone: "danger", reason: answer.refuse_reason ?? "—" };
  if (answer.denied) return { label: "Denied", tone: "danger", reason: answer.deny_reason ?? "—" };
  if (answer.withheld) return { label: "Withheld by critic", tone: "warning", reason: "critic" };
  if (answer.error_state === "rpc") return { label: "Serving error", tone: "warning", reason: "rpc" };
  return { label: "Allowed", tone: "success", reason: null };
}

function OutcomeCard({ identityId, outcome, reduce }: { identityId: string; outcome: Outcome; reduce: boolean }) {
  const cells = authzCellsForIdentity(identityId);
  return (
    <div className="surface flex flex-col p-5" data-testid={`permissions-outcome-${identityId}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
        {identityLabel(identityId)}
      </p>
      <p className="mt-1 text-[12px] leading-5 text-muted">{scopeLine(identityId)}</p>

      <div className="mt-4 min-h-[180px]">
        <AnimatePresence mode="wait" initial={false}>
          {outcome.state === "idle" ? (
            <motion.p
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[13px] text-faint"
            >
              Pick a question and run it.
            </motion.p>
          ) : outcome.state === "loading" ? (
            <motion.p
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[13px] text-body-2"
            >
              Calling governed tools as {identityLabel(identityId)}…
            </motion.p>
          ) : outcome.state === "error" ? (
            <motion.p
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[13px] text-danger"
            >
              {outcome.message}
            </motion.p>
          ) : (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.1 : 0.4, ease: EASE }}
            >
              {(() => {
                const decision = decisionFor(outcome.answer);
                const answer = outcome.answer;
                const suppressed = answer.suppressed_cells?.length ?? 0;
                return (
                  <>
                    <span
                      className={cn(
                        "inline-flex min-h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold",
                        decision.tone === "success" && "border-certified-line bg-certified-soft text-certified-dark",
                        decision.tone === "warning" && "border-gold-line bg-gold-soft text-gold-dark",
                        decision.tone === "danger" && "border-danger-line bg-danger-soft text-danger",
                      )}
                      data-testid="permissions-decision"
                    >
                      {decision.label}
                      {decision.reason ? ` · ${decision.reason}` : ""}
                    </span>
                    <p className="mt-3 text-[14px] font-semibold leading-6 text-ink">{answer.headline}</p>
                    {answer.facts.length ? (
                      <ul className="mt-2 space-y-1 text-[13px] leading-5 text-body">
                        {answer.facts.slice(0, 4).map((fact) => (
                          <li key={fact}>{fact}</li>
                        ))}
                      </ul>
                    ) : null}
                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px] text-body-2">
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Effective min cell</dt>
                        <dd className="mt-0.5 text-ink">
                          {answer.effective_min_cell ?? "—"}
                          {answer.min_cell_source ? ` (${answer.min_cell_source})` : ""}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Suppressed cells</dt>
                        <dd className="mt-0.5 text-ink">{suppressed}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Tier</dt>
                        <dd className="mt-0.5 text-ink">{String(answer.tier ?? "—")}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Tools</dt>
                        <dd className="mt-0.5 truncate text-ink">{answer.tools_used.join(", ") || "—"}</dd>
                      </div>
                    </dl>
                  </>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <details className="mt-4 border-t border-edge pt-3">
        <summary className="cursor-pointer text-[12px] font-semibold text-primary">
          Policy matrix for this identity
        </summary>
        <table className="mt-2 w-full text-left text-[11px] text-body">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              <th className="py-1 pr-2">Scope</th>
              <th className="py-1 pr-2">Metric</th>
              <th className="py-1">Policy</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell) => (
              <tr key={`${cell.scope}-${cell.metric_id}`}>
                <td className="py-1 pr-2">{cell.scope.replaceAll("_", " ")}</td>
                <td className="py-1 pr-2">{cell.metric_id}</td>
                <td className="py-1">{cell.expected_denied ? `deny · ${cell.expected_reason}` : "allow"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function PermissionsLab() {
  const reduce = useReducedMotion() ?? false;
  const [left, setLeft] = useState<string>("demo-external-viewer");
  const [right, setRight] = useState<string>("demo-leader-engineering");
  const [questionId, setQuestionId] = useState(QUESTIONS[1].id);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const question = QUESTIONS.find((row) => row.id === questionId) ?? QUESTIONS[0];
  const busy = Object.values(outcomes).some((row) => row.state === "loading");

  async function askAs(identityId: string): Promise<Outcome> {
    try {
      const response = await fetch("/api/people/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: question.question, caseId: question.caseId, identityId }),
      });
      const payload = (await response.json()) as PeopleAskAnswer & { error?: { message?: string } };
      if (!response.ok) {
        return { state: "error", message: payload.error?.message ?? "The People tools could not answer." };
      }
      return { state: "done", answer: payload };
    } catch {
      return { state: "error", message: "The People tools could not answer." };
    }
  }

  async function run() {
    const ids = [...new Set([left, right])];
    setOutcomes(Object.fromEntries(ids.map((id) => [id, { state: "loading" } as Outcome])));
    const results = await Promise.all(ids.map(async (id) => [id, await askAs(id)] as const));
    setOutcomes(Object.fromEntries(results));
  }

  return (
    <div className="mt-8" data-testid="permissions-lab">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["A", left, setLeft],
          ["B", right, setRight],
        ].map(([slot, value, setter]) => (
          <label key={String(slot)} className="block text-[13px] text-body-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Identity {String(slot)}</span>
            <select
              className="mt-2 w-full rounded-[8px] border border-edge bg-white px-3 py-2 text-[13px] text-ink"
              value={String(value)}
              onChange={(event) => {
                (setter as (v: string) => void)(event.target.value);
                setOutcomes({});
              }}
              data-testid={`permissions-identity-${String(slot).toLowerCase()}`}
            >
              {DEMO_IDENTITIES.map((row) => (
                <option key={row.identity_id} value={row.identity_id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Same question</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUESTIONS.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => {
              setQuestionId(row.id);
              setOutcomes({});
            }}
            aria-pressed={row.id === questionId}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
              row.id === questionId
                ? "border-primary bg-primary-soft text-primary-dark"
                : "border-edge bg-white text-body-2 hover:border-edge-strong",
            )}
          >
            {row.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[14px] text-ink">
        <span className="font-semibold">“{question.question}”</span>
      </p>
      <p className="mt-1 text-[12px] leading-5 text-muted">{question.probe}</p>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="mt-4 inline-flex min-h-11 items-center rounded-[8px] bg-primary px-5 text-[14px] font-semibold text-white disabled:opacity-60"
        data-testid="permissions-run"
      >
        {busy ? "Running…" : "Run as both identities"}
      </button>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <OutcomeCard identityId={left} outcome={outcomes[left] ?? { state: "idle" }} reduce={reduce} />
        <OutcomeCard identityId={right} outcome={outcomes[right] ?? { state: "idle" }} reduce={reduce} />
      </div>
      <p className="mt-4 text-[12px] leading-5 text-muted">
        The prompt is identical. The difference comes from people_policy_demo_identity and FORCE RLS
        in the serving database, not from anything the model was told. Person-level data is never
        returned to any identity.
      </p>
    </div>
  );
}
