import Link from "next/link";
import { ArchitectureExplorer } from "@/components/home/ArchitectureExplorer";
import { LiveTag } from "@/components/site/LiveTag";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import type { LayerId } from "@/lib/people/architecture-map";
import { LAYER_TONE } from "@/lib/people/layer-tones";
import { pageMetadata } from "@/lib/site-metadata";
import { cn } from "@/lib/utils";

export const metadata = pageMetadata({
  title: "Architecture",
  description:
    "Five-layer AI-ready People Analytics architecture with governance and observability as cross-cutting pillars: data foundation, semantic layer, skills, agent runtime, experience.",
  path: "/architecture",
});

const PIPELINE = [
  ["Sources", "Synthetic HRIS, ATS, LMS, performance, compensation and engagement, plus public O*NET, BLS and Microsoft Learn.", "L1"],
  ["People Bronze", "Immutable extracts in the people lake. Website pages never scan lake files.", "L1"],
  ["Validation / Data Quality", "Row-count, freshness, uniqueness and referential checks. Failures become incidents, not silent dashboard changes.", "L1"],
  ["People Silver", "Normalized worker, assignment, recruiting and learning grains.", "L1"],
  ["People Gold / Marts", "Certified aggregate slices: workforce, retention, mobility, compensation, skills, recruiting, learning.", "L1"],
  ["Certified Metric Registry", "people_metric_definition stores definition, formula, population, exclusions, owner and version.", "L2"],
  ["Lineage / Freshness / Governance", "people_dataset_lineage, source health, and people_serving_snapshot separate current trusted state from incident replay.", "L2"],
  ["Serving RPC Layer", "people_get_* functions. Arithmetic stays in Postgres.", "L2"],
  ["Workforce Intelligence", "Retention, skill coverage and related signals over certified metrics.", "L3"],
  ["People AI Tools", "A bounded tool list over the same RPCs. Not generic NL-to-SQL. The model chooses tools; values and fact sentences come from SQL and templates.", "L4"],
] as const;

