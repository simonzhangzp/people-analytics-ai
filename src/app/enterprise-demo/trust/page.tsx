import { DemoShell, ServingUnavailable } from "@/components/enterprise-demo/DemoShell";
import { FollowUpAsk } from "@/components/enterprise-demo/FollowUpAsk";
import { MetricDefinitionButton } from "@/components/enterprise-demo/MetricDefinitionButton";
import { TrustIndicators } from "@/components/enterprise-demo/format";
import { formatCount } from "@/lib/people/format";
import { headcountLineageSteps, loadTrustCase } from "@/lib/people/demo-payload";
import { peopleServingConfigured } from "@/lib/people/serving";

export const dynamic = "force-dynamic";

export default async function TrustCasePage() {
  if (!peopleServingConfigured()) return <ServingUnavailable />;
  const data = await loadTrustCase();
  const healthy = data.metric.quality_status === "healthy" && data.metric.trusted !== false;
  const freshness = data.metric.freshness as Record<string, unknown> | undefined;
  const fresh = String(freshness?.freshness_status ?? "healthy") !== "failed";
  const lineageSteps = headcountLineageSteps(data.lineage);

  return (
    <DemoShell active="trust">
      <article>
        <p className="eyebrow">Case 1 · Governed People Data</p>
        <h1 className="mt-3 max-w-3xl text-[32px] font-bold tracking-[-0.04em] text-[#13203a]">
          Can I trust Engineering Headcount?
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-[#546277]">
          Yes — this is the current published snapshot, not the APAC incident replay.
        </p>

        <div className="surface mt-6 p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#738097]">
            Engineering Headcount
          </p>
          <p className="metric-number mt-2" data-testid="engineering-headcount">
            {formatCount(data.metric.value)}
          </p>
          <TrustIndicators certified healthy={healthy} fresh={fresh} />
          <dl className="mt-5 grid gap-3 text-[13px] text-[#546277] sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">As-of</dt>
              <dd className="mt-1 text-[#1c2b44]">{String(data.snapshot.as_of_date ?? data.metric.as_of)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Owner</dt>
              <dd className="mt-1 text-[#1c2b44]">{String(data.definition.owner ?? "People Analytics")}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
                Refresh
              </dt>
              <dd className="mt-1 text-[#1c2b44]">Daily certified snapshot</dd>
            </div>
          </dl>
          <div className="mt-4">
            <MetricDefinitionButton definition={data.definition} />
          </div>
        </div>

        <div className="mt-8">
          <p className="eyebrow">How the number is produced</p>
          <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {lineageSteps.map((step, index) => (
              <li key={step.label} className="flex items-center gap-2 text-[13px] font-semibold text-[#1c2b44]">
                {index > 0 ? <span className="hidden text-[#9aa7b8] sm:inline">→</span> : null}
                <span className="rounded-[6px] border border-[#d2e8dc] bg-[#eaf5ef] px-3 py-2">
                  {step.label}
                  <span className="mt-1 block text-[10px] font-medium text-[#667085]">{step.table}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-8 space-y-3">
          <details className="surface p-4">
            <summary className="cursor-pointer text-[14px] font-semibold text-[#1c2b44]">
              Metric Definition
            </summary>
            <dl className="mt-3 space-y-3 text-[13px] leading-6 text-[#546277]">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
                  Business definition
                </dt>
                <dd className="mt-1">{String(data.definition.business_definition)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Formula</dt>
                <dd className="mt-1 font-mono text-[12px] text-[#3e4c61]">
                  {String(data.definition.formula ?? data.definition.formula_sql)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Population</dt>
                <dd className="mt-1">{String(data.definition.population_rules ?? "—")}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Exclusions</dt>
                <dd className="mt-1">{String(data.definition.exclusions ?? "—")}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Time logic</dt>
                <dd className="mt-1">{String(data.definition.time_logic ?? "—")}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Owner</dt>
                <dd className="mt-1">{String(data.definition.owner ?? "People Analytics")}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Version</dt>
                <dd className="mt-1">{String(data.definition.version ?? 1)}</dd>
              </div>
            </dl>
          </details>
          <details className="surface p-4">
            <summary className="cursor-pointer text-[14px] font-semibold text-[#1c2b44]">
              Data Lineage
            </summary>
            <pre className="mt-3 overflow-auto text-[11px] leading-5 text-[#546277]">
              {JSON.stringify(data.lineage, null, 2)}
            </pre>
          </details>
          <details className="surface p-4">
            <summary className="cursor-pointer text-[14px] font-semibold text-[#1c2b44]">
              Quality Tests
            </summary>
            <ul className="mt-3 space-y-1 text-[13px] text-[#546277]">
              {data.tests.slice(0, 12).map((row) => (
                <li key={`${row.test_name}-${row.checked_at ?? ""}`}>
                  {row.status === "passed" ? "Pass" : "Fail"} · {row.test_name}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-[#667085]">
              The APAC volume failure belongs to incident replay, not this published snapshot.
            </p>
          </details>
        </div>
        <FollowUpAsk demoCase="trust" />
      </article>
    </DemoShell>
  );
}
