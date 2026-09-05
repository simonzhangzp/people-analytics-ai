import Link from "next/link";
import { DemoShell, ServingUnavailable } from "@/components/enterprise-demo/DemoShell";
import { FollowUpAsk } from "@/components/enterprise-demo/FollowUpAsk";
import { MetricCaption } from "@/components/enterprise-demo/MetricCaption";
import { MetricDefinitionButton } from "@/components/enterprise-demo/MetricDefinitionButton";
import { RoleSwitcher } from "@/components/enterprise-demo/RoleSwitcher";
import { TrustIndicators } from "@/components/enterprise-demo/format";
import { asRecord, formatCount } from "@/lib/people/format";
import { DEFAULT_IDENTITY } from "@/lib/people/demo-identities";
import { headcountLineageSteps, loadTrustCase } from "@/lib/people/demo-payload";
import { pageMetadata } from "@/lib/site-metadata";
import { peopleV2Configured } from "@/lib/people/v2-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = pageMetadata({
  title: "Can I trust Engineering Headcount?",
  description:
    "Case 1: certified Engineering and company Headcount from people_v2, with lineage, quality tests, and the data-v1 as-of 2026-08-31 snapshot.",
  path: "/enterprise-demo/trust",
});

export default async function TrustCasePage({
  searchParams,
}: {
  searchParams?: Promise<{ identity?: string }> | { identity?: string };
}) {
  if (!peopleV2Configured()) return <ServingUnavailable />;
  const params = await Promise.resolve(searchParams ?? {});
  const identity = params.identity?.trim() || DEFAULT_IDENTITY;
  const data = await loadTrustCase(identity);
  const healthy = data.metric.quality_status === "healthy" && data.metric.trusted !== false;
  const freshness = data.metric.freshness as Record<string, unknown> | undefined;
  const fresh = String(freshness?.freshness_status ?? "healthy") !== "failed";
  const lineageSteps = headcountLineageSteps(data.lineage.lineage as Record<string, unknown>[]);
  const lineageQuality = String(data.lineage.quality_status ?? "healthy");
  const publishStatus = String(data.lineage.publish_status ?? "published");
  const testsByLayer =
    data.testsByLayer.length > 0
      ? data.testsByLayer
      : [
          {
            layer: "gold",
            tests: [
              {
                test_name: "serving_run.certified",
                test_id: "serving_run.certified",
                layer: "gold",
                object_name: "people_serving_run",
                test_type: "certified",
                blocking: true,
                status: data.run.certified ? "passed" : "failed",
                last_run_at: null,
              },
            ],
          },
        ];
  const lastRunAt = data.tests.find((row) => row.last_run_at)?.last_run_at;

  return (
    <DemoShell
      active="trust"
      railExtra={<RoleSwitcher value={identity} />}
      ai={<FollowUpAsk demoCase="trust" identityId={identity} />}
    >
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
            {formatCount(asRecord(data.metric).value)}
          </p>
          <MetricCaption
            scope={data.engineeringGrain.scope}
            window={data.engineeringGrain.window}
            asOf={data.engineeringGrain.asOf}
          />
          <TrustIndicators certified={data.run.certified === true} healthy={healthy} fresh={fresh} />
          <dl className="mt-5 grid gap-3 text-[13px] text-[#546277] sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">As-of</dt>
              <dd className="mt-1 text-[#1c2b44]">{String(data.snapshot.as_of_date ?? asRecord(data.metric).as_of)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Owner</dt>
              <dd className="mt-1 text-[#1c2b44]">{String(asRecord(data.definition).owner ?? "People Analytics")}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
                Certified run
              </dt>
              <dd className="mt-1 text-[#1c2b44]" data-testid="parity-headcount">
                Company {formatCount(data.companyMetric.value)}
                <MetricCaption
                  scope={data.companyGrain.scope}
                  window={data.companyGrain.window}
                  asOf={data.companyGrain.asOf}
                />
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[12px] text-[#667085]">
            Company Headcount matches the parity table when serving_run.certified is true. SHA{" "}
            {String(data.run.simulator_code_sha ?? "").slice(0, 12)}.
          </p>
          <div className="mt-4">
            <MetricDefinitionButton definition={data.definition} />
          </div>
          <p className="mt-4">
            <Link
              href="/enterprise-demo/incident"
              className="text-[12px] font-semibold text-[#667085] hover:text-[#3157c9]"
              data-testid="historical-incidents"
            >
              View historical incidents
            </Link>
          </p>
        </div>

        <div className="mt-8">
          <p className="eyebrow">Lineage</p>
          <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" data-testid="trust-lineage">
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
          <p className="mt-3 text-[12px] text-[#667085]">
            Quality {lineageQuality} · Publish {publishStatus.replaceAll("_", " ")} · health{" "}
            {String(data.health.status ?? "n/a")}
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <section className="surface p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Definition</p>
            <p className="mt-2 text-[13px] leading-6 text-[#546277]">
              {String(asRecord(data.definition).business_definition)}
            </p>
            <p className="mt-2 font-mono text-[11px] text-[#3e4c61]">
              {String(asRecord(data.definition).formula ?? asRecord(data.definition).formula_sql)}
            </p>
          </section>
          <section className="surface p-4" data-testid="quality-tests">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">Quality</p>
            <p className="mt-2 text-[12px] text-[#667085]">
              {data.tests.length} tests in the serving registry
              {lastRunAt ? ` · last run ${lastRunAt.slice(0, 10)}` : ""}
            </p>
            <div className="mt-3 space-y-4">
              {testsByLayer.map((group) => (
                <div key={group.layer} data-testid={`quality-layer-${group.layer}`}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
                    {group.layer} · {group.tests.length}
                  </p>
                  <ul className="mt-1 space-y-1 text-[13px] text-[#546277]">
                    {group.tests.map((row) => (
                      <li key={row.test_id || row.test_name}>
                        {row.status === "passed" ? "Pass" : "Fail"} · {row.test_id || row.test_name}
                        {row.test_type ? ` · ${row.test_type}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {data.tests.some((row) => row.status !== "passed") ? null : (
              <p className="mt-2 text-[12px] text-[#2f7659]">All tests in this trusted snapshot passed.</p>
            )}
          </section>
        </div>
      </article>
    </DemoShell>
  );
}
