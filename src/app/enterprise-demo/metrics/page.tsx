import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { RoleSwitcher } from "@/components/enterprise-demo/RoleSwitcher";
import { DEFAULT_IDENTITY, identityLabel } from "@/lib/people/demo-identities";
import { catalogRow } from "@/lib/people/metric-catalog";
import { asRecord } from "@/lib/people/format";
import { peopleGetIdentityRow, peopleListMetrics } from "@/lib/people/v2-client";
import { pageMetadata } from "@/lib/site-metadata";
import { peopleV2Configured } from "@/lib/people/v2-config";
import { ServingUnavailable } from "@/components/enterprise-demo/DemoShell";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = pageMetadata({
  title: "Metric Explorer",
  description:
    "Certified People metrics on data-v1: definition, sensitivity, min_cell, and health. Not a KPI wall.",
  path: "/enterprise-demo/metrics",
});

/** Same ordering the MCP list_metrics tool uses to apply the identity's sensitivity ceiling. */
const SENSITIVITY_RANK: Record<string, number> = {
  public: 1,
  internal: 2,
  confidential: 3,
  restricted: 4,
};

export default async function MetricExplorerPage({
  searchParams,
}: {
  searchParams?: Promise<{ identity?: string }> | { identity?: string };
}) {
  if (!peopleV2Configured()) return <ServingUnavailable />;
  const params = await Promise.resolve(searchParams ?? {});
  const identity = params.identity?.trim() || DEFAULT_IDENTITY;
  const [rows, identityRow] = await Promise.all([peopleListMetrics(identity), peopleGetIdentityRow(identity)]);
  const ceiling = String(identityRow.sensitivity_max ?? "internal");
  const ceilingRank = SENSITIVITY_RANK[ceiling] ?? 2;
  const visible = rows.filter((row) => {
    const overlay = catalogRow(String(row.metric_id ?? ""));
    return overlay || row.metric_id;
  });
  const readable = visible.filter(
    (row) => (SENSITIVITY_RANK[String(row.sensitivity ?? "internal")] ?? 2) <= ceilingRank,
  ).length;

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SiteHeader active="/enterprise-demo" />
      <main className="w-full flex-1 mx-auto max-w-[1100px] px-5 py-10 sm:px-8">
        <p className="eyebrow">Measurement</p>
        <h1 className="mt-3 max-w-3xl text-[32px] font-bold tracking-[-0.04em] text-ink">
          {`Which certified metrics can ${identityLabel(identity)} read?`}
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-body-2" data-testid="metrics-takeaway">
          {readable} of {visible.length} certified metrics are readable at this identity&apos;s sensitivity
          ceiling ({ceiling}). Confidential rows stay in the catalog so the boundary is visible; for a
          denied row every serving tool returns value=null, never a substitute number. This is a catalog,
          not a dashboard.
        </p>
        <div className="mt-4 max-w-xs">
          <RoleSwitcher value={identity} />
        </div>
        <p className="mt-3 text-[13px]">
          <Link href="/enterprise-demo/trust" className="font-semibold text-primary">
            Back to Trust scorecard
          </Link>
        </p>
        <section className="surface mt-8 overflow-x-auto p-4" data-testid="metric-explorer">
          <table className="w-full text-left text-[12px] text-body">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                <th className="py-1 pr-2">Metric</th>
                <th className="py-1 pr-2">Question it answers</th>
                <th className="py-1 pr-2">Sensitivity</th>
                <th className="py-1 pr-2">min_cell</th>
                <th className="py-1 pr-2">Health</th>
                <th className="py-1">Access</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const rec = asRecord(row);
                const id = String(rec.metric_id ?? "");
                const overlay = catalogRow(id);
                const sensitivity = String(rec.sensitivity ?? overlay?.sensitivity ?? "internal");
                const allowed = (SENSITIVITY_RANK[sensitivity] ?? 2) <= ceilingRank;
                return (
                  <tr key={id} data-testid={`metric-row-${id}`} className={cn(!allowed && "text-muted")}>
                    <td className={cn("py-2 pr-2 font-semibold", allowed ? "text-ink" : "text-muted")}>{id}</td>
                    <td className="py-2 pr-2">{overlay?.business_definition ?? "Certified metric."}</td>
                    <td className="py-2 pr-2">{sensitivity}</td>
                    <td className="py-2 pr-2">{String(rec.min_cell ?? "—")}</td>
                    <td className="py-2 pr-2">{String(rec.health_status ?? "—")}</td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          allowed
                            ? "border-certified-line bg-certified-soft text-certified-dark"
                            : "border-danger-line bg-danger-soft text-danger",
                        )}
                      >
                        {allowed ? "allow" : "deny · sensitivity"}
                      </span>
                    </td>
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
