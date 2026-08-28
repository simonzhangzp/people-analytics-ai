import Link from "next/link";
import { BrandMark, PrimaryLink, SecondaryLink } from "@/components/ui";

const principles = [
  ["Question-led", "Connect local files, then frame the People decision to answer."],
  ["Human + AI co-design", "AI proposes frameworks; people confirm definitions."],
  ["Deterministic analytics", "Code calculates. AI explains."],
  ["Local-first privacy", "Raw HR rows stay in the browser by default."],
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
            <SecondaryLink href="/">Home</SecondaryLink>
            <PrimaryLink href="/demo">Try demo</PrimaryLink>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] space-y-10 px-5 py-12 sm:px-8">
        <section className="max-w-3xl">
          <p className="eyebrow">Architecture</p>
          <h1 className="mt-4 text-[36px] font-[700] leading-[1.1] tracking-[-0.04em] text-[#13203a]">
            How the local-first workbench works
          </h1>
          <p className="mt-5 text-[16px] leading-7 text-[#536177]">
            People Analytics does not lack dashboards. It lacks a reliable bridge from
            local source data to agreed definitions, auditable evidence, and leadership
            action. This product is designed around that chain.
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
                <li>DuckDB-Wasm joins, filters, aggregations, and segment comparisons</li>
                <li>Grain, joinability, and data-health checks</li>
                <li>Chart data, PPTX export, and audit objects</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="surface p-6">
          <p className="eyebrow">Execution boundary</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              [
                "Browser",
                "Parses CSV/Excel, profiles columns, runs DuckDB-Wasm, holds raw rows, and renders exploration.",
              ],
              [
                "AI service",
                "Receives safe metadata or aggregates for five typed tasks. It never receives uploaded rows or writes executable SQL.",
              ],
              [
                "Knowledge store",
                "Supabase persists anonymous workspace ownership, mappings, approved definitions, findings, and stories under RLS.",
              ],
            ].map(([title, description]) => (
              <article key={title} className="rounded-[8px] border border-[#e3e7ed] p-4">
                <h2 className="text-[13px] font-semibold text-[#1c2b44]">{title}</h2>
                <p className="mt-2 text-[12px] leading-5 text-[#5a677b]">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="surface p-6">
          <p className="eyebrow">Default privacy rule</p>
          <p className="mt-4 max-w-3xl text-[14px] leading-6 text-[#344158]">
            Raw employee and candidate rows stay in the browser. Remote AI calls receive
            table names, column names, aggregate profiles, approved metric definitions,
            and statistical outputs. No row-level People data is sent by default.
          </p>
        </section>
      </main>
    </div>
  );
}
