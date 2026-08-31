"use client";

import { useState } from "react";
import { CASE_FOLLOW_UPS, type PeopleAskAnswer, type PeopleDemoCase } from "@/lib/people/ask";
import { QualityBadge } from "./format";

export function FollowUpAsk({ demoCase }: { demoCase: PeopleDemoCase }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<PeopleAskAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chips = CASE_FOLLOW_UPS[demoCase];

  async function ask(next: string) {
    const trimmed = next.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setQuestion(trimmed);
    try {
      const response = await fetch("/api/people/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, caseId: demoCase }),
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

  return (
    <section className="mt-10 border-t border-[#e3e7ed] pt-8">
      <p className="eyebrow">Follow-up</p>
      <h2 className="mt-2 text-[18px] font-semibold text-[#1c2b44]">Ask a follow-up</h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#546277]">
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
          className="min-h-11 flex-1 rounded-[6px] border border-[#d6dce5] bg-white px-3 text-[14px] text-[#24324b]"
          aria-label="Follow-up question"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-[6px] bg-[#3157c9] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
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
            className="rounded-full border border-[#e3e7ed] bg-white px-3 py-1.5 text-[12px] text-[#546277] hover:border-[#c5cdd8]"
          >
            {chip}
          </button>
        ))}
      </div>
      {error ? <p className="mt-4 text-[13px] text-[#934646]">{error}</p> : null}
      {answer ? (
        <div className="surface mt-5 p-4" data-testid="people-ai-answer">
          <div className="flex items-center gap-2">
            <QualityBadge status={answer.quality_status} />
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-[#1c2b44]">{answer.headline}</h3>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#738097]">Facts</p>
          <ul className="mt-1 space-y-1 text-[13px] leading-6 text-[#3e4c61]">
            {answer.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          {answer.interpretation.length ? (
            <>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#738097]">
                Interpretation
              </p>
              <ul className="mt-1 space-y-1 text-[13px] leading-6 text-[#546277]">
                {answer.interpretation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
