import Link from "next/link";
import { ConnectGuide } from "@/components/connect/ConnectGuide";
import { CopyToken } from "@/components/site/CopyToken";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { MCP_ENDPOINT } from "@/lib/people/connect-guides";
import { pageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = pageMetadata({
  title: "Connect via MCP",
  description:
    "Step-by-step: connect Cursor, Claude, ChatGPT, Microsoft Copilot or any MCP client to the read-only People Analytics endpoint. Public demo token, aggregate metrics only, min_cell 50.",
  path: "/connect",
});

const TOOLS = [
  ["list_metrics", "Certified metrics visible to the site visitor identity"],
  ["get_metric", "Scalar value; denied metrics return value=null"],
  ["get_metric_trend", "Monthly points for a certified metric"],
  ["get_metric_breakdown", "Aggregate cells with automatic min-cell suppression"],
  ["get_metric_definition", "Definition, formula, owner, version"],
  ["list_entities", "Ontology entities filtered by sensitivity"],
  ["describe_entity", "Attributes; PII hidden from the site visitor identity"],
  ["get_join_paths", "Allowed and denied edges. No SQL"],
  ["get_glossary_term", "Business-rule glossary"],
  ["get_lineage", "Lineage edges"],
  ["get_source_health", "Current certified pointer and metric health"],
  ["get_quality_tests", "data-v1 quality tests"],
  ["get_quality_incidents", "Historical incidents, not current certified values"],
  ["get_serving_snapshot", "Certified pointer and run"],
  ["get_skill_coverage", "Job-family skill coverage aggregates"],
];

export default function ConnectPage() {
  const token = process.env.NEXT_PUBLIC_MCP_DEMO_TOKEN?.trim() ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SiteHeader active="/try" />
      <main className="w-full flex-1 mx-auto max-w-[1100px] px-5 pb-24 pt-16 sm:px-8">
        <section className="max-w-3xl">
          <p className="eyebrow">Try it yourself · Module 1</p>
          <h1 className="hero-title mt-5">
            Connect <span className="hl hl-ai">your AI</span> via MCP
          </h1>
          <p className="lede mt-6">
            A read-only MCP endpoint over the same governed People serving RPCs the case studies use.
            Your AI client gets <strong className="font-semibold text-ink">15 tools, not tables</strong>. The
            dataset is synthetic GlobalTech, not a real company.
          </p>
        </section>

        <section className="surface mt-10 p-6 sm:p-8">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="eyebrow">Endpoint</p>
              <code className="mt-3 block overflow-x-auto rounded-[8px] border border-edge-strong bg-canvas-2 px-3 py-2 text-[13px] text-ink">
                {MCP_ENDPOINT}
              </code>
              <p className="mt-2 text-[12px] leading-5 text-muted">
                Streamable HTTP, stateless JSON-RPC over POST. GET returns the text people-mcp. No SSE.
              </p>
            </div>
            <div>
              <p className="eyebrow">Visitor scope</p>
              <p className="mt-3 text-[14px] font-semibold text-ink" data-testid="mcp-token-disclaimer">
                public demo token · aggregate only · min_cell 50
              </p>
              <p className="mt-2 text-[13px] leading-6 text-body-2">
                The token maps to <code>demo-external-viewer</code>. It is a public demo credential,
                not a secret. It cannot select another identity, run SQL, list people, or open
                incident replay. Rotate it by changing the Vercel env vars and redeploying.
              </p>
            </div>
          </div>
          <CopyToken token={token} />
          {!token ? (
            <p className="mt-3 text-[13px] text-danger">
              NEXT_PUBLIC_MCP_DEMO_TOKEN is not set in this deployment.
            </p>
          ) : null}
        </section>

        <ConnectGuide endpoint={MCP_ENDPOINT} token={token} />

        <section className="surface mt-10 p-6 sm:p-8" data-testid="mcp-tools">
          <p className="eyebrow">15 tools</p>
          <p className="mt-2 text-[13px] leading-6 text-body-2">
            Every tool maps to a people_get_* RPC. None accepts identity_id; the token fixes the
            identity server-side.
          </p>
          <ul className="mt-4 grid gap-2 text-[13px] leading-6 text-body md:grid-cols-2">
            {TOOLS.map(([name, copy]) => (
              <li key={name}>
                <code className="font-semibold text-ink">{name}</code>
                <span className="text-body-2"> — {copy}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 text-[13px] leading-6 text-body-2">
          Next:{" "}
          <Link href="/try#permissions" className="font-semibold text-primary">
            Test permissions with four identities
          </Link>
          {" · "}
          <Link href="/architecture" className="font-semibold text-primary">
            Architecture
          </Link>
          {" · "}
          <Link href="/dataset" className="font-semibold text-primary">
            Dataset
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
