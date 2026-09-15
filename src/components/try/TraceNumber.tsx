"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

export type TraceStep = {
  id: string;
  title: string;
  /** One-line answer visible before expanding. */
  summary: string;
  tone: "ok" | "warn" | "neutral";
  rows: Array<{ label: string; value: string }>;
  footnote?: string;
  href?: { label: string; to: string };
};

export type IncidentBridge = {
  apparent: string;
  incident: string;
  guardrail: string;
  currentHeadcount: string;
};

/**
 * Module 3 — start from one number and open each layer that makes it trustworthy,
 * then connect to Case 2 where the same guardrails stop a bad feed from publishing.
 */
export function TraceNumber({
  headline,
  steps,
  bridge,
}: {
  headline: { value: string; label: string; asOf: string };
  steps: TraceStep[];
  bridge: IncidentBridge;
}) {
  const reduce = useReducedMotion() ?? false;
  const [revealed, setRevealed] = useState(1);
  const [open, setOpen] = useState<string | null>(steps[0]?.id ?? null);
  const allRevealed = revealed >= steps.length;

  return (
    <div className="mt-8" data-testid="trace-number">
      <div className="surface p-6 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{headline.label}</p>
        <p className="mt-2 text-[48px] font-bold leading-none tracking-[-0.045em] text-ink sm:text-[56px]" data-testid="trace-headline-value">
          {headline.value}
        </p>
        <p className="mt-2 text-[13px] text-muted">as of {headline.asOf} · current_certified pointer · data-v1</p>
        <p className="mt-4 max-w-2xl text-[14px] leading-6 text-body">
          One number. Open each layer to see what has to be true before it is allowed on a page.
        </p>
      </div>

      <ol className="mt-4 flex flex-col gap-2">
        {steps.slice(0, revealed).map((step, index) => {
          const isOpen = open === step.id;
          return (
            <motion.li
              key={step.id}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0.1 : 0.4, ease: EASE }}
              className="surface"
              data-testid={`trace-step-${step.id}`}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : step.id)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-4 p-4 text-left sm:p-5"
              >
                <span className="mt-0.5 text-[11px] font-bold tabular-nums text-faint">0{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-ink">{step.title}</span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 rounded-full",
                        step.tone === "ok" ? "bg-certified" : step.tone === "warn" ? "bg-gold" : "bg-faint",
                      )}
                    />
                  </span>
                  <span className="mt-1 block text-[13px] leading-5 text-body-2">{step.summary}</span>
                </span>
                <span className="text-[12px] font-semibold text-primary">{isOpen ? "Hide" : "Open"}</span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    key="body"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: reduce ? 0.1 : 0.4, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <dl className="grid gap-x-6 gap-y-3 border-t border-edge px-4 py-4 sm:grid-cols-2 sm:px-5">
                      {step.rows.map((row) => (
                        <div key={row.label}>
                          <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">{row.label}</dt>
                          <dd className="mt-1 break-words text-[13px] leading-5 text-ink">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {step.footnote || step.href ? (
                      <p className="px-4 pb-4 text-[12px] leading-5 text-muted sm:px-5">
                        {step.footnote}
                        {step.href ? (
                          <>
                            {" "}
                            <Link href={step.href.to} className="font-semibold text-primary hover:underline">
                              {step.href.label} →
                            </Link>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ol>

      {!allRevealed ? (
        <button
          type="button"
          onClick={() => {
            const next = steps[revealed];
            setRevealed((value) => value + 1);
            if (next) setOpen(next.id);
          }}
          className="mt-4 inline-flex min-h-11 items-center rounded-[8px] bg-primary px-5 text-[14px] font-semibold text-white"
          data-testid="trace-reveal-next"
        >
          Open the next layer ({revealed} of {steps.length})
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0.1 : 0.5, ease: EASE }}
          className="mt-8 rounded-[8px] border border-primary-ring bg-canvas-2 p-6"
          data-testid="trace-incident-bridge"
        >
          <p className="eyebrow">Now break it</p>
          <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-ink">
            Why did Headcount suddenly drop?
          </h3>
          <ol className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              ["Apparent business movement", bridge.apparent, "warn"],
              ["Source incident", bridge.incident, "warn"],
              ["Certification guardrail", bridge.guardrail, "ok"],
            ].map(([title, copy, tone], index) => (
              <li key={title} className="surface p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Step {index + 1}</p>
                <p className="mt-1 flex items-center gap-2 text-[14px] font-semibold text-ink">
                  <span
                    aria-hidden="true"
                    className={cn("size-1.5 rounded-full", tone === "ok" ? "bg-certified" : "bg-gold")}
                  />
                  {title}
                </p>
                <p className="mt-2 text-[13px] leading-5 text-body">{copy}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[14px] leading-6 text-ink">
            Current certified Headcount stays {bridge.currentHeadcount}. An incomplete data feed is not
            the same thing as workforce attrition.
          </p>
          <Link
            href="/enterprise-demo/incident"
            className="mt-4 inline-flex min-h-10 items-center rounded-[8px] bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-dark"
          >
            Replay the full incident
          </Link>
        </motion.div>
      )}
    </div>
  );
}
