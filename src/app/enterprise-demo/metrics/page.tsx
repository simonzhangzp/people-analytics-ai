import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { RoleSwitcher } from "@/components/enterprise-demo/RoleSwitcher";
import { DEFAULT_IDENTITY, identityLabel } from "@/lib/people/demo-identities";
import { catalogRow } from "@/lib/people/metric-catalog";
import { asRecord } from "@/lib/people/format";
import { peopleListMetrics } from "@/lib/people/v2-client";
import { pageMetadata } from "@/lib/site-metadata";
import { peopleV2Configured } from "@/lib/people/v2-config";
import { ServingUnavailable } from "@/components/enterprise-demo/DemoShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = pageMetadata({
  title: "Metric Explorer",
  description:
    "Certified People metrics on data-v1: definition, sensitivity, min_cell, and health. Not a KPI wall.",
  path: "/enterprise-demo/metrics",
});

export default async function MetricExplorerPage({
  searchParams,
}: {
  searchParams?: Promise<{ identity?: string }> | { identity?: string };
}) {
  if (!peopleV2Configured()) return <ServingUnavailable />;
  const params = await Promise.resolve(searchParams ?? {});
  const identity = params.identity?.trim() || DEFAULT_IDENTITY;
  const rows = await peopleListMetrics(identity);
  const visible = rows.filter((row) => {
    const overlay = catalogRow(String(row.metric_id ?? ""));
    return overlay || row.metric_id;
  });

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <SiteHeader active="/enterprise-demo" />
      <main className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8">
        <p className="eyebrow">Measurement</p>
        <h1 className="mt-3 max-w-3xl text-[32px] font-bold tracking-[-0.04em] text-[#13203a]">
          {`Which certified metrics can ${identityLabel(identity)} read?`}
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#546277]" data-testid="metrics-takeaway">
          These are certified semantic-layer metrics on the frozen data-v1 snapshot. Confidential
          rows stay in the list only when this identity&apos;s sensitivity ceiling allows them.
          This is a catalog, not a dashboard.
        </p>
        <div className="mt-4 max-w-xs">
          <RoleSwitcher value={identity} />
        </div>
        <p className="mt-3 text-[13px]">
          <Link href="/enterprise-demo/trust" className="font-semibold text-[#3157c9]">
            Back to Trust scorecard
          </Link>
        </p>
        <section className="surface mt-8 overflow-x-auto p-4" data-testid="metric-explorer">
          <table className="w-full text-left text-[12px] text-[#3e4c61]">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#738097]">
                <th className="py-1 pr-2">Metric</th>
                <th className="py-1 pr-2">Question it answers</th>
                <th className="py-1 pr-2">Sensitivity</th>
                <th className="py-1 pr-2">min_cell</th>
                <th className="py-1">Health</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const rec = asRecord(row);
                const id = String(rec.metric_id ?? "");
                const overlay = catalogRow(id);
                return (
                  <tr key={id} data-testid={`metric-row-${id}`}>
                    <td className="py-2 pr-2 font-semibold text-[#1c2b44]">{id}</td>
                    <td className="py-2 pr-2">{overlay?.business_definition ?? "Certified metric."}</td>
                    <td className="py-2 pr-2">{String(rec.sensitivity ?? overlay?.sensitivity ?? "—")}</td>
                    <td className="py-2 pr-2">{String(rec.min_cell ?? "—")}</td>
                    <td className="py-2">{String(rec.health_status ?? "—")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
