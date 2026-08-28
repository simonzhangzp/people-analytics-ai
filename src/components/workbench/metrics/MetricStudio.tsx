"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  CircleHelp,
  GitCompareArrows,
  LockKeyhole,
  Ruler,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  MetricAmbiguity,
  MetricDefinition,
  MetricExpression,
  MetricPatch,
} from "@/types/workbench";

interface MetricStudioProps {
  metric?: MetricDefinition;
  ambiguity: MetricAmbiguity | null;
  pendingPatch: MetricPatch | null;
  busy?: boolean;
  onResolveAmbiguity: (optionId: string) => void;
  onRequestPatch: (instruction: string) => Promise<void> | void;
  onApplyPatch: () => void;
  onCancelPatch: () => void;
  onContinue: () => void;
}

function expressionLabel(expression?: MetricExpression): string {
  if (!expression) return "Not required for this metric";
  if (expression.kind === "count") {
    return expression.distinctField
      ? `Distinct ${expression.entity} by ${expression.distinctField}`
      : `Count ${expression.entity} records`;
  }
  if (expression.kind === "average") return `Average ${expression.field}`;
  if (expression.kind === "duration") {
    return `${expression.aggregation} days from ${expression.startField} to ${expression.endField}`;
  }
  return `${expressionLabel(expression.numerator)} ÷ ${expressionLabel(
    expression.denominator,
  )} × ${expression.multiplier}`;
}

function expressionSummary(metric?: MetricDefinition) {
  return metric ? expressionLabel(metric.formula) : "No definition available";
}

