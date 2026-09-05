import Link from "next/link";
import { CopyToken } from "@/components/site/CopyToken";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { pageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = pageMetadata({
  title: "Connect via MCP",
  description:
    "Read-only People Analytics MCP endpoint. Public demo token, aggregate metrics only, min_cell 50.",
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
  const origin = "https://peopleanalyticsai.net";
  const config = JSON.stringify(
    {
      mcpServers: {
        "people-analytics": {
          url: `${origin}/api/mcp`,
          headers: {
            Authorization: `Bearer ${token || "<NEXT_PUBLIC_MCP_DEMO_TOKEN>"}`,
          },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <SiteHeader />
      <main className="mx-auto max-w-[800px] px-5 py-12 sm:px-8">
        <p className="eyebrow">Data · Connect</p>
        <h1 className="mt-4 text-[32px] font-bold tracking-[-0.04em] text-[#13203a]">
          Connect via MCP
        </h1>
        <p className="mt-5 text-[16px] leading-7 text-[#546277]">
          A read-only MCP endpoint over the same governed People serving RPCs used by the
          enterprise demo. The dataset is synthetic GlobalTech, not a real company.
        </p>

        <section className="surface mt-8 p-6">
          <p className="eyebrow">Visitor scope</p>
          <p
            className="mt-3 text-[14px] font-semibold text-[#1c2b44]"
            data-testid="mcp-token-disclaimer"
          >
            public demo token · aggregate only · min_cell 50
          </p>
          <p className="mt-2 text-[13px] leading-6 text-[#546277]">
            The token maps to <code>demo-external-viewer</code>. It is a public demo credential,
            not a secret. It cannot select another identity, run SQL, list people, or open
            incident replay. Rotate it by changing the Vercel env vars and redeploying.
          </p>
          <CopyToken token={token} />
          {!token ? (
            <p className="mt-3 text-[13px] text-[#934646]">
              NEXT_PUBLIC_MCP_DEMO_TOKEN is not set in this deployment.
            </p>
          ) : null}
        </section>

        <section className="surface mt-6 p-6">
          <p className="eyebrow">Claude Desktop / Cursor</p>
          <p className="mt-3 text-[13px] leading-6 text-[#546277]">
            Streamable HTTP at <code>{origin}/api/mcp</code>. Paste:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-[6px] border border-[#e3e7ed] bg-white p-4 text-[12px] leading-5 text-[#24324b]">
            {config}
          </pre>
        </section>

        <section className="surface mt-6 p-6">
          <p className="eyebrow">15 tools</p>
          <ul className="mt-3 space-y-2 text-[13px] leading-6 text-[#3e4c61]">
            {TOOLS.map(([name, copy]) => (
              <li key={name}>
                <code className="font-semibold text-[#1c2b44]">{name}</code>
                <span className="text-[#546277]"> — {copy}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 text-[13px] leading-6 text-[#546277]">
          Hierarchy and agent classes:{" "}
          <Link href="/architecture" className="font-semibold text-[#3157c9]">
            Architecture
          </Link>
          {" · "}
          <Link href="/dataset" className="font-semibold text-[#3157c9]">
            Dataset
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
