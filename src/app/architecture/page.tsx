import Link from "next/link";
import { BrandMark, PrimaryLink, SecondaryLink } from "@/components/ui";

const principles = [
  ["Question-led", "Upload People files, then ask the workforce decision to answer."],
  ["Human + AI co-design", "AI proposes frameworks; people confirm definitions."],
  ["Deterministic analytics", "Code calculates. AI explains."],
  ["Visible storage boundary", "Uploaded files live on the analysis server workspace, not the marketing site."],
  ["Semantic metric layer", "Approved definitions become reusable knowledge."],
  ["Visible uncertainty", "Confidence, limitations, and data gaps stay on the page."],
];

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <header className="border-b border-[#e3e7ed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center px-5 sm:px-8">
          <Link href="/" aria-label="People Strategy Intelligence home">
            <BrandMark />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <SecondaryLink href="/enterprise-demo">Enterprise demo</SecondaryLink>
            <SecondaryLink href="/">Home</SecondaryLink>
            <PrimaryLink href="/enterprise-demo">View case studies</PrimaryLink>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] space-y-10 px-5 py-12 sm:px-8">
        <section className="max-w-3xl">
          <p className="eyebrow">Architecture</p>
          <h1 className="mt-4 text-[36px] font-[700] leading-[1.1] tracking-[-0.04em] text-[#13203a]">
            How the analysis workspace works
          </h1>
          <p className="mt-5 text-[16px] leading-7 text-[#536177]">
            People Analytics does not lack dashboards. It lacks a reliable bridge from
            source data to agreed definitions, auditable evidence, and leadership
            action. The product splits that chain across two hosts.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {principles.map(([title, description]) => (
            <article key={title} className="surface p-5">
              <h2 className="text-[15px] font-semibold text-[#1c2b44]">{title}</h2>
              <p className="mt-2 text-[13px] leading-6 text-[#546277]">{description}</p>
            </article>
          ))}
        </section>

        <section className="surface p-6">
          <p className="eyebrow">Two hosts</p>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[#1c2b44]">peopleanalyticsai.net</h2>
              <ul className="mt-3 space-y-2 text-[13px] leading-6 text-[#546277]">
                <li>Landing, about, strategy, architecture, and portfolio</li>
                <li>Guided synthetic demo and `/workbench` browser fallback</li>
                <li>Does not store uploaded People files</li>
              </ul>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#1c2b44]">app.peopleanalyticsai.net</h2>
              <ul className="mt-3 space-y-2 text-[13px] leading-6 text-[#546277]">
                <li>Data Formulator 0.8 in Docker, with the People knowledge overlay</li>
                <li>Upload → Ask → Answer → Explore against a server workspace volume</li>
                <li>Always-apply rules for headcount, identifiers, attrition, and story order</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="surface p-6">
          <p className="eyebrow">AI vs code</p>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[#1c2b44]">AI understands and explains</h2>
              <ul className="mt-3 space-y-2 text-[13px] leading-6 text-[#546277]">
                <li>Clarify strategy and metric trade-offs</li>
                <li>Propose mappings and analysis plans</li>
                <li>Write executive narrative and slide storylines</li>
              </ul>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#1c2b44]">Code calculates</h2>
              <ul className="mt-3 space-y-2 text-[13px] leading-6 text-[#546277]">
                <li>Formulator agents run SQL/Python against the workspace</li>
                <li>The `/workbench` fallback uses DuckDB-Wasm in the browser</li>
                <li>Chart data, PPTX export, and audit objects stay deterministic</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="surface p-6">
          <p className="eyebrow">Execution boundary</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              [
                "Analysis server",
                "Formulator stores uploaded Excel/CSV in the workspace volume, profiles tables, and runs the Analyst agent.",
              ],
              [
                "AI service",
                "Receives schema, aggregates, and always-apply People rules. Direct identifiers are not displayed in charts.",
              ],
              [
                "Marketing site",
                "Hosts strategy and the optional browser workbench. It does not receive Formulator uploads.",
              ],
            ].map(([title, description]) => (
              <article key={title} className="rounded-[8px] border border-[#e3e7ed] p-4">
                <h2 className="text-[13px] font-semibold text-[#1c2b44]">{title}</h2>
                <p className="mt-2 text-[12px] leading-5 text-[#5a677b]">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="surface p-6" data-testid="people-data-platform">
          <p className="eyebrow">People data platform · technical review</p>
          <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.03em] text-[#13203a]">
            How certified workforce numbers are produced
          </h2>
          <p className="mt-3 max-w-3xl text-[14px] leading-6 text-[#546277]">
            Recruiter case studies live on `/enterprise-demo`. This page is the secondary
            view for reviewers who want the platform layers underneath those stories.
          </p>
          <ol className="mt-6 grid gap-3 md:grid-cols-2">
            {[
              ["Source systems", "HRIS, ATS, LMS, compensation, performance, and engagement extracts. GlobalTech is synthetic; O*NET and Microsoft Learn are public."],
              ["Bronze / silver / gold", "Lake folders people_bronze, people_silver, and people_gold. Certified marts are the only numbers shown as current state."],
              ["Data quality", "Source freshness, row-count tests, and incidents. The APAC incomplete extract is retained as incident replay, not as the live snapshot."],
              ["Metric registry", "people_metric_definition stores business definition, formula, population, exclusions, owner, and version."],
              ["Lineage", "people_dataset_lineage and people_trace_metric_lineage() connect source tables to serving marts."],
              ["Serving layer", "people_get_metric and related RPCs. people_serving_snapshot separates current trusted state from incident_replay."],
              ["AI tools", "People AI calls the same governed RPCs. It does not run arbitrary SQL and does not claim unconstrained ask-anything."],
            ].map(([title, description]) => (
              <li key={title} className="rounded-[8px] border border-[#e3e7ed] p-4">
                <h3 className="text-[13px] font-semibold text-[#1c2b44]">{title}</h3>
                <p className="mt-2 text-[12px] leading-5 text-[#5a677b]">{description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="surface p-6">
          <p className="eyebrow">Default privacy rule</p>
          <p className="mt-4 max-w-3xl text-[14px] leading-6 text-[#344158]">
            Files attached on Analyze are stored in the Formulator analysis workspace.
            The marketing site does not keep those files. Treat the workspace as an
            analysis server: limit access, rotate model keys, and do not assume
            browser-only retention. The `/workbench` fallback still keeps raw rows
            in this browser for local demos.
          </p>
        </section>
      </main>
    </div>
  );
}
