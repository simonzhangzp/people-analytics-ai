import Link from "next/link";
import { ServingUnavailable } from "@/components/enterprise-demo/DemoShell";
import { CopyToken } from "@/components/site/CopyToken";
import { LiveTag } from "@/components/site/LiveTag";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { AnalysisRunner, type CertifiedMetricSummary } from "@/components/try/AnalysisRunner";
import { GovernanceCard, type GovernedMetric } from "@/components/try/GovernanceCard";
import { PermissionsLab } from "@/components/try/PermissionsLab";
import { TraceNumber, type IncidentBridge, type TraceStep } from "@/components/try/TraceNumber";
import { CONNECT_GUIDES, MCP_ENDPOINT, SUPPORT_LABEL } from "@/lib/people/connect-guides";
import { DEFAULT_IDENTITY } from "@/lib/people/demo-identities";
import { LAYER_TONE, PILLAR_TONE, type LayerTone } from "@/lib/people/layer-tones";
import { headcountLineageSteps, loadAttritionCase, loadIncidentCase, loadTrustCase } from "@/lib/people/demo-payload";
import { buildDependencyGraph } from "@/lib/people/dependency-graph";
import { asRecord, formatCount, formatRate } from "@/lib/people/format";
import { peopleGetGlossaryTerm, peopleListMetrics } from "@/lib/people/v2-client";
import { peopleV2Configured } from "@/lib/people/v2-config";
import { pageMetadata } from "@/lib/site-metadata";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = pageMetadata({
  title: "Try It Yourself",
  description:
    "Five hands-on modules: connect your AI client over MCP, test identity-aware permissions, trace a certified number, govern a metric, and run a bounded analysis on synthetic GlobalTech.",
  path: "/try",
});

/** Each module carries the colour of the architecture layer / pillar it exercises. */
const MODULE_TONE: Record<number, LayerTone> = {
  1: LAYER_TONE.L4,
  2: PILLAR_TONE.governance,
  3: LAYER_TONE.L1,
  4: LAYER_TONE.L2,
  5: LAYER_TONE.L3,
};

const MODULES = [
  { id: "connect", index: 1, title: "Connect your AI", claim: "Governed AI access" },
  { id: "permissions", index: 2, title: "Test permissions", claim: "Identity-aware access" },
  { id: "trace", index: 3, title: "Trace a number", claim: "Built-in data trust" },
  { id: "govern", index: 4, title: "Govern a metric", claim: "Explicit business logic" },
  { id: "run", index: 5, title: "Run an analysis", claim: "Reusable analytical intelligence" },
] as const;

function str(value: unknown, fallback = "—"): string {
  if (value == null || value === "") return fallback;
  if (Array.isArray(value)) return value.map(String).join(", ") || fallback;
  return String(value);
}

function governanceFields(def: Record<string, unknown>, registry: Record<string, unknown>) {
  return [
    { label: "Metric id", value: str(def.metric_id) },
    { label: "Business definition", value: str(def.business_definition) },
    { label: "Formula", value: str(def.formula ?? registry.formula) },
    { label: "Numerator", value: str(def.numerator ?? def.numerator_definition ?? registry.numerator) },
    {
      label: "Denominator",
      value: str(def.denominator ?? def.denominator_definition ?? registry.denominator, "— (count metric)"),
    },
    { label: "Inclusion / population", value: str(def.population_rules, "— (not in data-v1 registry)") },
    { label: "Exclusion", value: str(def.exclusions, "— (not in data-v1 registry)") },
    { label: "Grain table", value: str(def.grain_table ?? registry.grain_table) },
    { label: "Window", value: str(def.window ?? def.time_logic) },
    { label: "Annualized", value: def.annualized == null ? "—" : def.annualized ? "yes" : "no" },
    { label: "Effective date", value: str(def.effective_date, "— (not in data-v1 registry)") },
    { label: "Version", value: `v${str(def.version ?? registry.version)}` },
    { label: "Owner", value: str(def.owner) },
    { label: "Status", value: str(def.status ?? registry.status) },
    { label: "Sensitivity", value: str(registry.sensitivity ?? def.sensitivity) },
    { label: "Metric min cell", value: str(registry.min_cell ?? def.metric_min_cell) },
    { label: "Health", value: str(registry.health_status ?? def.health_status ?? def.quality_status) },
  ];
}

