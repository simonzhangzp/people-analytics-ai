"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useDemo } from "@/components/demo-provider";
import { AILabel, Button, PageHeader, StatusBadge } from "@/components/ui";
import {
  catalogStats,
  filterCatalog,
  strategyCatalog,
  strategyCategories,
} from "@/lib/strategy/catalog";
import type { StrategyCategory, StrategyIntent } from "@/types/strategy";

export default function StrategyPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id ?? "demo";
  const {
    brief,
    analyzingStrategy,
    strategyError,
    strategyApproved,
    selectCatalogItem,
    submitCustomBrief,
    updateMetricTarget,
    skipTargets,
    approveStrategy,
  } = useDemo();

  const [intent, setIntent] = useState<StrategyIntent>(brief?.intentKind ?? "strategy");
  const [category, setCategory] = useState<StrategyCategory | "All">("All");
  const [query, setQuery] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customStatement, setCustomStatement] = useState("");
  const stats = catalogStats();

  const items = useMemo(
    () => filterCatalog(strategyCatalog, query, intent, category),
    [category, intent, query],
  );

  const onSelect = (id: string) => {
    void selectCatalogItem(id);
  };

  const onCustom = () => {
    if (!customStatement.trim()) return;
    void submitCustomBrief(intent, customTitle, customStatement);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Strategy"
        title="Start with a strategy or a problem"
        description="Choose from a classified library of People priorities, or write your own. The agent proposes metrics and measurement standards. You confirm targets or skip them for now."
        action={
          strategyApproved ? (
            <Link
              href={`/workspace/${workspaceId}/measurement`}
              className="inline-flex min-h-10 items-center justify-center rounded-[6px] bg-[#3157c9] px-4 text-[13px] font-semibold text-white"
              data-testid="continue-measurement"
            >
              Continue to Measurement
            </Link>
          ) : (
            <Button
              onClick={approveStrategy}
              disabled={!brief}
              data-testid="approve-strategy"
            >
              Confirm {brief?.intentKind === "problem" ? "problem" : "strategy"}
            </Button>
          )
        }
      />

      <section className="grid gap-4 sm:grid-cols-2">
        {(
          [
            [
              "strategy",
              "I have a strategy",
              "A direction you want to pursue, such as reducing Time to Fill or closing a skill gap.",
            ],
            [
              "problem",
              "I have a problem",
              "A constraint you need diagnosed, such as rising first-year attrition or stale workforce plans.",
            ],
          ] as const
        ).map(([value, label, detail]) => {
          const active = intent === value;
          return (
            <button
              key={value}
              type="button"
              data-testid={`intent-${value}`}
              onClick={() => setIntent(value)}
              className={`rounded-[8px] border px-5 py-4 text-left ${
                active
                  ? "border-[#dbe3f8] bg-[#eef2fb]"
                  : "border-[#e5e9ef] bg-white hover:bg-[#f8f9fb]"
              }`}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#738094]">
                {value}
              </p>
              <p className="mt-2 text-[16px] font-semibold text-[#1c2b44]">{label}</p>
              <p className="mt-2 text-[12px] leading-5 text-[#5d6a7d]">{detail}</p>
            </button>
          );
        })}
      </section>

      <section className="surface p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Classified library</p>
            <p className="mt-2 text-[13px] text-[#546277]">
              {stats.total} imported priorities · {stats.byKind.strategy} strategies ·{" "}
              {stats.byKind.problem} problems. Sources include Gartner, SHRM, Deloitte,
              CIPD, ISO 30414, and Gallup public research themes.
            </p>
          </div>
          <p className="text-[11px] text-[#7a8496]">{items.length} matching</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            data-testid="catalog-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              intent === "strategy"
                ? "Search strategies, e.g. Time to Fill"
                : "Search problems, e.g. first-year attrition"
            }
            className="min-h-10 rounded-[6px] border border-[#d6dce5] px-3 text-[13px] text-[#24324b] outline-none focus:border-[#7f94d2]"
          />
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as StrategyCategory | "All")
            }
            className="min-h-10 rounded-[6px] border border-[#d6dce5] bg-white px-3 text-[13px] text-[#24324b]"
          >
            <option value="All">All categories</option>
            {strategyCategories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => {
            const selected = brief?.catalogId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`catalog-item-${item.id}`}
                onClick={() => onSelect(item.id)}
                className={`w-full rounded-[8px] border px-4 py-3 text-left ${
                  selected
                    ? "border-[#dbe3f8] bg-[#eef2fb]"
                    : "border-[#e5e9ef] bg-[#fbfcfe] hover:border-[#c5cfe0]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold text-[#1f2d46]">{item.title}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#738094]">
                    {item.category}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-5 text-[#5c697d]">{item.statement}</p>
                <p className="mt-2 text-[10px] text-[#8a93a2]">Source: {item.source}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="surface p-5 sm:p-6">
        <p className="eyebrow">Or write your own</p>
        <div className="mt-4 grid gap-3">
          <input
            data-testid="custom-title"
            value={customTitle}
            onChange={(event) => setCustomTitle(event.target.value)}
            placeholder={intent === "strategy" ? "Strategy title" : "Problem title"}
            className="min-h-10 rounded-[6px] border border-[#d6dce5] px-3 text-[13px] text-[#24324b] outline-none focus:border-[#7f94d2]"
          />
          <textarea
            data-testid="custom-statement"
            value={customStatement}
            onChange={(event) => setCustomStatement(event.target.value)}
            rows={4}
            placeholder="Describe the population, the change you want, and any constraint you already know."
            className="rounded-[6px] border border-[#d6dce5] px-3 py-2 text-[13px] leading-5 text-[#24324b] outline-none focus:border-[#7f94d2]"
          />
          <div>
            <Button
              onClick={onCustom}
              disabled={!customStatement.trim() || analyzingStrategy}
              data-testid="submit-custom-brief"
            >
              Analyze this {intent}
            </Button>
          </div>
        </div>
      </section>

      {brief && (
        <section className="space-y-5" data-testid="strategy-brief">
          <div className="surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">
                  Selected {brief.intentKind}
                </p>
                <h2 className="mt-3 max-w-3xl text-[22px] font-[650] leading-8 tracking-[-0.03em] text-[#15233e]">
                  {brief.title}
                </h2>
              </div>
              <StatusBadge status={strategyApproved ? "Approved" : "Proposed"} />
            </div>
            <p className="mt-3 text-[13px] leading-6 text-[#3d4b61]">{brief.statement}</p>
            <p className="mt-3 text-[11px] text-[#7a8496]">
              {brief.category} · {brief.source === "custom" ? "Written by you" : "Catalog"} ·
              Population: {brief.population}
            </p>
          </div>

          <div className="surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <AILabel>
                {brief.analysis?.source === "catalog"
                  ? "Working proposal"
                  : "AI proposal"}
              </AILabel>
              {analyzingStrategy && (
                <span className="inline-flex items-center gap-2 text-[11px] text-[#667385]">
                  <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                  Asking the strategy agent…
                </span>
              )}
            </div>
            <p className="mt-3 text-[14px] leading-6 text-[#344158]">
              {brief.analysis?.summary}
            </p>
            <p className="mt-2 text-[10px] text-[#8a93a2]">{brief.analysis?.modelNote}</p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#3f7d61]">
                  Decisions
                </p>
                <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#536176]">
                  {brief.analysis?.decisions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9a5c17]">
                  Assumptions
                </p>
                <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#536176]">
                  {brief.analysis?.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9a5c17]">
                  Missing evidence
                </p>
                <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#536176]">
                  {brief.analysis?.missingEvidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            {strategyError && (
              <p className="mt-4 text-[12px] text-[#76524e]">
                {strategyError} The catalog proposal remains available.
              </p>
            )}
          </div>

          <div className="surface overflow-hidden" data-testid="metric-proposals">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f4] px-6 py-4">
              <div>
                <p className="eyebrow">Recommended metrics</p>
                <p className="mt-1 text-[12px] text-[#667385]">
                  Confirm a target, or skip and leave targets empty until Data is profiled.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={skipTargets}
                data-testid="skip-targets"
              >
                Skip targets for now
              </Button>
            </div>
            <div className="divide-y divide-[#eef1f4]">
              {brief.metrics.map((metric) => (
                <article key={metric.id} className="grid gap-3 px-6 py-4 lg:grid-cols-[1.2fr_1fr]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-[#1c2b44]">{metric.name}</h3>
                      <StatusBadge status={metric.category} />
                      <StatusBadge status={metric.status} />
                    </div>
                    <p className="mt-2 text-[12px] leading-5 text-[#546277]">{metric.definition}</p>
                    <p className="mt-2 text-[11px] leading-5 text-[#6a7486]">
                      Standard: {metric.measurementStandard}
                    </p>
                    <p className="mt-1 text-[10px] text-[#8a93a2]">
                      Formula: {metric.formula} · Fields: {metric.requiredFields.join(", ") || "To be confirmed"}
                    </p>
                  </div>
                  <label className="block">
                    <span className="text-[11px] font-medium text-[#7a8496]">
                      Target {brief.targetsSkipped ? "(skipped)" : ""}
                    </span>
                    <input
                      data-testid={`metric-target-${metric.id}`}
                      value={metric.target}
                      onChange={(event) => updateMetricTarget(metric.id, event.target.value)}
                      placeholder={metric.suggestedTarget || "Leave empty to skip"}
                      className="mt-1 min-h-10 w-full rounded-[6px] border border-[#d6dce5] px-3 text-[13px] text-[#24324b] outline-none focus:border-[#7f94d2]"
                    />
                    <span className="mt-1 block text-[10px] text-[#8a93a2]">
                      Suggested: {metric.suggestedTarget || "None"}
                    </span>
                  </label>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
