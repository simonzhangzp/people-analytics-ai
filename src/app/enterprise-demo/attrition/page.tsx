import { DemoShell, ServingUnavailable } from "@/components/enterprise-demo/DemoShell";
import { FollowUpAsk } from "@/components/enterprise-demo/FollowUpAsk";
import { MetricCaption } from "@/components/enterprise-demo/MetricCaption";
import { MetricDefinitionButton } from "@/components/enterprise-demo/MetricDefinitionButton";
import { RoleSwitcher } from "@/components/enterprise-demo/RoleSwitcher";
import { TrendSparkline } from "@/components/enterprise-demo/TrendSparkline";
import { asList, asRecord, formatRate } from "@/lib/people/format";
import { DEFAULT_IDENTITY, identityShowsCompaRatio } from "@/lib/people/demo-identities";
import { loadAttritionCase } from "@/lib/people/demo-payload";
import { learningRecommendationsForGaps } from "@/lib/people/learn-catalog";
import { VOL_T12M_WINDOW } from "@/lib/people/metric-grain";
import { pageMetadata } from "@/lib/site-metadata";
import { peopleV2Configured } from "@/lib/people/v2-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = pageMetadata({
  title: "Why is Engineering attrition increasing?",
  description:
    "Case 3: Engineering voluntary attrition on a trailing-12m annualized grain, with min-cell suppression by identity and public Microsoft Learn paths for skill gaps.",
  path: "/enterprise-demo/attrition",
});

