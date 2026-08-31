import { DemoShell, ServingUnavailable } from "@/components/enterprise-demo/DemoShell";
import { FollowUpAsk } from "@/components/enterprise-demo/FollowUpAsk";
import { MetricDefinitionButton } from "@/components/enterprise-demo/MetricDefinitionButton";
import { TrendSparkline } from "@/components/enterprise-demo/TrendSparkline";
import { asList, asRecord, formatCount, formatRate } from "@/lib/people/format";
import { loadAttritionCase } from "@/lib/people/demo-payload";
import { peopleServingConfigured } from "@/lib/people/serving";

export const dynamic = "force-dynamic";

export default async function AttritionCasePage() {
  if (!peopleServingConfigured()) return <ServingUnavailable />;
  const data = await loadAttritionCase();
  const metric = asRecord(data.retention.metric);
  const trend = asList(asRecord(data.retention.trend).points).map((point) => ({
    as_of: String(point.as_of ?? ""),
    value: Number(point.value ?? 0),
  }));
  const byLocation = asList(data.retention.by_location);
  const byLevel = asList(data.retention.by_level);
  const byTenure = asList(data.retention.by_tenure);
  const mobility = asRecord(data.mobility.internal_mobility);
  const pay = asRecord(data.retention.compensation);
  const skillRows = asList(data.skills.gaps).filter((row) => row.is_critical);
  const recs = asList(data.recommendations.recommendations);

  return (
    <DemoShell active="attrition">
      <article>
        <p className="eyebrow">Case 3 · Workforce Intelligence + AI</p>
        <h1 className="mt-3 max-w-3xl text-[32px] font-bold tracking-[-0.04em] text-[#13203a]">
          Why is Engineering voluntary attrition increasing?
        </h1>
        <p className="mt-4 max-w-3xl text-[20px] font-semibold leading-snug text-[#13203a]">
          {data.headline}
        </p>
        <div className="mt-3">
          <MetricDefinitionButton definition={data.definition} />
        </div>
        <p className="mt-3 text-[13px] text-[#546277]">
          Latest Engineering voluntary attrition {formatRate(metric.value)} on the current
          trusted snapshot.
        </p>

        <section className="mt-8">
          <p className="eyebrow">What changed</p>
          <div className="surface mt-3 p-3">
            <TrendSparkline points={trend} />
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Where</p>
            <ul className="mt-2 space-y-1 text-[13px] text-[#3e4c61]">
              {byLocation.slice(0, 5).map((row) => (
                <li key={String(row.location_id)}>
                  {String(row.location_id)} · {formatRate(row.voluntary_attrition_rate)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Who · level</p>
            <ul className="mt-2 space-y-1 text-[13px] text-[#3e4c61]">
              {byLevel.slice(0, 5).map((row) => (
                <li key={String(row.job_level)}>
                  {String(row.job_level)} · {formatRate(row.voluntary_attrition_rate)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Who · tenure</p>
            <ul className="mt-2 space-y-1 text-[13px] text-[#3e4c61]">
              {byTenure.slice(0, 5).map((row) => (
                <li key={String(row.tenure_band)}>
                  {String(row.tenure_band)} · {formatRate(row.voluntary_attrition_rate)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-8">
          <p className="eyebrow">Related signals</p>
          <ul className="mt-3 space-y-1 text-[13px] leading-6 text-[#3e4c61]">
            <li>Internal mobility {formatRate(mobility.value)}</li>
            <li>
              Median base {formatCount(pay.median_base_usd)} · compa-ratio{" "}
              {typeof pay.mean_compa_ratio === "number" ? Number(pay.mean_compa_ratio).toFixed(2) : "—"}
            </li>
            <li>
              Span of control {typeof data.span.value === "number" ? Number(data.span.value).toFixed(1) : "—"} ·
              engagement {typeof data.engagement.value === "number" ? Number(data.engagement.value).toFixed(0) : "—"}
            </li>
          </ul>
        </section>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <section className="surface p-4" data-testid="observed-evidence">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
              Observed evidence
            </p>
            <ul className="mt-2 space-y-2 text-[13px] leading-6 text-[#3e4c61]">
              <li>Attrition is not uniform across Engineering locations, levels, or tenure.</li>
              <li>The same slices can be compared to mobility and pay position from certified marts.</li>
            </ul>
          </section>
          <section className="surface p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
              Possible explanations
            </p>
            <p className="mt-2 text-[12px] text-[#8a571c]">Hypotheses, not proven causes.</p>
            <ul className="mt-2 space-y-2 text-[13px] leading-6 text-[#546277]">
              <li>Local labor-market pressure may concentrate exits in a few sites.</li>
              <li>Low internal mobility can coincide with higher attrition without proving substitution.</li>
              <li>Pay vs midpoint may matter in high-cost locations; the mart shows association only.</li>
            </ul>
          </section>
        </div>

        <section className="mt-8" data-testid="skills-learning">
          <p className="eyebrow">Could we build critical skills internally?</p>
          <p className="mt-3 text-[13px] leading-6 text-[#546277]">
            Internal workforce: Synthetic · O*NET: Public · Microsoft Learn: Public
          </p>
          <ul className="mt-4 space-y-2">
            {skillRows.map((row) => (
              <li
                key={String(row.skill_id)}
                className="flex items-center justify-between border-b border-[#eef0f4] py-2 text-[13px]"
              >
                <span className="font-medium text-[#1c2b44]">{String(row.skill_name)}</span>
                <span className="text-[#546277]">
                  coverage {formatRate(row.internal_coverage_rate)} · gap {formatRate(row.gap_rate)} · n=
                  {formatCount(row.workers_in_family)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
            Relevant learning (Microsoft Learn)
          </p>
          <ul className="mt-2 space-y-2 text-[13px]">
            {recs.slice(0, 5).map((row) => (
              <li key={String(row.content_id)}>
                <a
                  className="font-medium text-[#3157c9] hover:underline"
                  href={String(row.url ?? "#")}
                  target="_blank"
                  rel="noreferrer"
                >
                  {String(row.title)}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <p className="eyebrow">What I would investigate next</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] leading-6 text-[#3e4c61]">
            <li>Inspect the top two Engineering locations with the HRBP before a company-wide program.</li>
            <li>Compare promotion and lateral volume on the same tenure and level slices.</li>
            <li>Use the current trusted snapshot only; keep the APAC HRIS replay out of the board pack.</li>
          </ol>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
            Reasonable leadership actions
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-[14px] leading-6 text-[#3e4c61]">
            <li>Ask HRBPs in the highest-rate locations for stay-risk context before changing policy.</li>
            <li>Review promotion velocity on the same tenure slices as a mobility signal, not a cause.</li>
            <li>Offer targeted learning against the largest critical-skill gaps where coverage is thin.</li>
          </ul>
        </section>
        <FollowUpAsk demoCase="attrition" />
      </article>
    </DemoShell>
  );
}
