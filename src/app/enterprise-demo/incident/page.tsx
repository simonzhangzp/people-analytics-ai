import { DemoShell, ServingUnavailable } from "@/components/enterprise-demo/DemoShell";
import { FollowUpAsk } from "@/components/enterprise-demo/FollowUpAsk";
import { MetricCaption } from "@/components/enterprise-demo/MetricCaption";
import { asRecord, formatCount } from "@/lib/people/format";
import { loadIncidentCase } from "@/lib/people/demo-payload";
import { pageMetadata } from "@/lib/site-metadata";
import { DEFAULT_IDENTITY } from "@/lib/people/demo-identities";
import { peopleV2Configured } from "@/lib/people/v2-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = pageMetadata({
  title: "Why did Headcount suddenly drop?",
  description:
    "Case 2: APAC HRIS extract fault versus a real workforce change. Replay values, blocked publish, and source freshness on the frozen data-v1 snapshot.",
  path: "/enterprise-demo/incident",
});

function replayLineage(lineage: Record<string, unknown>) {
  const quality = String(lineage.quality_status ?? "unknown");
  const publish = String(lineage.publish_status ?? "unknown");
  const freshness = asRecord(lineage.freshness);
  const sourceFailed =
    String(freshness.freshness_status ?? "") === "failed" || quality === "unhealthy";
  const blocked = publish === "not_published" || publish === "blocked";
  return [
    { label: "APAC HRIS", status: sourceFailed ? "FAILED" : String(freshness.freshness_status ?? "unknown") },
    { label: "workforce model", status: blocked ? "BLOCKED" : publish.replaceAll("_", " ").toUpperCase() },
    { label: "Headcount metric", status: quality.toUpperCase() },
    {
      label: "Executive Reporting",
      status: publish === "not_published" ? "NOT PUBLISHED" : publish.replaceAll("_", " ").toUpperCase(),
    },
  ];
}

export default async function IncidentCasePage() {
  if (!peopleV2Configured()) return <ServingUnavailable />;
  const data = await loadIncidentCase();
  const expected = Number(data.apac.expected_records);
  const actual = Number(data.apac.actual_records);
  const failedTests = data.tests.filter((row) => row.status === "failed" && row.test_name === "apac_hris_volume");
  const sources = Array.isArray(data.sourceHealth.sources) ? data.sourceHealth.sources : [];
  const steps = replayLineage(data.lineage);
  const replay = asRecord(data.replay);

  return (
    <DemoShell active="incident" ai={<FollowUpAsk demoCase="incident" identityId={DEFAULT_IDENTITY} />}>
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
        <MetricCaption
          scope={data.currentGrain.scope}
          window={data.currentGrain.window}
          asOf={data.currentGrain.as_of}
        />
        <p className="mt-2 text-[12px] text-[#667085]">
          serving_pointer(incident_replay) extract {String(data.snapshot.extract_id ?? "n/a")} ·
          moved={String(data.snapshot.moved)} · replay Headcount bad {formatCount(replay.value_bad)} vs
          expected {formatCount(replay.value_expected)}
        </p>
        <MetricCaption
          scope={data.replayGrain.scope}
          window={data.replayGrain.window}
          asOf={data.replayGrain.as_of}
        />

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
              {label !== "Pipeline status" ? (
                <MetricCaption
                  scope={data.extractGrain.scope}
                  window={data.extractGrain.window}
                  asOf={data.extractGrain.as_of}
                />
              ) : null}
            </div>
          ))}
        </div>

        <p className="surface mt-6 p-5 text-[15px] font-medium leading-7 text-[#1c2b44]">
          The platform prevented incomplete source data from being published as a workforce change.
        </p>

        <div className="mt-8">
          <p className="eyebrow">Downstream blocked in this replay</p>
          <ol className="mt-4 flex flex-col gap-2" data-testid="replay-lineage">
            {steps.map((step, index) => (
              <li key={step.label} className="flex items-center gap-2 text-[13px] font-semibold text-[#934646]">
                {index > 0 ? <span className="text-[#c9a0a0]">→</span> : null}
                <span className="rounded-[6px] border border-[#efd4d4] bg-[#fbeeee] px-3 py-2">
                  {step.label}
                  <span className="mt-1 block text-[10px] font-bold tracking-[0.08em]">{step.status}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <section className="surface p-4" data-testid="replay-quality-tests">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
              Failed quality test
            </p>
            <ul className="mt-3 space-y-2 text-[13px] text-[#546277]">
              {(failedTests.length
                ? failedTests
                : [{ test_name: "apac_hris_volume", observed_value: String(actual), expected_value: String(expected) }]
              ).map((row) => (
                <li key={row.test_name}>
                  Fail · {row.test_name}: observed {String(row.observed_value)}, expected {String(row.expected_value)}
                </li>
              ))}
            </ul>
          </section>
          <section className="surface p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#738097]">
              Source freshness
            </p>
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
          </section>
        </div>

        <p className="mt-6 text-[13px] text-[#546277]">
          Affected metrics: headcount — blocked in replay only. Lineage impact{" "}
          {Array.isArray(data.lineage.impact) ? data.lineage.impact.length : 0} objects.
        </p>
      </article>
    </DemoShell>
  );
}
