import Link from "next/link";
import { formatCount } from "@/lib/people/format";
import {
  DATA_WINDOW_END,
  DATA_WINDOW_START,
  ENVIRONMENT_DOMAINS,
  ENVIRONMENT_FACTS,
  SYNTHETIC_DISCLAIMER,
} from "@/lib/people/environment-facts";
import type { HomePlatformFacts } from "@/lib/people/platform-facts";
import { cn } from "@/lib/utils";

/**
 * Demo Environment Overview (brief §7). Static facts come from committed data-v1
 * documentation; headcount / certified metrics / quality tests come from serving.
 */
export function EnvironmentOverview({ facts }: { facts: HomePlatformFacts }) {
  const liveRow = [
    {
      testId: "fact-certified-headcount",
      value: formatCount(facts.headcount),
      raw: facts.headcount,
      label: "Certified Headcount",
      detail: `people_get_metric_for(headcount) · as of ${facts.asOf}`,
    },
    {
      testId: "fact-certified-metrics",
      value: facts.certifiedMetrics == null ? "—" : String(facts.certifiedMetrics),
      raw: facts.certifiedMetrics,
      label: "Certified metrics",
      detail: "people_v2.people_metric · status certified",
    },
    {
      testId: "fact-quality-tests",
      value: facts.qualityTests == null ? "—" : String(facts.qualityTests),
      raw: facts.qualityTests,
      label: "Automated quality tests",
      detail: "people_v2.people_quality_test · bronze / silver / gold",
    },
    {
      testId: "fact-serving-freshness",
      value: "Frozen",
      raw: facts.freshness,
      label: "Certified snapshot",
      detail: facts.freshness,
    },
  ];
  const staticFacts = ENVIRONMENT_FACTS.filter((row) => row.id !== "headcount");

  return (
    <section className="mt-28" data-testid="platform-facts" aria-labelledby="environment-title">
      <p className="eyebrow">Demo environment</p>
      <h2 id="environment-title" className="section-title mt-3 max-w-3xl">
        <span className="hl hl-gold">Synthetic</span> data. Real enterprise complexity.
      </h2>
      <p className="lede mt-4 max-w-3xl">
        A seeded business-event simulator emits Frappe HR and Greenhouse documents for five years,
        then the same pipeline, tests and metric registry an enterprise would run turn them into
        certified aggregates.
      </p>
      <p
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold-line bg-gold-soft px-3 py-1.5 text-[12px] font-semibold text-gold-dark"
        data-testid="environment-disclaimer"
      >
        {SYNTHETIC_DISCLAIMER}
      </p>

      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {liveRow.map((item, index) => (
          <div
            key={item.label}
            className={cn(
              "surface relative overflow-hidden p-5",
              index === 0 && "bg-certified-soft/40 ring-1 ring-certified-line",
            )}
            data-testid={item.testId}
            data-value={item.raw == null ? "" : String(item.raw)}
            title={item.detail}
          >
            <span
              aria-hidden="true"
              className={cn("absolute inset-x-0 top-0 h-1", index === 0 ? "bg-certified" : "bg-primary")}
            />
            <div className={cn("metric-number", index === 0 && "text-certified-dark")}>{item.value}</div>
            <div className="mt-2 text-[12.5px] font-semibold text-ink">{item.label}</div>
            <div className="mt-1 truncate font-mono text-[11px] text-faint">{item.detail}</div>
          </div>
        ))}
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {staticFacts.map((item) => (
          <div key={item.id} className="surface-flat p-5" title={item.source} data-testid={`env-fact-${item.id}`}>
            <dt className="text-[12px] font-semibold text-muted">{item.label}</dt>
            <dd className="display mt-1 text-[26px] font-bold tracking-[-0.03em] text-ink">{item.value}</dd>
            <dd className="mt-1 text-[12px] leading-5 text-body-2">{item.detail}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Domains</span>
        {ENVIRONMENT_DOMAINS.map((domain) => (
          <span
            key={domain}
            className="rounded-full border border-edge bg-white px-2.5 py-1 text-[12px] text-body"
          >
            {domain}
          </span>
        ))}
      </div>
      <p className="mt-4 text-[13px] leading-6 text-muted">
        Window {DATA_WINDOW_START} → {DATA_WINDOW_END}. Every number here is from committed data-v1
        documentation or the serving RPCs; nothing is estimated for effect.{" "}
        <Link href="/dataset" className="font-semibold text-primary hover:underline">
          Dataset details
        </Link>
      </p>
    </section>
  );
}