export function MetricStudio({
  metric,
  ambiguity,
  pendingPatch,
  busy = false,
  onResolveAmbiguity,
  onRequestPatch,
  onApplyPatch,
  onCancelPatch,
  onContinue,
}: MetricStudioProps) {
  const [instruction, setInstruction] = useState(
    "Describe any inclusion, denominator, or time-basis change to review.",
  );

  return (
    <div className="mx-auto w-full max-w-[1040px] px-5 py-8 sm:px-8 lg:px-10">
      <header className="border-b border-[#dfe3e9] pb-7">
        <p className="eyebrow">Metrics · Agree on meaning</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="max-w-3xl text-[28px] font-semibold leading-[1.2] tracking-[-0.035em] text-[#14213b] sm:text-[32px]">
              How should {metric?.name ?? "this People metric"} be defined?
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#5d697c]">
              Resolve only the choices that can change the answer. Every applied change
              becomes a versioned organizational definition.
            </p>
          </div>
          <Button
            onClick={onContinue}
            disabled={!metric || metric.status !== "Approved" || Boolean(ambiguity)}
            data-testid="continue-to-analysis"
          >
            Review analysis plan
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </header>

      {!metric ? (
        <div className="mt-7 rounded-[9px] border border-[#e1e5eb] bg-white p-7 text-center">
          <Ruler aria-hidden="true" className="mx-auto size-5 text-[#687897]" />
          <p className="mt-3 text-[13px] font-semibold text-[#344158]">
            Add data before defining a metric
          </p>
        </div>
      ) : (
        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-[9px] border border-[#dfe3e9] bg-white">
            <div className="border-b border-[#e6e9ee] px-5 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Suggested metric</Badge>
                <Badge variant={metric.status === "Approved" ? "success" : "warning"}>
                  {metric.status}
                </Badge>
                <span className="text-[11px] font-medium text-[#7b8493]">
                  Version {metric.version}
                </span>
              </div>
              <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.02em] text-[#1d2a43]">
                {metric.name}
              </h2>
              <p className="mt-2 text-[13px] leading-5 text-[#657185]">
                {metric.description}
              </p>
            </div>

            <div className="space-y-6 px-5 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#818a99]">
                  Formula
                </p>
                <p className="mt-2 rounded-[7px] border border-[#dde3ed] bg-[#f6f8fc] px-4 py-3 font-mono text-[12px] leading-5 text-[#314571]">
                  {expressionSummary(metric)}
                </p>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[7px] border border-[#e4e7ec] p-4">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#818a99]">
                    Numerator
                  </dt>
                  <dd className="mt-2 text-[12px] leading-5 text-[#48566d]">
                    {expressionLabel(metric.numerator)}
                  </dd>
                </div>
                <div className="rounded-[7px] border border-[#e4e7ec] p-4">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#818a99]">
                    Denominator
                  </dt>
                  <dd className="mt-2 text-[12px] leading-5 text-[#48566d]">
                    {expressionLabel(metric.denominator)}
                  </dd>
                </div>
                <div className="rounded-[7px] border border-[#e4e7ec] p-4">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#818a99]">
                    Included
                  </dt>
                  <dd className="mt-2 text-[12px] leading-5 text-[#48566d]">
                    {metric.inclusions.length
                      ? metric.inclusions.map((rule) => rule.label).join("; ")
                      : "All records in the approved population"}
                  </dd>
                </div>
                <div className="rounded-[7px] border border-[#e4e7ec] p-4">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#818a99]">
                    Excluded
                  </dt>
                  <dd className="mt-2 text-[12px] leading-5 text-[#48566d]">
                    {metric.exclusions.length
                      ? metric.exclusions.map((rule) => rule.label).join("; ")
                      : "No explicit exclusions"}
                  </dd>
                </div>
              </dl>

              <div className="flex items-start gap-2 rounded-[7px] border border-[#d9e4dd] bg-[#f6faf7] px-4 py-3">
                <ShieldCheck
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-[#3f7d61]"
                />
                <p className="text-[11px] leading-5 text-[#4d6959]">
                  Executable SQL is compiled by trusted code from this approved structure.
                  The AI never writes or runs arbitrary SQL.
                </p>
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            {ambiguity && (
              <section
                className="rounded-[9px] border border-[#ead9bc] bg-[#fffaf2] p-5"
                aria-labelledby="material-ambiguity-heading"
                data-testid="metric-ambiguity"
              >
                <div className="flex items-center gap-2">
                  <CircleHelp aria-hidden="true" className="size-4 text-[#9b641e]" />
                  <Badge variant="warning">Needs confirmation</Badge>
                </div>
                <h2
                  id="material-ambiguity-heading"
                  className="mt-3 text-[14px] font-semibold leading-5 text-[#4a3a25]"
                >
                  {ambiguity.question}
                </h2>
                <p className="mt-2 text-[11px] leading-5 text-[#745d3e]">
                  {ambiguity.whyItMatters}
                </p>
                <fieldset className="mt-4 space-y-2">
                  <legend className="sr-only">Choose a metric definition option</legend>
                  {ambiguity.options.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      onClick={() => onResolveAmbiguity(option.id)}
                      className="flex w-full items-center gap-2 rounded-[6px] border border-[#dfd1b9] bg-white px-3 py-2.5 text-left text-[11px] font-semibold text-[#5f4c33] hover:border-[#bc9e71] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b98a47]/25"
                    >
                      <span className="size-3.5 rounded-full border border-[#b8a383]" />
                      {option.label}
                    </button>
                  ))}
                </fieldset>
              </section>
            )}

            <section className="rounded-[9px] border border-[#dfe3e9] bg-white p-5">
              <div className="flex items-center gap-2">
                <Sparkles aria-hidden="true" className="size-4 text-[#4966b3]" />
                <p className="text-[12px] font-semibold text-[#344158]">
                  Modify in plain language
                </p>
              </div>
              <label
                htmlFor="metric-instruction"
                className="mt-4 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#818a99]"
              >
                Definition instruction
              </label>
              <textarea
                id="metric-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                rows={4}
                className="mt-2 w-full resize-none rounded-[6px] border border-[#ccd3de] px-3 py-2 text-[12px] leading-5 text-[#344158] outline-none focus:border-[#7f94d2] focus:ring-2 focus:ring-[#3157d5]/10"
              />
              <Button
                variant="secondary"
                className="mt-3 w-full"
                disabled={!instruction.trim() || busy}
                onClick={() => void onRequestPatch(instruction)}
                data-testid="propose-metric-change"
              >
                <GitCompareArrows aria-hidden="true" className="size-4" />
                Preview structured diff
              </Button>
            </section>
          </aside>
        </div>
      )}

      {pendingPatch && (
        <section
          className="mt-6 rounded-[9px] border border-[#bcc9eb] bg-white"
          aria-labelledby="metric-diff-heading"
          data-testid="metric-diff"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e6f3] bg-[#f4f6fc] px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <GitCompareArrows aria-hidden="true" className="size-4 text-[#4966b3]" />
                <h2
                  id="metric-diff-heading"
                  className="text-[13px] font-semibold text-[#2e3d59]"
                >
                  Proposed definition change
                </h2>
              </div>
              <p className="mt-1 text-[11px] text-[#707b8e]">{pendingPatch.summary}</p>
            </div>
            <Badge variant="info">{pendingPatch.status}</Badge>
          </div>

          <div className="divide-y divide-[#e9ecf1]">
            {pendingPatch.items.map((item) => (
              <div
                key={`${item.field}-${item.label}`}
                className="grid gap-3 px-5 py-4 sm:grid-cols-[150px_1fr]"
              >
                <p className="text-[11px] font-semibold text-[#59667a]">{item.label}</p>
                <div className="space-y-2">
                  {item.before && (
                    <p className="rounded-[5px] bg-[#fdf3f2] px-3 py-2 text-[11px] leading-5 text-[#8a4e48] line-through">
                      {item.before}
                    </p>
                  )}
                  <p className="rounded-[5px] bg-[#eef8f2] px-3 py-2 text-[11px] leading-5 text-[#37664e]">
                    {item.after}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e8ed] px-5 py-4">
            <p className="flex items-center gap-2 text-[10px] text-[#7d8797]">
              <LockKeyhole aria-hidden="true" className="size-3.5" />
              Apply creates version {pendingPatch.nextDefinition.version + 1}; it never
              edits history in place.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onCancelPatch}>
                Cancel
              </Button>
              <Button size="sm" onClick={onApplyPatch} data-testid="apply-metric-change">
                <Check aria-hidden="true" className="size-4" />
                Apply definition
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

