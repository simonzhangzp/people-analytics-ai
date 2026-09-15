/**
 * Five-layer AI-ready People Analytics architecture + two cross-cutting pillars.
 *
 * `status` is the live-vs-roadmap boundary from the redesign brief §12 and
 * docs/PEOPLE_AI_AGENT_ARCHITECTURE.md §11. "target" items are shown with a
 * Target-architecture tag and must never read as shipped.
 */

import type { DemoCaseId } from "./demo-cases";

export type ShipStatus = "live" | "target";

export type LayerComponent = {
  label: string;
  status: ShipStatus;
  /** Optional deep link when the component is directly visible on the site. */
  href?: string;
};

export type LayerId = "L1" | "L2" | "L3" | "L4" | "L5";

export type ArchitectureLayer = {
  id: LayerId;
  name: string;
  short: string;
  /** One business sentence shown on hover. */
  explanation: string;
  /** What the layer contributes to the recruiter question "why is this different?" */
  whyItMatters: string;
  components: LayerComponent[];
  cases: DemoCaseId[];
  cta: { label: string; href: string };
  /** Overall layer status for the tag in the rail. */
  status: ShipStatus | "mixed";
};

export const ARCHITECTURE_LAYERS: ArchitectureLayer[] = [
  {
    id: "L1",
    name: "Data Foundation",
    short: "Sources → canonical People model",
    explanation:
      "Source contracts, mapping and quality tests turn HRIS, ATS and LMS extracts into a canonical People model with an identity crosswalk.",
    whyItMatters:
      "Bad rows are caught at the layer that produced them, not discovered in a dashboard weeks later.",
    components: [
      { label: "Source contracts", status: "live" },
      { label: "Source systems / APIs", status: "live" },
      { label: "Mapping", status: "live" },
      { label: "Canonical People model", status: "live" },
      { label: "Bronze / Silver / Gold", status: "live" },
      { label: "Quality tests", status: "live", href: "/enterprise-demo/trust" },
      { label: "Identity crosswalk", status: "live" },
    ],
    cases: ["trust", "incident"],
    cta: { label: "See the quality tests behind Headcount", href: "/enterprise-demo/trust" },
    status: "live",
  },
  {
    id: "L2",
    name: "Knowledge & Semantic",
    short: "Certified metrics, rules, lineage",
    explanation:
      "Every core metric is a versioned asset with a business definition, formula, numerator, denominator, grain, owner, sensitivity and min-cell rule.",
    whyItMatters:
      "The AI reads the same certified definition a finance controller would sign, so there is one Headcount, not five.",
    components: [
      { label: "Metric definitions", status: "live", href: "/enterprise-demo/metrics" },
      { label: "Business rules", status: "live" },
      { label: "Glossary", status: "live" },
      { label: "Entity model", status: "live" },
      { label: "Join paths", status: "live" },
      { label: "Lineage", status: "live", href: "/enterprise-demo/trust" },
      { label: "Certified semantic layer", status: "live" },
    ],
    cases: ["trust"],
    cta: { label: "Open the Metric Explorer", href: "/enterprise-demo/metrics" },
    status: "live",
  },
  {
    id: "L3",
    name: "Analytical Skills & Models",
    short: "Reusable analysis, versioned and tested",
    explanation:
      "Common methods — significance tests, driver analysis, cohorts, forecasting — become certified skills the agent can reuse instead of rebuilding from scratch.",
    whyItMatters:
      "Today the site ships 15 governed tools and a deterministic skeleton. The skills registry is the target state, shown as roadmap.",
    components: [
      { label: "Deterministic case skeletons", status: "live", href: "/enterprise-demo/attrition" },
      { label: "Segmentation over certified metrics", status: "live", href: "/enterprise-demo/attrition" },
      { label: "Statistical methods library", status: "target" },
      { label: "Skills registry / SKILL.md", status: "target" },
      { label: "Model library", status: "target" },
      { label: "Skill evaluation", status: "target" },
    ],
    cases: ["attrition"],
    cta: { label: "Run the attrition analysis", href: "/try#run" },
    status: "mixed",
  },
  {
    id: "L4",
    name: "Agent Runtime",
    short: "Bounded tools, critic, trace, budget",
    explanation:
      "The model chooses which governed tool to call and writes hypotheses. SQL produces the numbers. A critic withholds answers that do not reconcile.",
    whyItMatters:
      "If the planner fails, headline, facts and tool sequence stay the same — the deterministic skeleton is the product, the LLM is the edge.",
    components: [
      { label: "Governed tool registry (15 tools)", status: "live", href: "/connect" },
      { label: "Tier 1 deterministic requests", status: "live" },
      { label: "Tier 2 bounded exploratory planning", status: "live" },
      { label: "Refusal", status: "live" },
      { label: "Critic / verifier", status: "live" },
      { label: "Trace", status: "live", href: "/try#run" },
      { label: "Budget / guardrails", status: "live" },
      { label: "Tier 3 multi-agent", status: "target" },
    ],
    cases: ["attrition"],
    cta: { label: "Inspect a trace", href: "/try#run" },
    status: "mixed",
  },
  {
    id: "L5",
    name: "Experience",
    short: "Cases, explorer, ask, MCP",
    explanation:
      "Every visitor-facing surface sits on the same RPCs: three case studies, a Metric Explorer, follow-up Ask, and an MCP endpoint for your own AI client.",
    whyItMatters:
      "Nothing on a page is typed by hand. Pages call serving functions; they never scan lake files.",
    components: [
      { label: "Case studies", status: "live", href: "/enterprise-demo" },
      { label: "Metric Explorer", status: "live", href: "/enterprise-demo/metrics" },
      { label: "Follow-up Ask", status: "live", href: "/enterprise-demo/attrition" },
      { label: "MCP connection", status: "live", href: "/connect" },
      { label: "Dataset", status: "live", href: "/dataset" },
      { label: "Architecture", status: "live", href: "/architecture" },
      { label: "Trust / evaluation scorecard", status: "live", href: "/enterprise-demo/trust" },
      { label: "Signals page / proactive briefs", status: "target" },
    ],
    cases: ["trust", "incident", "attrition"],
    cta: { label: "Try it yourself", href: "/try" },
    status: "mixed",
  },
];

