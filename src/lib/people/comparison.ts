/**
 * Homepage Section 1 — Traditional vs AI-Ready People Analytics.
 * Copy follows the redesign brief §2. Row 5 is target architecture and is tagged.
 */

import type { DemoCaseId } from "./demo-cases";
import type { LayerId, PillarId, ShipStatus } from "./architecture-map";

export type ComparisonRow = {
  id: string;
  title: string;
  /** Architecture layer / pillar whose colour the row carries. */
  accent: LayerId | PillarId;
  traditional: string[];
  aiReady: string[];
  thesis: string;
  cases: DemoCaseId[];
  status: ShipStatus;
  tryHref?: string;
};

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    id: "governed-access",
    title: "Governed AI Access",
    accent: "L4",
    traditional: [
      "The LLM reads Excel, report extracts or raw tables",
      "It may write its own SQL or do its own arithmetic",
      "Nobody can say how the answer was computed",
    ],
    aiReady: [
      "AI never touches raw data; it calls certified tools",
      "Numbers come from SQL and deterministic templates",
      "The model only selects tools, interprets, and writes hypotheses",
    ],
    thesis: "AI reasons over governed facts instead of inventing the facts.",
    cases: ["attrition"],
    status: "live",
    tryHref: "/try#run",
  },
  {
    id: "data-trust",
    title: "Built-In Data Trust",
    accent: "L1",
    traditional: [
      "Data problems surface in the dashboard, found by end users",
      "Triage walks dashboard → report → SQL → ETL → source system",
      "Locating one bad number takes hours or days",
    ],
    aiReady: [
      "Contracts, mapping, pipeline, tests, lineage and snapshots are monitored",
      "A failure is pinned to the layer that produced it",
      "Failed checks become incidents, never a silent dashboard change",
    ],
    thesis: "Data quality is monitored before bad data becomes a business story.",
    cases: ["trust", "incident"],
    status: "live",
    tryHref: "/try#trace",
  },
  {
    id: "explicit-logic",
    title: "Explicit Business Logic",
    accent: "L2",
    traditional: [
      "Definitions live in analyst heads, SQL, dashboards and spreadsheets",
      "The same metric has several versions across teams",
      "Reporting conflicts are settled by argument",
    ],
    aiReady: [
      "Each metric is a governed asset: business definition, formula, numerator, denominator, grain, window",
      "Owner, version, status, sensitivity and min-cell rule travel with it",
      "Upstream and downstream dependencies are visible before a rule changes",
    ],
    thesis: "Business rules become governed, versioned assets — not hidden logic in SQL or dashboards.",
    cases: ["trust"],
    status: "live",
    tryHref: "/try#govern",
  },
  {
    id: "identity-access",
    title: "Identity-Aware Access",
    accent: "governance",
    traditional: [
      "Permissions are maintained separately in HRIS, ATS, warehouse and BI",
      "Each layer can drift from the others",
      "A chatbot on top adds one more place to get it wrong",
    ],
    aiReady: [
      "Policy is enforced in the governed data layer with FORCE RLS",
      "The agent inherits the user's identity; it is not an authorization point",
      "Four identities asking the same question get four different answers, each within policy",
    ],
    thesis: "The agent inherits the user's permissions. It does not become a new authorization layer.",
    cases: ["trust", "attrition"],
    status: "live",
    tryHref: "/try#permissions",
  },
  {
    id: "reusable-intelligence",
    title: "Reusable Analytical Intelligence",
    accent: "L3",
    traditional: [
      "Every business question becomes a new project",
      "Pull, clean, analyse, test, interpret, make slides — again",
      "Days or weeks per question",
    ],
    aiReady: [
      "Common methods become versioned, tested, certified skills",
      "The agent reuses them; analysts do not start from zero",
      "Target: detect → analyse → explain → narrate → present",
    ],
    thesis: "Analytical methods become reusable capabilities, not one-off projects.",
    cases: ["attrition"],
    status: "target",
    tryHref: "/try#run",
  },
];
