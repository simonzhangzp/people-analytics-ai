import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { pageMetadata } from "@/lib/site-metadata";

export const metadata = pageMetadata({
  title: "Architecture",
  description:
    "Enterprise People Data & AI platform layers, from source contracts through quality tests, the metric registry, lineage, and governed serving RPCs.",
  path: "/architecture",
});

const LAYERS = [
  ["Sources", "Synthetic HRIS, ATS, LMS, performance, compensation and engagement, plus public O*NET, BLS and Microsoft Learn."],
  ["People Bronze", "Immutable extracts in the people lake. Website pages never scan lake files."],
  ["Validation / Data Quality", "Row-count tests, freshness, uniqueness, and referential checks. Failures become incidents, not silent dashboard changes."],
  ["People Silver", "Normalized worker, assignment, recruiting and learning grains."],
  ["People Gold / Marts", "Certified aggregate slices: workforce, retention, mobility, compensation, skills, recruiting, learning."],
  ["Certified Metric Registry", "people_metric_definition stores definition, formula, population, exclusions, owner and version."],
  ["Lineage / Freshness / Governance", "people_dataset_lineage, source health, and people_serving_snapshot separate current trusted state from incident replay."],
  ["Serving RPC Layer", "people_get_* functions. Arithmetic stays in Postgres."],
  ["Workforce Intelligence", "Retention, skill coverage and related signals over certified metrics."],
  ["People AI Tools", "A bounded tool list over the same RPCs. Not generic NL-to-SQL. The run-time planner rewrites hypotheses wording only; headlines, facts, and tool calls stay on the SQL/compose path. Eval of attempted_ok vs attempted_failed scores llm_invocation and the tool sequence, not headline text."],
];

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <SiteHeader active="/architecture" />
      <main className="mx-auto max-w-[1100px] space-y-10 px-5 py-12 sm:px-8">
        <section className="max-w-3xl">
          <p className="eyebrow">Architecture</p>
          <h1 className="mt-4 text-[36px] font-bold leading-[1.1] tracking-[-0.04em] text-[#13203a]">
            How certified workforce numbers are produced
          </h1>
          <p className="mt-5 text-[16px] leading-7 text-[#536177]">
            The recruiter demo is a serving layer over a People data platform.
            Object storage holds history. A scheduled pipeline builds the lake and
            publishes governed marts to a serving database.
          </p>
        </section>

        <p className="text-[13px] leading-6 text-[#546277]" data-testid="people-data-platform">
          Bronze / silver / gold lake layers, a metric registry, lineage and freshness, then a serving layer of
          people_get_* RPCs. The website never scans lake files.
        </p>
        <ol className="grid gap-3 md:grid-cols-2">
          {LAYERS.map(([title, copy], index) => (
            <li key={title} className="surface p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#738097]">
                {index + 1}
              </p>
              <h2 className="mt-2 text-[15px] font-semibold text-[#1c2b44]">{title}</h2>
              <p className="mt-2 text-[13px] leading-6 text-[#546277]">{copy}</p>
            </li>
          ))}
        </ol>

        <section className="surface p-6">
          <p className="eyebrow">Runtime split</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              ["Object / lake storage", "people_bronze, people_silver, people_gold on the People lake. Durable raw and history. Never queried by the website."],
              ["Scheduled compute", "Daily pipeline, quality tests, gold rebuild, and incident replay extract."],
              ["Serving database", "people_v2 marts and people_get_* RPCs. Pages call serving functions; they do not scan lake files."],
            ].map(([title, copy]) => (
              <article key={title}>
                <h2 className="text-[14px] font-semibold text-[#1c2b44]">{title}</h2>
                <p className="mt-2 text-[13px] leading-6 text-[#546277]">{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="surface p-6" data-testid="transfer-lineage">
          <p className="eyebrow">Phase 0 evidence · Employee Transfer</p>
          <p className="mt-3 max-w-3xl text-[14px] leading-6 text-[#546277]">
            One source document is mapped, canonicalized, then used in a certified metric. The website
            never scans lake files; it calls people_get_metric_for.
          </p>
          <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {[
              ["Employee Transfer", "frappe_hr.Employee Transfer"],
              ["Mapping", "people_mappings/frappe_employee_transfer.yml"],
              ["Canonical event", "people_evt_transfer"],
              ["Certified metric", "people_metric.internal_mobility_rate"],
            ].map(([label, table], index) => (
              <li key={label} className="flex items-center gap-2 text-[13px] font-semibold text-[#1c2b44]">
                {index > 0 ? <span className="hidden text-[#9aa7b8] sm:inline">→</span> : null}
                <span className="rounded-[6px] border border-[#d2e8dc] bg-[#eaf5ef] px-3 py-2">
                  {label}
                  <span className="mt-1 block text-[10px] font-medium text-[#667085]">{table}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[13px]">
            <Link href="/dataset" className="font-semibold text-[#3157c9]">
              Dataset page
            </Link>
            {" · "}
            synthetic GlobalTech, not a real company.
          </p>
        </section>

        <section className="surface p-6">
          <p className="eyebrow">Incident replay</p>
          <p className="mt-3 max-w-3xl text-[14px] leading-6 text-[#546277]">
            The APAC incomplete HRIS extract is a historical replay. Current
            Headcount is the latest certified published snapshot. Replay context
            marks downstream reporting blocked; it does not overwrite trusted marts.
          </p>
        </section>

        <p className="text-[13px] text-[#667085]">
          Connect a desktop client through the{" "}
          <Link href="/connect" className="font-semibold text-[#3157c9]">
            MCP endpoint
          </Link>
          . Earlier file-upload experiments live in the{" "}
          <Link href="/lab" className="font-semibold text-[#3157c9]">
            Lab
          </Link>
          . They are not the enterprise platform.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