export default function ArchitecturePage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SiteHeader active="/architecture" />
      <main className="w-full flex-1 mx-auto max-w-[1100px] px-5 pb-24 pt-16 sm:px-8">
        <section className="max-w-3xl">
          <p className="eyebrow">Architecture</p>
          <h1 className="hero-title mt-5">
            Where <span className="hl hl-ai">AI</span> sits. Where{" "}
            <span className="hl hl-certified">governance</span> sits.
          </h1>
          <p className="lede mt-6">
            The public demo is a serving layer over a People data platform. Object storage holds
            history; a scheduled pipeline builds the lake and publishes governed marts to a serving
            database. The model only ever talks to the top of this stack.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <LiveTag status="live" />
            <LiveTag status="target" />
            <span className="text-[12px] text-muted">
              Dashed components are roadmap. Nothing tagged target is shipped.
            </span>
          </div>
        </section>

        <ArchitectureExplorer mode="expanded" defaultSelection={{ kind: "layer", id: "L1" }} />

        <section className="mt-24" aria-labelledby="pipeline-title">
          <p className="eyebrow">Data flow</p>
          <h2 id="pipeline-title" className="section-title mt-3 max-w-3xl">
            From source document to certified number
          </h2>
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-body-2" data-testid="people-data-platform">
            Bronze / silver / gold lake layers, a metric registry, lineage and freshness, then a
            serving layer of people_get_* RPCs. The website never scans lake files.
          </p>
          <ol className="mt-8 grid gap-3 md:grid-cols-2">
            {PIPELINE.map(([title, copy, layer], index) => (
              <li key={title} className="surface relative overflow-hidden p-5">
                <span
                  aria-hidden="true"
                  className={cn("absolute inset-y-0 left-0 w-1", LAYER_TONE[layer as LayerId].solid)}
                />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <span
                    className={cn(
                      "rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold",
                      LAYER_TONE[layer as LayerId].soft,
                      LAYER_TONE[layer as LayerId].text,
                    )}
                  >
                    {layer}
                  </span>
                </div>
                <h3 className="mt-2 text-[15px] font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-body-2">{copy}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16 grid gap-4 md:grid-cols-2">
          <div className="surface p-6" data-testid="b2a-facts-deterministic">
            <p className="eyebrow">Facts vs model</p>
            <h2 className="mt-3 text-[18px] font-semibold text-ink">
              SQL produces the numbers. The model chooses tools and writes hypotheses.
            </h2>
            <p className="mt-3 text-[14px] leading-6 text-body-2">
              The model chooses which tools to call. Values and fact sentences are generated by SQL
              and deterministic templates; the model does not rewrite them.
            </p>
            <p className="mt-3 text-[14px] leading-6 text-body-2">
              The only model-authored text is hypotheses.
            </p>
            <p className="mt-3 text-[14px] leading-6 text-body-2">
              If the planner fails, headline, facts, and the tool sequence stay the same. That
              equality is the b2a_diff evidence. Eval scores hypotheses (empty / digits / causal
              verbs) and required tools; it does not score headline/facts by text similarity.
            </p>
          </div>

          <div className="surface p-6" data-testid="min-cell-max-rule">
            <p className="eyebrow">Suppression threshold</p>
            <h2 className="mt-3 text-[18px] font-semibold text-ink">
              effective_min_cell is the stricter of metric and identity
            </h2>
            <p className="mt-3 text-[14px] leading-6 text-body-2">
              effective_min_cell = max(metric_min_cell, identity_min_cell). min_cell_source is
              identity when the identity floor is at least as strict as the YAML metric floor,
              otherwise metric. Example: compa YAML 10 and Engineering leader 20 → effective 20
              (source identity).
            </p>
            <p className="mt-4 text-[13px]">
              <Link href="/try#permissions" className="font-semibold text-primary hover:underline">
                Test it with four identities →
              </Link>
            </p>
          </div>
        </section>

        <section className="surface mt-4 p-6">
          <p className="eyebrow">Runtime split</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              ["Object / lake storage", "people_bronze, people_silver, people_gold on the People lake. Durable raw and history. Never queried by the website."],
              ["Scheduled compute", "Daily pipeline, quality tests, gold rebuild, and incident replay extract."],
              ["Serving database", "people_v2 marts and people_get_* RPCs. Pages call serving functions; they do not scan lake files."],
            ].map(([title, copy]) => (
              <article key={title}>
                <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
                <p className="mt-2 text-[13px] leading-6 text-body-2">{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="surface mt-4 p-6" data-testid="transfer-lineage">
          <p className="eyebrow">Worked example · Employee Transfer</p>
          <p className="mt-3 max-w-3xl text-[14px] leading-6 text-body-2">
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
              <li key={label} className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                {index > 0 ? <span className="hidden text-faint sm:inline">→</span> : null}
                <span className="rounded-[8px] border border-certified-line bg-certified-soft px-3 py-2">
                  {label}
                  <span className="mt-1 block text-[10px] font-medium text-muted">{table}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[13px]">
            <Link href="/dataset" className="font-semibold text-primary">
              Dataset page
            </Link>
            {" · "}
            synthetic GlobalTech, not a real company.
          </p>
        </section>

        <section className="surface mt-4 p-6">
          <p className="eyebrow">Incident replay</p>
          <p className="mt-3 max-w-3xl text-[14px] leading-6 text-body-2">
            The APAC incomplete HRIS extract is a historical replay. Current Headcount is the latest
            certified published snapshot. Replay context marks downstream reporting blocked; it does
            not overwrite trusted marts.
          </p>
          <p className="mt-3 text-[13px]">
            <Link href="/enterprise-demo/incident" className="font-semibold text-primary hover:underline">
              Replay the incident →
            </Link>
          </p>
        </section>

        <p className="mt-10 text-[13px] text-muted">
          Connect your own AI client through the{" "}
          <Link href="/connect" className="font-semibold text-primary">
            MCP endpoint
          </Link>
          , or walk the five modules on{" "}
          <Link href="/try" className="font-semibold text-primary">
            Try It Yourself
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
