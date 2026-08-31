import { DemoShell, ServingUnavailable } from "@/components/enterprise-demo/DemoShell";
import { FollowUpAsk } from "@/components/enterprise-demo/FollowUpAsk";
import { formatCount } from "@/lib/people/format";
import { loadIncidentCase } from "@/lib/people/demo-payload";
import { peopleServingConfigured } from "@/lib/people/serving";

export const dynamic = "force-dynamic";

const REPLAY_LINEAGE = [
  ["APAC HRIS", true],
  ["Normalized Workforce", true],
  ["Headcount", true],
  ["Executive Reporting", true],
] as const;

export default async function IncidentCasePage() {
  if (!peopleServingConfigured()) return <ServingUnavailable />;
  const data = await loadIncidentCase();
  const expected = Number(data.apac.expected_records ?? 29700);
  const actual = Number(data.apac.actual_records ?? 10395);
  const failedTests = data.tests.filter((row) => row.status === "failed" && row.test_name === "apac_hris_volume");
  const sources = Array.isArray(data.sourceHealth.sources) ? data.sourceHealth.sources : [];

  return (
    <DemoShell active="incident">
      <article data-testid="apac-incident">
        <p className="eyebrow">Case 2 · Incident replay</p>
        <h1 className="mt-3 max-w-3xl text-[32px] font-bold tracking-[-0.04em] text-[#13203a]">
          Why did APAC Headcount drop overnight?
        </h1>
        <p className="mt-4 text-[20px] font-semibold text-[#934646]" data-testid="incident-data-issue">
          This is a data issue — not a workforce change.
        </p>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#546277]">
          You are viewing a historical replay. Current trusted Headcount remains the
          published GlobalTech snapshot from {String(data.current.as_of_date ?? "the latest month")}.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Expected source rows", formatCount(expected)],
            ["Received rows", formatCount(actual)],
            ["Difference", formatCount(actual - expected)],
            ["Pipeline status", "Failed"] as const,
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-[8px] border border-[#efd4d4] bg-[#fbeeee] p-4"
              data-testid={label === "Pipeline status" ? "pipeline-status" : undefined}
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#934646]">{label}</div>
              <div className="mt-2 text-[22px] font-semibold text-[#1c2b44]">{value}</div>
            </div>
          ))}
        </div>

        <p className="surface mt-6 p-5 text-[15px] font-medium leading-7 text-[#1c2b44]">
          The platform prevented incomplete source data from being published as a workforce change.
        </p>

        <div className="mt-8">
          <p className="eyebrow">Downstream blocked in this replay</p>
          <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {REPLAY_LINEAGE.map(([step], index) => (
              <li key={step} className="flex items-center gap-2 text-[13px] font-semibold text-[#934646]">
                {index > 0 ? <span className="hidden text-[#c9a0a0] sm:inline">→</span> : null}
                <span className="rounded-[6px] border border-[#efd4d4] bg-[#fbeeee] px-3 py-2">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-8 space-y-3">
          <details className="surface p-4">
            <summary className="cursor-pointer text-[14px] font-semibold text-[#1c2b44]">
              Failed quality test
            </summary>
            <ul className="mt-3 space-y-2 text-[13px] text-[#546277]">
              {(failedTests.length ? failedTests : [{ test_name: "apac_hris_volume", observed_value: String(actual), expected_value: String(expected) }]).map(
                (row) => (
                  <li key={row.test_name}>
                    {row.test_name}: observed {row.observed_value}, expected {row.expected_value}
                  </li>
                ),
              )}
            </ul>
          </details>
          <details className="surface p-4">
            <summary className="cursor-pointer text-[14px] font-semibold text-[#1c2b44]">
              Source freshness
            </summary>
            <ul className="mt-3 space-y-1 text-[13px] text-[#546277]">
              {sources.map((source) => {
                const row = source as Record<string, unknown>;
                return (
                  <li key={String(row.source_name)}>
                    {String(row.source_name)} · {String(row.quality_status)} ·{" "}
                    {String(row.error_message ?? "ok")}
                  </li>
                );
              })}
            </ul>
          </details>
          <details className="surface p-4">
            <summary className="cursor-pointer text-[14px] font-semibold text-[#1c2b44]">
              Affected metrics
            </summary>
            <p className="mt-3 text-[13px] text-[#546277]">
              {(Array.isArray(data.apac.affected_metrics)
                ? data.apac.affected_metrics
                : ["headcount", "voluntary_attrition"]
              ).join(", ")}{" "}
              — blocked in replay only.
            </p>
          </details>
          <details className="surface p-4">
            <summary className="cursor-pointer text-[14px] font-semibold text-[#1c2b44]">
              Full lineage
            </summary>
            <pre className="mt-3 overflow-auto text-[11px] leading-5 text-[#546277]">
              {JSON.stringify(data.lineage, null, 2)}
            </pre>
          </details>
        </div>
        <FollowUpAsk demoCase="incident" />
      </article>
    </DemoShell>
  );
}