export default async function TryPage() {
  if (!peopleV2Configured()) return <ServingUnavailable />;
  const token = process.env.NEXT_PUBLIC_MCP_DEMO_TOKEN?.trim() ?? "";

  const [trust, incident, attrition, registry, workforceRules, retentionRules] = await Promise.all([
    loadTrustCase(DEFAULT_IDENTITY),
    loadIncidentCase(),
    loadAttritionCase(DEFAULT_IDENTITY),
    peopleListMetrics(DEFAULT_IDENTITY),
    peopleGetGlossaryTerm(DEFAULT_IDENTITY, "BR-WF-00"),
    peopleGetGlossaryTerm(DEFAULT_IDENTITY, "BR-RET"),
  ]);

  const registryRow = (id: string) => asRecord(registry.find((row) => String(row.metric_id) === id));
  const headcountDef = asRecord(trust.definition);
  const attritionDef = asRecord(attrition.definition);
  const lineageRows = trust.lineage.lineage as Record<string, unknown>[];
  const headcountRules = workforceRules.filter((row) => ["BR-WF-001", "BR-WF-008"].includes(String(row.rule_id)));
  const attritionRules = [
    ...retentionRules.filter((row) => String(row.rule_id) === "BR-RET-001"),
    ...workforceRules.filter((row) => String(row.rule_id) === "BR-WF-004"),
  ];

  const headcountValue = formatCount(trust.companyMetric.value);
  const asOf = String(trust.snapshot.as_of_date);
  const lineage = headcountLineageSteps(lineageRows);

  const traceSteps: TraceStep[] = [
    {
      id: "snapshot",
      title: "Certified snapshot",
      summary: `current_certified · run data-v1 · certified ${trust.run.certified === true ? "true" : "false"}`,
      tone: trust.run.certified === true ? "ok" : "warn",
      rows: [
        { label: "Pointer", value: "current_certified" },
        { label: "As of", value: asOf },
        { label: "Serving run", value: str(trust.run.run_id, "data-v1") },
        { label: "Simulator SHA", value: str(trust.run.simulator_code_sha).slice(0, 12) },
      ],
      footnote: "The website reads whatever this pointer certifies. The incident replay lives behind a different pointer and never overwrites it.",
    },
    {
      id: "definition",
      title: "Metric definition",
      summary: str(headcountDef.business_definition),
      tone: "ok",
      rows: [
        { label: "Formula", value: str(headcountDef.formula) },
        { label: "Numerator", value: str(headcountDef.numerator) },
        { label: "Window", value: str(headcountDef.window ?? headcountDef.time_logic) },
        { label: "Population / exclusions", value: str(headcountDef.population_rules ?? headcountDef.exclusions, "— (not in data-v1 registry; see BR-WF-001)") },
        { label: "Owner · version", value: `${str(headcountDef.owner)} · v${str(headcountDef.version)}` },
      ],
      href: { label: "Metric Explorer", to: "/enterprise-demo/metrics" },
    },
    {
      id: "health",
      title: "Source health",
      summary: `Metric health ${str(trust.health.status, "healthy")} · ${str(trust.health.reason, "no open reason")}`,
      tone: String(trust.health.status ?? "healthy") === "healthy" ? "ok" : "warn",
      rows: [
        { label: "Status", value: str(trust.health.status, "healthy") },
        { label: "Reason", value: str(trust.health.reason, "—") },
        { label: "Freshness", value: trust.run.certified ? "healthy (frozen data-v1)" : "failed" },
      ],
    },
    {
      id: "quality",
      title: "Quality tests",
      summary: `${trust.qualityCounts.total} tests · bronze ${trust.qualityCounts.bronze} / silver ${trust.qualityCounts.silver} / gold ${trust.qualityCounts.gold}${trust.qualityCounts.allPassed ? " · all passed" : " · has failures"}`,
      tone: trust.qualityCounts.allPassed ? "ok" : "warn",
      rows: trust.testsByLayer.map((group) => ({
        label: `${group.layer} layer`,
        value: `${group.tests.length} tests · ${group.tests.filter((row) => row.status === "passed").length} passed`,
      })),
      href: { label: "Full test catalog on Case 1", to: "/enterprise-demo/trust" },
    },
    {
      id: "lineage",
      title: "Lineage",
      summary: lineage.map((step) => step.label).join(" → "),
      tone: "ok",
      rows: lineage.map((step) => ({ label: step.label, value: step.table })),
      footnote: "Pages call people_get_metric_for. They never scan lake files.",
    },
    {
      id: "rules",
      title: "Business rules",
      summary: headcountRules.map((row) => String(row.rule_id)).join(" · ") || "BR-WF-001",
      tone: "ok",
      rows: headcountRules.map((row) => ({ label: String(row.rule_id), value: String(row.statement ?? "").trim() })),
      footnote: "Versioned in people_business_rules.yaml and loaded into people_business_rule. The agent reads the same statement through get_glossary_term.",
    },
    {
      id: "publish",
      title: "Publish status",
      summary: `${str(trust.lineage.publish_status, "published")} · quality ${str(trust.lineage.quality_status, "healthy")}`,
      tone: String(trust.lineage.publish_status ?? "published") === "published" ? "ok" : "warn",
      rows: [
        { label: "Publish", value: str(trust.lineage.publish_status, "published") },
        { label: "Quality", value: str(trust.lineage.quality_status, "healthy") },
        { label: "Company Headcount", value: `${headcountValue} · matches the parity table when serving_run.certified is true` },
      ],
    },
  ];

  const expected = Number(incident.apac.expected_records);
  const actual = Number(incident.apac.actual_records);
  const replayBad = Number(asRecord(incident.replay).value_bad);
  const replayExpected = Number(asRecord(incident.replay).value_expected);
  const replayDropPct =
    Number.isFinite(replayBad) && Number.isFinite(replayExpected) && replayExpected > 0
      ? Math.round((1 - replayBad / replayExpected) * 100)
      : null;
  const bridge: IncidentBridge = {
    apparent: `Replay Headcount ${formatCount(replayBad)} against expected ${formatCount(replayExpected)}${replayDropPct == null ? "" : ` — a ${replayDropPct}% fall in one day`}. On a dashboard that reads like a mass exit from APAC overnight.`,
    incident: `Employee full extract on ${str(incident.snapshot.as_of_date)}: ${formatCount(actual)} rows received of ${formatCount(expected)} control total across all regions; the ${formatCount(expected - actual)} missing rows are all APAC. Test apac_hris_volume failed.`,
    guardrail: `Publish ${str(incident.lineage.publish_status).replaceAll("_", " ")} · quality ${str(incident.lineage.quality_status)}. Executive reporting is blocked; the certified pointer does not move.`,
    currentHeadcount: headcountValue,
  };

  const governed: GovernedMetric[] = [
    {
      metricId: "headcount",
      name: "Headcount",
      fields: governanceFields(headcountDef, registryRow("headcount")),
      graph: buildDependencyGraph({ metricId: "headcount", definition: headcountDef, lineageRows, rules: headcountRules }),
    },
    {
      metricId: "voluntary_attrition_rate",
      name: "Voluntary Attrition Rate",
      fields: governanceFields(attritionDef, registryRow("voluntary_attrition_rate")),
      graph: buildDependencyGraph({ metricId: "voluntary_attrition_rate", definition: attritionDef, lineageRows, rules: attritionRules }),
    },
  ];

  const metricSummary: CertifiedMetricSummary = {
    label: "Engineering voluntary attrition",
    value: formatRate(asRecord(attrition.metric).value),
    scope: attrition.engineeringGrain.scope,
    window: attrition.engineeringGrain.window,
    asOf: attrition.engineeringGrain.asOf,
    companyValue: formatRate(attrition.companyMetric.value),
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SiteHeader active="/try" />
      <main className="w-full flex-1 mx-auto max-w-[1100px] px-5 pb-24 pt-16 sm:px-8">
        <section className="max-w-3xl">
          <p className="eyebrow">Try it yourself</p>
          <h1 className="hero-title mt-5">
            Five claims. <span className="hl hl-ai">Verify each one</span> with your own hands.
          </h1>
          <p className="lede mt-6">
            Everything below runs against the <strong className="font-semibold text-certified-dark">live serving layer</strong>{" "}
            for synthetic GlobalTech. Same RPCs, same policies, same 15 tools your own AI client would use.
          </p>
        </section>

        <nav aria-label="Modules" className="mt-10 grid gap-2 sm:grid-cols-5" data-testid="try-modules">
          {MODULES.map((module) => {
            const tone = MODULE_TONE[module.index];
            return (
              <a
                key={module.id}
                href={`#${module.id}`}
                className="surface relative flex flex-col gap-1 overflow-hidden p-4 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", tone.solid)} />
                <span className={cn("text-[11px] font-bold", tone.text)}>Module {module.index}</span>
                <span className="display text-[15px] font-bold text-ink">{module.title}</span>
                <span className="text-[11px] text-muted">{module.claim}</span>
              </a>
            );
          })}
        </nav>

        {/* Module 1 */}
        <section id="connect" className="mt-24 scroll-mt-8" aria-labelledby="m1-title">
          <ModuleHeading index={1} claim="Governed AI access" title="Connect your AI" id="m1-title">
            Point ChatGPT, Claude, Copilot, Cursor or any MCP client at the same governed tools this
            site uses. The model gets tools, not tables.
          </ModuleHeading>
          <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="surface p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Endpoint</p>
              <code className="mt-2 block overflow-x-auto rounded-[8px] border border-edge-strong bg-canvas-2 px-3 py-2 text-[13px] text-ink">
                {MCP_ENDPOINT}
              </code>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Public demo token</p>
              <p className="mt-1 text-[13px] leading-6 text-body-2" data-testid="try-token-scope">
                Maps to demo-external-viewer · aggregate only · min_cell 50 · 15 read-only tools.
              </p>
              <CopyToken token={token} />
              {!token ? (
                <p className="mt-3 text-[13px] text-danger">NEXT_PUBLIC_MCP_DEMO_TOKEN is not set in this deployment.</p>
              ) : null}
              <Link
                href="/connect"
                className="mt-5 inline-flex min-h-10 items-center rounded-[8px] bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-dark"
              >
                Step-by-step per client
              </Link>
            </div>
            <div className="surface p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Client support · 2026-09</p>
              <ul className="mt-3 space-y-2.5">
                {CONNECT_GUIDES.map((guide) => (
                  <li key={guide.id} className="flex items-start justify-between gap-3 text-[13px]">
                    <Link href={`/connect#${guide.id}`} className="font-semibold text-ink hover:text-primary">
                      {guide.label}
                    </Link>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        guide.support === "verified" && "border-certified-line bg-certified-soft text-certified-dark",
                        guide.support === "supported" && "border-primary-ring bg-primary-soft text-primary-deep",
                        guide.support === "partial" && "border-gold-line bg-gold-soft text-gold-dark",
                        guide.support === "unsupported" && "border-danger-line bg-danger-soft text-danger",
                      )}
                    >
                      {SUPPORT_LABEL[guide.support]}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[12px] leading-5 text-muted">
                Where a client cannot send a static Bearer header we say so instead of pretending.
              </p>
            </div>
          </div>
        </section>

        {/* Module 2 */}
        <section id="permissions" className="mt-24 scroll-mt-8" aria-labelledby="m2-title">
          <ModuleHeading index={2} claim="Identity-aware access" title="Test permissions" id="m2-title">
            Permissions in the AI era are data policy, not prompt wording. Ask the same question as two
            identities and compare what each one is allowed to see.
          </ModuleHeading>
          <PermissionsLab />
        </section>

        {/* Module 3 */}
        <section id="trace" className="mt-24 scroll-mt-8" aria-labelledby="m3-title">
          <ModuleHeading index={3} claim="Built-in data trust" title="Trace a number" id="m3-title">
            Start from certified Headcount and open every layer that has to hold before it is allowed
            on a page. Then watch the same guardrails stop a bad feed.
          </ModuleHeading>
          <TraceNumber
            headline={{ value: headcountValue, label: "Certified Headcount", asOf }}
            steps={traceSteps}
            bridge={bridge}
          />
        </section>

        {/* Module 4 */}
        <section id="govern" className="mt-24 scroll-mt-8" aria-labelledby="m4-title">
          <ModuleHeading index={4} claim="Explicit business logic" title="Govern a metric" id="m4-title">
            A metric is a governed analytical asset, not a SQL snippet. Read the first layer, then open
            lineage and impact to see what a rule change would touch.
          </ModuleHeading>
          <GovernanceCard metrics={governed} />
        </section>

        {/* Module 5 */}
        <section id="run" className="mt-24 scroll-mt-8" aria-labelledby="m5-title">
          <ModuleHeading index={5} claim="Reusable analytical intelligence" title="Run an analysis" id="m5-title">
              Case 3 through the live agent: certified metric, breakdown, evidence, hypotheses, tool
              calls, next questions and the trace. Observed evidence and AI hypotheses never mix.
          </ModuleHeading>
          <div className="mt-4 flex flex-wrap gap-2">
            <LiveTag status="live" />
            <span className="text-[12px] text-muted">The runner is live. The skills grid at the bottom is roadmap.</span>
          </div>
          <AnalysisRunner metric={metricSummary} />
        </section>

        <section className="mt-24 border-t border-edge pt-12">
          <h2 className="section-title max-w-3xl">Go deeper</h2>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/architecture" className="inline-flex min-h-12 items-center rounded-[8px] bg-primary px-6 text-[15px] font-semibold text-white hover:bg-primary-dark">
              Explore the Architecture
            </Link>
            <Link href="/enterprise-demo" className="inline-flex min-h-12 items-center rounded-[8px] border border-edge-strong bg-white px-6 text-[15px] font-semibold text-ink hover:border-edge-strong">
              All three cases
            </Link>
            <Link href="/about" className="inline-flex min-h-12 items-center text-[15px] font-semibold text-primary">
              About the builder
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function ModuleHeading({
  index,
  claim,
  title,
  id,
  children,
}: {
  index: number;
  claim: string;
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  const tone = MODULE_TONE[index];
  return (
    <div className="max-w-3xl">
      <p className="flex items-center gap-2.5 text-[11.5px] font-bold uppercase tracking-[0.08em]">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-[6px] text-[11px] tabular-nums text-white",
            tone.solid,
          )}
        >
          {index}
        </span>
        <span className={tone.text}>{claim}</span>
      </p>
      <h2 id={id} className="section-title mt-3">
        {title}
      </h2>
      <p className="lede mt-4">{children}</p>
    </div>
  );
}
