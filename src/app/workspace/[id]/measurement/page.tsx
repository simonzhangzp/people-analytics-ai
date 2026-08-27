"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/demo-provider";
import { AILabel, Button, PageHeader, StatusBadge } from "@/components/ui";
import {
  filterMetricCatalog,
  inferMetricDomain,
  metricCatalogStats,
  metricDomains,
} from "@/lib/strategy/metric-catalog";
import { strategyCategories } from "@/lib/strategy/catalog";
import type { CustomMetricDraft, MetricRole, StrategyCategory } from "@/types/strategy";

const emptyDraft: CustomMetricDraft = {
  name: "",
  definition: "",
  measurementStandard: "",
  formula: "",
  unit: "",
  category: "Outcome",
  domain: "Workforce Planning",
  suggestedTarget: "",
  requiredFields: "",
};

export default function MeasurementPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id ?? "demo";
  const {
    metricReviewed,
    reviewMetric,
    brief,
    addCatalogMetric,
    addCustomMetric,
    removeMetric,
    updateMetricTarget,
  } = useDemo();

  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<StrategyCategory | "All">("All");
  const [role, setRole] = useState<MetricRole | "All">("All");
  const [draft, setDraft] = useState<CustomMetricDraft>(emptyDraft);
  const stats = metricCatalogStats();
  const selectedIds = new Set(brief?.metrics.map((metric) => metric.id) ?? []);
  const outcome = brief?.metrics.find((metric) => metric.category === "Outcome");

  const items = useMemo(
    () => filterMetricCatalog(query, domain, role),
    [domain, query, role],
  );

  const onCustom = () => {
    if (!draft.name.trim() || !draft.definition.trim()) return;
    addCustomMetric({
      ...draft,
      domain: draft.domain || inferMetricDomain(draft.name, draft.definition),
    });
    setDraft(emptyDraft);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Measurement"
        title="Choose or define the People metrics"
        description="Select from a classified library of People metrics, or write your own definition. Strategy proposals stay on the plan until you remove them. Targets can stay empty."
        action={
          metricReviewed ? (
            <Link
              href={`/workspace/${workspaceId}/data`}
              className="inline-flex min-h-10 items-center justify-center rounded-[6px] bg-[#3157c9] px-4 text-[13px] font-semibold text-white"
              data-testid="continue-data"
            >
              Continue to Data
            </Link>
          ) : (
            <Button
              onClick={reviewMetric}
              disabled={!brief || brief.metrics.length === 0}
              data-testid="review-metric"
            >
              Confirm measurement plan
            </Button>
          )
        }
      />

      {brief ? (
        <section className="surface p-6">
          <p className="eyebrow">Selected {brief.intentKind}</p>
          <h2 className="mt-3 text-[18px] font-semibold text-[#1c2b44]">{brief.title}</h2>
          <p className="mt-2 text-[13px] leading-6 text-[#546277]">{brief.statement}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-[8px] border border-[#e5e9ef] bg-[#fbfcfe] px-4 py-3">
              <p className="text-[11px] font-medium text-[#7a8496]">Outcome metric</p>
              <p className="mt-1 text-[14px] font-semibold text-[#1f2d46]">
                {outcome?.name ?? "Not designated"}
              </p>
            </div>
            <div className="rounded-[8px] border border-[#e5e9ef] px-4 py-3">
              <p className="text-[11px] font-medium text-[#7a8496]">On the plan</p>
              <p className="mt-1 text-[14px] font-semibold text-[#1f2d46]">
                {brief.metrics.length} metrics
              </p>
            </div>
            <div className="rounded-[8px] border border-[#e5e9ef] px-4 py-3">
              <p className="text-[11px] font-medium text-[#7a8496]">Targets</p>
              <p className="mt-1 text-[14px] font-semibold text-[#1f2d46]">
                {brief.targetsSkipped
                  ? "Skipped for now"
                  : `${brief.metrics.filter((metric) => metric.target).length} entered`}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="surface p-6">
          <p className="text-[13px] text-[#546277]">
            No strategy is required to start. Add metrics from the library or write a
            definition, then confirm the measurement plan.
          </p>
        </section>
      )}

      <section className="surface overflow-hidden" data-testid="measurement-plan">
        <div className="border-b border-[#edf0f4] px-6 py-4">
          <p className="eyebrow">Measurement plan</p>
          <p className="mt-1 text-[12px] text-[#667385]">
            These definitions are proposals until you confirm the plan. Remove any that do not
            belong.
          </p>
        </div>
        {brief && brief.metrics.length > 0 ? (
          <div className="divide-y divide-[#eef1f4]">
            {brief.metrics.map((metric) => (
              <article
                key={metric.id}
                className="grid gap-3 px-6 py-4 lg:grid-cols-[1.3fr_0.9fr_auto]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-semibold text-[#1c2b44]">{metric.name}</h3>
                    <StatusBadge status={metric.category} />
                    <StatusBadge status={metric.origin === "custom" ? "Needs input" : metric.status} />
                  </div>
                  {metric.origin !== "catalog" && (
                    <div className="mt-2">
                      <AILabel>
                        {metric.origin === "custom" ? "Written by you" : "AI proposal"}
                      </AILabel>
                    </div>
                  )}
                  <p className="mt-2 text-[12px] leading-5 text-[#546277]">{metric.definition}</p>
                  <p className="mt-2 text-[11px] leading-5 text-[#6a7486]">
                    Standard: {metric.measurementStandard}
                  </p>
                  <p className="mt-1 text-[10px] text-[#8a93a2]">
                    Formula: {metric.formula} · Fields:{" "}
                    {metric.requiredFields.join(", ") || "To be confirmed"}
                  </p>
                </div>
                <label className="block">
                  <span className="text-[11px] font-medium text-[#7a8496]">Target</span>
                  <input
                    data-testid={`plan-target-${metric.id}`}
                    value={metric.target}
                    onChange={(event) => updateMetricTarget(metric.id, event.target.value)}
                    placeholder={metric.suggestedTarget || "Leave empty to skip"}
                    className="mt-1 min-h-10 w-full rounded-[6px] border border-[#d6dce5] px-3 text-[13px] text-[#24324b] outline-none focus:border-[#7f94d2]"
                  />
                </label>
                <button
                  type="button"
                  data-testid={`remove-metric-${metric.id}`}
                  onClick={() => removeMetric(metric.id)}
                  className="self-start text-[11px] font-semibold text-[#697487] hover:text-[#39475d]"
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="px-6 py-5 text-[13px] text-[#667385]">
            No metrics on the plan yet. Select from the library or write your own.
          </p>
        )}
      </section>

      <section className="surface p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">People metric library</p>
            <p className="mt-2 text-[13px] text-[#546277]">
              {stats.total} classified metrics · {stats.byRole.Outcome} outcomes ·{" "}
              {stats.byRole.Guardrail} guardrails · {stats.byRole.Driver} drivers. Sources
              include ISO 30414, SHRM, CIPD, Gartner, Gallup, and Deloitte public practice.
            </p>
          </div>
          <p className="text-[11px] text-[#7a8496]">{items.length} matching</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_200px_160px]">
          <input
            data-testid="metric-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search metrics, e.g. Time to Fill, eNPS, headcount"
            className="min-h-10 rounded-[6px] border border-[#d6dce5] px-3 text-[13px] text-[#24324b] outline-none focus:border-[#7f94d2]"
          />
          <select
            value={domain}
            onChange={(event) => setDomain(event.target.value as StrategyCategory | "All")}
            className="min-h-10 rounded-[6px] border border-[#d6dce5] bg-white px-3 text-[13px] text-[#24324b]"
          >
            <option value="All">All domains</option>
            {metricDomains.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as MetricRole | "All")}
            className="min-h-10 rounded-[6px] border border-[#d6dce5] bg-white px-3 text-[13px] text-[#24324b]"
          >
            <option value="All">All roles</option>
            <option value="Outcome">Outcome</option>
            <option value="Guardrail">Guardrail</option>
            <option value="Driver">Driver</option>
          </select>
        </div>
        <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => {
            const selected = selectedIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`metric-item-${item.id}`}
                onClick={() => addCatalogMetric(item.id)}
                disabled={selected}
                className={`w-full rounded-[8px] border px-4 py-3 text-left ${
                  selected
                    ? "border-[#dbe3f8] bg-[#eef2fb]"
                    : "border-[#e5e9ef] bg-[#fbfcfe] hover:border-[#c5cfe0]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold text-[#1f2d46]">{item.name}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#738094]">
                    {item.domain}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#738094]">
                    {item.category}
                  </span>
                  {selected && (
                    <span className="text-[10px] font-semibold text-[#2f7659]">On plan</span>
                  )}
                </div>
                <p className="mt-1 text-[12px] leading-5 text-[#5c697d]">{item.definition}</p>
                <p className="mt-2 text-[10px] text-[#8a93a2]">
                  Standard: {item.measurementStandard} · Source: {item.source}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="surface p-5 sm:p-6">
        <p className="eyebrow">Or write your own metric</p>
        <div className="mt-4 grid gap-3">
          <input
            data-testid="custom-metric-name"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="Metric name"
            className="min-h-10 rounded-[6px] border border-[#d6dce5] px-3 text-[13px] text-[#24324b] outline-none focus:border-[#7f94d2]"
          />
          <textarea
            data-testid="custom-metric-definition"
            value={draft.definition}
            onChange={(event) =>
              setDraft((current) => ({ ...current, definition: event.target.value }))
            }
            rows={3}
            placeholder="Definition: what is counted, for whom, and over what time window."
            className="rounded-[6px] border border-[#d6dce5] px-3 py-2 text-[13px] leading-5 text-[#24324b] outline-none focus:border-[#7f94d2]"
          />
          <textarea
            data-testid="custom-metric-standard"
            value={draft.measurementStandard}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                measurementStandard: event.target.value,
              }))
            }
            rows={2}
            placeholder="Measurement standard: inclusions, exclusions, and minimum sample."
            className="rounded-[6px] border border-[#d6dce5] px-3 py-2 text-[13px] leading-5 text-[#24324b] outline-none focus:border-[#7f94d2]"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={draft.formula}
              onChange={(event) =>
                setDraft((current) => ({ ...current, formula: event.target.value }))
              }
              placeholder="Formula"
              className="min-h-10 rounded-[6px] border border-[#d6dce5] px-3 text-[13px] text-[#24324b] outline-none focus:border-[#7f94d2]"
            />
            <input
              value={draft.suggestedTarget}
              onChange={(event) =>
                setDraft((current) => ({ ...current, suggestedTarget: event.target.value }))
              }
              placeholder="Suggested target (optional)"
              className="min-h-10 rounded-[6px] border border-[#d6dce5] px-3 text-[13px] text-[#24324b] outline-none focus:border-[#7f94d2]"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  category: event.target.value as MetricRole,
                }))
              }
              className="min-h-10 rounded-[6px] border border-[#d6dce5] bg-white px-3 text-[13px] text-[#24324b]"
            >
              <option value="Outcome">Outcome</option>
              <option value="Guardrail">Guardrail</option>
              <option value="Driver">Driver</option>
            </select>
            <select
              value={draft.domain}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  domain: event.target.value as StrategyCategory,
                }))
              }
              className="min-h-10 rounded-[6px] border border-[#d6dce5] bg-white px-3 text-[13px] text-[#24324b]"
            >
              {strategyCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              value={draft.unit}
              onChange={(event) =>
                setDraft((current) => ({ ...current, unit: event.target.value }))
              }
              placeholder="Unit, e.g. days or %"
              className="min-h-10 rounded-[6px] border border-[#d6dce5] px-3 text-[13px] text-[#24324b] outline-none focus:border-[#7f94d2]"
            />
          </div>
          <input
            value={draft.requiredFields}
            onChange={(event) =>
              setDraft((current) => ({ ...current, requiredFields: event.target.value }))
            }
            placeholder="Required fields, comma-separated"
            className="min-h-10 rounded-[6px] border border-[#d6dce5] px-3 text-[13px] text-[#24324b] outline-none focus:border-[#7f94d2]"
          />
          <div>
            <Button
              onClick={onCustom}
              disabled={!draft.name.trim() || !draft.definition.trim()}
              data-testid="submit-custom-metric"
            >
              Add this metric
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
