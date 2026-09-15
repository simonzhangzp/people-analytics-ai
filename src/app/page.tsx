import Link from "next/link";
import { ArchitectureExplorer } from "@/components/home/ArchitectureExplorer";
import { ComparisonRail } from "@/components/home/ComparisonRail";
import { EnvironmentOverview } from "@/components/home/EnvironmentOverview";
import { ProofPoints } from "@/components/home/ProofPoints";
import { ProvenanceCard } from "@/components/home/ProvenanceCard";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { SYNTHETIC_DISCLAIMER } from "@/lib/people/environment-facts";
import {
  emptyHomePlatformFacts,
  loadHomePlatformFacts,
} from "@/lib/people/platform-facts";
import { pageMetadata } from "@/lib/site-metadata";
import { peopleV2Configured } from "@/lib/people/v2-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = pageMetadata({
  title: "AI-ready People Analytics starts with trusted facts",
  description:
    "Why AI-era People Analytics needs a governed architecture, not a smarter chatbot. A working demo on a synthetic 49,823-person enterprise: certified metrics, identity-aware access, traceable quality, 15 governed MCP tools.",
  path: "/",
});

const CONTAINER = "mx-auto max-w-[1100px] px-5 sm:px-8";

export default async function HomePage() {
  let facts = emptyHomePlatformFacts();
  if (peopleV2Configured()) {
    try {
      facts = await loadHomePlatformFacts();
    } catch {
      facts = emptyHomePlatformFacts();
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SiteHeader active="/" />
      <main className="flex-1">
        {/* Hero */}
        <section aria-labelledby="hero-title" data-testid="home-hero" className="relative overflow-hidden">
          <div aria-hidden="true" className="blueprint pointer-events-none absolute inset-0" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-40 -top-40 size-[560px] rounded-full bg-primary-soft blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-48 top-64 size-[420px] rounded-full bg-certified-soft blur-3xl"
          />
          <div className={`${CONTAINER} relative grid items-center gap-12 pb-20 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pb-24`}>
            <div>
              <p className="eyebrow">People Analytics for the AI era</p>
              <h1 id="hero-title" className="hero-title mt-5">
                AI-ready People Analytics starts with{" "}
                <span className="hl hl-certified">trusted facts</span>, not a{" "}
                <span className="text-muted">smarter chatbot</span>.
              </h1>
              <p className="lede mt-7 max-w-xl">
                Not an LLM on top of HR data. A <strong className="font-semibold text-ink">governed architecture</strong>{" "}
                where AI reasons over certified metrics, explicit business rules, traceable data quality,
                identity-aware access and reusable analytical capabilities.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/architecture" data-testid="cta-architecture" className="btn-primary">
                  Explore the Architecture
                </Link>
                <Link href="/try" data-testid="cta-try" className="btn-secondary">
                  Try It Yourself
                </Link>
              </div>
              <p className="mt-6 text-[12.5px] leading-5 text-muted" data-testid="synthetic-label">
                {SYNTHETIC_DISCLAIMER} Frozen data-v1 snapshot as of {facts.asOf}.
              </p>
            </div>
            <ProvenanceCard facts={facts} />
          </div>
        </section>

        <div className={CONTAINER}>
          <ComparisonRail />
        </div>

        {/* Architecture */}
        <section className="band-tint mt-28 py-24" aria-labelledby="architecture-title" data-testid="home-architecture">
          <div className={CONTAINER}>
            <p className="eyebrow">How it works</p>
            <h2 id="architecture-title" className="section-title mt-3 max-w-3xl">
              <span className="hl hl-ai">Five layers.</span> Two pillars that cut across all of them.
            </h2>
            <p className="lede mt-4 max-w-3xl">
              Governance and observability are not a layer you add at the end. They run through the
              data foundation, the semantic layer, the skills, the agent runtime and every page.
            </p>
            <ArchitectureExplorer mode="compact" />
          </div>
        </section>

        <div className={CONTAINER}>
          <ProofPoints />
          <EnvironmentOverview facts={facts} />
        </div>

        {/* Closing */}
        <section className="band-ink mt-28 py-24" aria-labelledby="closing-title">
          <div className={`${CONTAINER} grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}>
            <div>
              <p className="eyebrow">The boundary</p>
              <h2 id="closing-title" className="section-title mt-3">
                Where AI <span className="hl hl-certified">adds value</span>, and where it is{" "}
                <span className="hl hl-gold">deliberately constrained</span>.
              </h2>
              <p className="lede mt-5 max-w-xl">
                The model&apos;s entire remit fits in one short list. Everything else is SQL, policy
                and tests.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/try" className="btn-primary">
                  Try It Yourself
                </Link>
                <Link href="/architecture" className="btn-secondary">
                  Explore the Architecture
                </Link>
              </div>
              <p className="mt-8 text-[13px] text-on-ink-3">
                Deeper technical detail and the builder story:{" "}
                <Link href="/perspective" className="font-semibold text-on-ink-link hover:text-white">
                  Perspective
                </Link>
                {", "}
                <Link href="/about" className="font-semibold text-on-ink-link hover:text-white">
                  About
                </Link>
                {" and "}
                <Link href="/enterprise-demo" className="font-semibold text-on-ink-link hover:text-white">
                  all case studies
                </Link>
                .
              </p>
            </div>
            <div className="grid gap-4 self-start sm:grid-cols-2">
              <div className="surface p-6">
                <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-on-ink-certified">The model may</p>
                <ul className="mt-3 space-y-2.5 text-[14px] leading-6 text-white">
                  {[
                    "Select which governed tool to call",
                    "Interpret certified results",
                    "Propose hypotheses, labelled as hypotheses",
                    "Suggest the next question",
                  ].map((line) => (
                    <li key={line} className="flex gap-2.5">
                      <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-on-ink-certified" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="surface p-6">
                <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-on-ink-gold">The model never</p>
                <ul className="mt-3 space-y-2.5 text-[14px] leading-6 text-white">
                  {[
                    "Produces a number",
                    "Rewrites a fact sentence",
                    "Writes its own SQL",
                    "Becomes an authorization layer",
                  ].map((line) => (
                    <li key={line} className="flex gap-2.5">
                      <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-on-ink-gold" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