export default async function AttritionCasePage({
  searchParams,
}: {
  searchParams?: Promise<{ identity?: string }> | { identity?: string };
}) {
  if (!peopleV2Configured()) return <ServingUnavailable />;
  const params = await Promise.resolve(searchParams ?? {});
  const identity = params.identity?.trim() || DEFAULT_IDENTITY;
  const data = await loadAttritionCase(identity);
  const metric = asRecord(data.metric);
  const trend = asList(asRecord(data.trend).points).map((point) => ({
    as_of: String(point.as_of ?? ""),
    value: Number(point.value ?? 0),
  }));
  const breakdown = asRecord(data.breakdown);
  const cells = asList(breakdown.cells);
  const suppressed = cells.filter((row) => row.suppressed === true);
  const signals = asRecord(data.signals);
  const compa = asList(signals.compa);
  const mgr = asList(signals.manager_change_reorg);
  const bls = asRecord(signals.bls);
  const skillRows = asList(data.skills);
  const learningRecs = learningRecommendationsForGaps(skillRows);
  const breakdownWindow = String(breakdown.window ?? VOL_T12M_WINDOW);

  return (
    <DemoShell
      active="attrition"
      railExtra={<RoleSwitcher value={identity} />}
      ai={<FollowUpAsk demoCase="attrition" identityId={identity} />}
    >
      <article>
        <p className="eyebrow">Case 3 · Workforce Intelligence + AI</p>
        <h1 className="mt-3 max-w-3xl text-[32px] font-bold tracking-[-0.04em] text-[#13203a]">
          Why is Engineering voluntary attrition increasing?
        </h1>
        <p className="mt-4 max-w-3xl text-[20px] font-semibold leading-snug text-[#13203a]" data-testid="case3-headline">
          {data.headline}
        </p>
        <p className="mt-2 text-[12px] text-[#667085]" data-testid="headline-visible-cells">
          based on cells visible at this access level
        </p>
        <div className="mt-3">
          <MetricDefinitionButton definition={data.definition} />
        </div>
        <p className="mt-4 text-[28px] font-bold tracking-[-0.03em] text-[#13203a]" data-testid="case3-hero-rate">
          {formatRate(metric.value)}
        </p>
        <MetricCaption
          scope={data.engineeringGrain.scope}
          window={data.engineeringGrain.window}
          asOf={data.engineeringGrain.asOf}
        />
        <p className="mt-3 text-[13px] text-[#546277]">
          Company trailing-12m (parity) {formatRate(data.companyMetric.value)}.
        </p>
        <MetricCaption
          scope={data.companyGrain.scope}
          window={data.companyGrain.window}
          asOf={data.companyGrain.asOf}
        />
        <p className="mt-3 text-[13px] text-[#546277]">
          Month view (secondary) {formatRate(asRecord(data.monthMetric).value)}.
        </p>
        {data.priorAsOf ? (
          <p className="text-[13px] text-[#546277]" data-testid="case3-prior-month">
            {data.priorAsOf.slice(0, 7)}: {formatRate(data.prior)}
          </p>
        ) : null}
        <MetricCaption
          scope={data.monthGrain.scope}
          window={data.monthGrain.window}
          asOf={data.monthGrain.asOf}
        />
        <p className="mt-2 text-[12px] text-[#667085]" data-testid="suppression-summary">
          Identity {identity} · min_cell {String(breakdown.min_cell ?? "—")} · {suppressed.length} of{" "}
          {cells.length} location × tenure × grade cells suppressed. Rates use trailing-12m; suppression
          uses as-of month headcount n, not trailing-12m average n.
        </p>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#546277]" data-testid="suppression-changes-conclusion">
          Cell suppression is not cosmetic. Across the four demo identities the hidden cells are 44 /
          42 / 34 / 30. The headline location is computed from cells still visible after min-cell
          suppression at this access level. At People analyst min_cell 5, two six-person slices
          (AMER-NYC · 3–5y · G10 and EMEA-LON · {"<1y"} · G3) enter the ranked list. Neither is
          visible to the site visitor. Suppression changes the conclusion — that is the governance
          demonstration.
        </p>

        <section className="mt-8">
          <p className="eyebrow">What changed</p>
          <div className="surface mt-3 p-3">
            <TrendSparkline points={trend} />
          </div>
        </section>

        <section className="mt-8">
          <p className="eyebrow">Where × tenure × grade (suppression on)</p>
          <p className="mt-2 text-[12px] text-[#667085]" data-testid="breakdown-window">
            Window: {breakdownWindow}. Rate window is trailing-12m. Suppression uses as-of month n, not
            trailing-12m average headcount.
          </p>
          <ul className="mt-3 space-y-1 text-[13px] text-[#3e4c61]" data-testid="location-tenure">
            {data.rankedVisible.map((row) => (
              <li key={String(row.key)}>
                {String(row.location_id ?? row.key)} · {String(row.tenure_band ?? "")} ·{" "}
                {String(row.grade_id ?? "")} · {formatRate(row.value)}
                {row.n != null ? ` · n=${String(row.n)}` : ""}
                <span className="mt-0.5 block text-[11px] text-[#738097]">
                  Window {String(row.window ?? breakdownWindow)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-[#667085]" data-testid="min-cell-hidden">
            Top {data.rankedVisible.length} visible cells
            {data.hiddenCellCount > 0
              ? ` · ${data.hiddenCellCount} cells hidden under min-cell`
              : ""}
            .
          </p>
        </section>

        <section className="mt-8" data-testid="related-signals">
          <p className="eyebrow">Related signals</p>
          <ul className="mt-3 space-y-1 text-[13px] leading-6 text-[#3e4c61]">
            {identityShowsCompaRatio(identity) ? (
              <>
                {compa.map((row) => (
                  <li key={String(row.group)}>
                    Compa-ratio {String(row.group)} median {Number(row.median_compa ?? 0).toFixed(2)} (n=
                    {String(row.n)})
                  </li>
                ))}
                <li className="text-[12px] text-[#667085]" data-testid="related-signals-compa-note">
                  Scenario control vs slice aggregates; not a substitute for the certified Engineering
                  median.
                </li>
              </>
            ) : (
              <li data-testid="related-signals-compa-gate">
                Compa-ratio comparison is available to internal People identities.
              </li>
            )}
            {mgr.map((row) => (
              <li key={String(row.group)}>
                Reorg-class manager change {String(row.group)}: {String(row.manager_changes)} events
                / {String(row.n_workers)} workers
              </li>
            ))}
            <li>
              BLS {String(bls.series ?? "JOLTS")}: {String(bls.note ?? "calibration only")}
            </li>
          </ul>
        </section>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <section className="surface p-4" data-testid="observed-evidence">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
              What we know
            </p>
            <ul className="mt-2 space-y-2 text-[13px] leading-6 text-[#3e4c61]">
              <li>The voluntary attrition definition, period, and grain are certified.</li>
              <li>Rates are not uniform across Engineering locations and tenure bands.</li>
              <li>
                {identityShowsCompaRatio(identity)
                  ? "Compa-ratio lag and reorg-class manager change are related signals, not causes."
                  : "Reorg-class manager change is a related signal, not a cause."}
              </li>
            </ul>
          </section>
          <section className="surface p-4" data-testid="unknown-evidence">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
              What we do not know
            </p>
            <p className="mt-2 text-[12px] text-[#8a571c]">Hypotheses, not proven causes.</p>
            <ul className="mt-2 space-y-2 text-[13px] leading-6 text-[#546277]">
              <li>Why a specific employee left — the mart does not contain exit-interview text.</li>
              <li>Whether pay, mobility, or skill gaps caused the pattern. They can only be compared.</li>
              <li>Whether a local labor-market shock is operating outside this dataset.</li>
            </ul>
          </section>
        </div>

        <section className="mt-8" data-testid="skills-learning">
          <p className="eyebrow">Could we build critical skills internally?</p>
          <p className="mt-3 text-[13px] leading-6 text-[#546277]">
            Internal workforce: Synthetic · O*NET: Public · Microsoft Learn: Public
          </p>
          <ul className="mt-4 space-y-2">
            {skillRows.map((row, index) => (
              <li
                key={String(row.org_id ?? row.job_family ?? index)}
                className="flex items-center justify-between border-b border-[#eef0f4] py-2 text-[13px]"
              >
                <span className="font-medium text-[#1c2b44]">
                  {String(row.job_family ?? "Engineering")}
                  {row.org_id ? ` · ${String(row.org_id)}` : ""}
                </span>
                <span className="text-[#546277]">
                  coverage {formatRate(row.coverage_ratio ?? row.internal_coverage_rate)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
            Relevant learning (Microsoft Learn)
          </p>
          <ul className="mt-2 space-y-2 text-[13px]" data-testid="learning-recs">
            {learningRecs.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  className="font-medium text-[#3157c9] hover:underline"
                  rel="noreferrer"
                  target="_blank"
                >
                  {item.title}
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
      </article>
    </DemoShell>
  );
}