export type PillarId = "governance" | "observability";

export type ArchitecturePillar = {
  id: PillarId;
  name: string;
  explanation: string;
  components: LayerComponent[];
  cases: DemoCaseId[];
  cta: { label: string; href: string };
};

export const ARCHITECTURE_PILLARS: ArchitecturePillar[] = [
  {
    id: "governance",
    name: "Governance & Trust",
    explanation:
      "Identity, row-level security, suppression and sensitivity are enforced in the data layer. The agent inherits the user's permissions; it is not an authorization point.",
    components: [
      { label: "Identity", status: "live" },
      { label: "FORCE RLS", status: "live" },
      { label: "Suppression (min_cell)", status: "live", href: "/try#permissions" },
      { label: "Org scope", status: "live" },
      { label: "Sensitivity", status: "live" },
      { label: "Business-rule governance", status: "live" },
      { label: "Human approval for sensitive actions", status: "target" },
    ],
    cases: ["trust", "attrition"],
    cta: { label: "Test permissions", href: "/try#permissions" },
  },
  {
    id: "observability",
    name: "Observability & Evaluation",
    explanation:
      "Data quality, freshness, incidents, lineage, agent traces and a golden-set eval are monitored so a feed failure never becomes a business story.",
    components: [
      { label: "Data quality tests", status: "live", href: "/enterprise-demo/trust" },
      { label: "Freshness", status: "live" },
      { label: "Incidents", status: "live", href: "/enterprise-demo/incident" },
      { label: "Lineage", status: "live" },
      { label: "Agent trace", status: "live" },
      { label: "Eval / golden set (E1)", status: "live", href: "/enterprise-demo/trust" },
      { label: "Nightly automatic E1", status: "target" },
    ],
    cases: ["incident", "trust"],
    cta: { label: "Replay the incident", href: "/enterprise-demo/incident" },
  },
];

/** Case → layers/pillars it proves. Used to render cases as architecture proof points. */
export const CASE_PROOF: Record<
  DemoCaseId,
  { thesis: string; layers: LayerId[]; pillars: PillarId[]; emphasis?: boolean }
> = {
  trust: {
    thesis: "Why this number is trustworthy.",
    layers: ["L1", "L2"],
    pillars: ["governance"],
  },
  incident: {
    thesis: "An incomplete data feed is not the same thing as workforce attrition.",
    layers: ["L1"],
    pillars: ["observability"],
    emphasis: true,
  },
  attrition: {
    thesis: "Observed evidence stays separate from AI-generated hypotheses.",
    layers: ["L2", "L3", "L4"],
    pillars: ["governance"],
  },
};

export function layerById(id: LayerId): ArchitectureLayer {
  const layer = ARCHITECTURE_LAYERS.find((row) => row.id === id);
  if (!layer) throw new Error(`Unknown layer ${id}`);
  return layer;
}
