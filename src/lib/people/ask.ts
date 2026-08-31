import { runPeopleTool, type PeopleToolCall } from "./tools";

export type PeopleDemoCase = "trust" | "incident" | "attrition";

export const CASE_FOLLOW_UPS: Record<PeopleDemoCase, string[]> = {
  trust: [
    "How is Headcount defined?",
    "What is current Engineering headcount?",
    "Who owns this metric?",
    "What quality tests ran?",
  ],
  incident: [
    "Why did APAC headcount drop?",
    "Was this published as a workforce change?",
    "Which metrics were affected?",
    "What does the lineage show?",
  ],
  attrition: [
    "Show me the tenure breakdown",
    "What about compensation?",
    "Which locations matter most?",
    "How is voluntary attrition defined?",
    "What should we investigate next?",
    "Which critical skills have the largest gaps?",
  ],
};

export interface PeopleAskAnswer {
  question: string;
  supported: boolean;
  headline: string;
  facts: string[];
  interpretation: string[];
  quality_status: string;
  freshness: unknown;
  definition?: unknown;
  evidence: unknown[];
  lineage?: unknown;
  tools_used: string[];
}

const PLAYBOOKS: Array<{ match: RegExp; tools: PeopleToolCall[] }> = [
  {
    match: /engineering headcount|current.*headcount|trust this number|how is headcount defined/i,
    tools: [
      { name: "get_metric_value", args: { metric_id: "headcount", job_family: "Engineering" } },
      { name: "get_metric_definition", args: { metric_id: "headcount" } },
    ],
  },
  {
    match: /who owns this metric|metric owner/i,
    tools: [{ name: "get_metric_definition", args: { metric_id: "headcount" } }],
  },
  {
    match: /quality tests ran/i,
    tools: [{ name: "get_source_health" }, { name: "get_quality_incidents" }],
  },
  {
    match: /voluntary attrition defined|how is voluntary attrition/i,
    tools: [{ name: "get_metric_definition", args: { metric_id: "voluntary_attrition" } }],
  },
  {
    match: /apac headcount|workforce change|metrics were affected|lineage show/i,
    tools: [
      { name: "get_quality_incidents" },
      { name: "get_source_health" },
      { name: "trace_lineage", args: { metric_id: "headcount" } },
    ],
  },
  {
    match: /tenure breakdown/i,
    tools: [
      {
        name: "breakdown_metric",
        args: { metric_id: "voluntary_attrition", dimension: "tenure_band", job_family: "Engineering" },
      },
    ],
  },
  {
    match: /locations matter|location breakdown|concentrated/i,
    tools: [
      { name: "get_workforce_analysis", args: { job_family: "Engineering" } },
      {
        name: "breakdown_metric",
        args: { metric_id: "voluntary_attrition", dimension: "location_id", job_family: "Engineering" },
      },
    ],
  },
  {
    match: /compensation/i,
    tools: [
      { name: "get_metric_value", args: { metric_id: "compa_ratio", job_family: "Engineering" } },
      { name: "get_workforce_analysis", args: { job_family: "Engineering" } },
    ],
  },
  {
    match: /investigate next|what should we/i,
    tools: [{ name: "get_workforce_analysis", args: { job_family: "Engineering" } }],
  },
  {
    match: /internal mobility/i,
    tools: [
      { name: "get_metric_value", args: { metric_id: "internal_mobility_rate", job_family: "Engineering" } },
      { name: "get_metric_definition", args: { metric_id: "internal_mobility_rate" } },
    ],
  },
  {
    match: /critical skills|skill gap/i,
    tools: [{ name: "get_skill_gap", args: { job_family: "Engineering" } }],
  },
  {
    match: /learning should we prioritize|learning/i,
    tools: [
      { name: "get_skill_gap", args: { job_family: "Engineering" } },
      { name: "get_learning_recommendations", args: { job_family: "Engineering", skill_id: "skill_python" } },
    ],
  },
];

export function matchPeoplePlaybook(question: string): PeopleToolCall[] | null {
  const normalized = question.trim();
  for (const playbook of PLAYBOOKS) {
    if (playbook.match.test(normalized)) return playbook.tools;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickQuality(evidence: unknown[]): string {
  const statuses: string[] = [];
  for (const item of evidence) {
    const row = asRecord(item);
    if (typeof row.quality_status === "string") statuses.push(row.quality_status);
    const nested = asRecord(row.metric);
    if (typeof nested.quality_status === "string") statuses.push(nested.quality_status);
    const critical = asRecord(row.critical_skill_gap);
    if (typeof critical.quality_status === "string") statuses.push(critical.quality_status);
  }
  if (statuses.includes("unhealthy")) return "unhealthy";
  return statuses[0] ?? "unknown";
}

function pickFreshness(evidence: unknown[]): unknown {
  for (const item of evidence) {
    const row = asRecord(item);
    if (row.freshness) return row.freshness;
    const nested = asRecord(row.metric);
    if (nested.freshness) return nested.freshness;
  }
  return null;
}

function formatValue(payload: unknown): string {
  const row = asRecord(payload);
  const value = row.value;
  const unit = row.unit;
  if (typeof value !== "number") return "unavailable";
  if (unit === "rate") return `${(value * 100).toFixed(1)}%`;
  if (unit === "hours") return `${value.toFixed(1)} hours`;
  return Math.round(value).toLocaleString();
}

function breakdownRows(payload: unknown): Record<string, unknown>[] {
  const rows = asRecord(payload).rows;
  return Array.isArray(rows) ? rows.map((row) => asRecord(row)) : [];
}

export function composePeopleAnswer(
  question: string,
  tools: PeopleToolCall[],
  evidence: unknown[],
  demoCase?: PeopleDemoCase,
): PeopleAskAnswer {
  const facts: string[] = [];
  const interpretation: string[] = [];
  let headline = "Serving tools returned structured evidence.";
  let definition: unknown;
  let lineage: unknown;
  let quality = pickQuality(evidence);
  const freshness = pickFreshness(evidence);

  if (/engineering headcount|current.*headcount|trust this number/i.test(question)) {
    headline = `Engineering headcount is ${formatValue(evidence[0])}.`;
    facts.push(
      `Certified calculator: ${formatValue(evidence[0])} as of ${String(asRecord(evidence[0]).as_of ?? "latest month")}.`,
    );
    facts.push(`Current published snapshot quality: ${quality}.`);
    definition = evidence[1];
    interpretation.push(
      quality === "unhealthy"
        ? "This figure is not treated as trusted business data in the selected snapshot."
        : "This is the latest certified month-end snapshot. The APAC extract failure is a separate historical replay and was not published as a workforce change.",
    );
  } else if (/how is headcount defined|who owns this metric/i.test(question)) {
    const def = asRecord(evidence[evidence.length - 1] ?? evidence[0]);
    headline = String(def.business_definition ?? "Headcount definition");
    facts.push(`Owner: ${String(def.owner ?? "People Analytics")}`);
    facts.push(`Formula: ${String(def.formula ?? def.formula_sql)}`);
    facts.push(`Version ${String(def.version ?? 1)}`);
    definition = def;
  } else if (/voluntary attrition defined|how is voluntary attrition/i.test(question)) {
    const def = asRecord(evidence[0]);
    headline = String(def.business_definition ?? "Voluntary attrition definition");
    facts.push(`Formula: ${String(def.formula ?? def.formula_sql)}`);
    facts.push(`Numerator: ${String(def.numerator_definition)}`);
    facts.push(`Denominator: ${String(def.denominator_definition)}`);
    facts.push(`Exclusions: ${String(def.exclusions)}`);
    definition = def;
  } else if (/apac|workforce change|metrics were affected|lineage show/i.test(question)) {
    const incidents = asRecord(evidence[0]);
    const list = (incidents.incidents as unknown[]) ?? [];
    const apac = asRecord(
      list.find((item) => asRecord(item).incident_id === "people-incident-apac-hris-incomplete"),
    );
    headline = "This is a data issue, not a workforce change.";
    facts.push(
      `Expected APAC rows: ${String(apac.expected_records ?? "see incident")}; received: ${String(apac.actual_records ?? "see incident")}.`,
    );
    facts.push(`Incident business_change=${String(apac.business_change)}.`);
    facts.push("The incomplete extract was not published into the current trusted snapshot.");
    interpretation.push(
      "Replay context only: downstream Headcount reporting is blocked until the HRIS feed is complete.",
    );
    lineage = evidence[2];
    quality = "unhealthy";
  } else if (/tenure breakdown/i.test(question)) {
    const rows = breakdownRows(evidence[0]);
    headline = "Engineering voluntary attrition by tenure band.";
    for (const row of rows.slice(0, 5)) {
      facts.push(
        `${String(row.dimension)}: ${typeof row.value === "number" ? `${(Number(row.value) * 100).toFixed(1)}%` : "n/a"}`,
      );
    }
    interpretation.push("Tenure concentration is observed evidence, not a proven cause.");
  } else if (/compensation/i.test(question)) {
    headline = `Engineering mean compa-ratio is ${formatValue(evidence[0])}.`;
    facts.push(`Compa-ratio from the compensation mart: ${formatValue(evidence[0])}.`);
    interpretation.push(
      "Pay position can coincide with attrition without proving that compensation caused the exits.",
    );
  } else if (/locations matter|concentrated/i.test(question)) {
    const analysis = asRecord(evidence[0]);
    const byLocation = Array.isArray(analysis.by_location) ? analysis.by_location : [];
    const top = asRecord(byLocation[0]);
    headline = `Engineering attrition is most concentrated in ${String(top.location_id ?? "the highest-rate location")}.`;
    facts.push(`Latest Engineering voluntary attrition: ${formatValue(analysis.metric)}.`);
    if (top.location_id) {
      facts.push(
        `${String(top.location_id)} rate ${typeof top.voluntary_attrition_rate === "number" ? `${(Number(top.voluntary_attrition_rate) * 100).toFixed(1)}%` : "n/a"}.`,
      );
    }
    interpretation.push(
      "Location, tenure, and level concentrations are observed associations. They do not by themselves prove a cause.",
    );
  } else if (/investigate next|what should we/i.test(question)) {
    headline = "Investigate the highest-rate Engineering slices before a company-wide program.";
    facts.push("Start with the top locations and the tenure band with the steepest rate.");
    facts.push("Compare internal mobility and compa-ratio on the same slices.");
    facts.push("Keep the APAC HRIS replay out of any current-state board pack.");
    interpretation.push("These are next investigative steps, not proven interventions.");
  } else if (/internal mobility/i.test(question)) {
    headline = `Engineering internal mobility is ${formatValue(evidence[0])}.`;
    facts.push(`Internal mobility rate (promotions + laterals / headcount): ${formatValue(evidence[0])}.`);
    definition = evidence[1];
  } else if (/critical skills|skill gap/i.test(question)) {
    const gaps = asRecord(evidence[0]);
    const rows = Array.isArray(gaps.gaps) ? gaps.gaps : [];
    const critical = rows
      .map((row) => asRecord(row))
      .filter((row) => row.is_critical)
      .sort((a, b) => Number(b.gap_rate ?? 0) - Number(a.gap_rate ?? 0));
    const top = critical[0];
    headline = top
      ? `Largest Engineering critical-skill gap: ${String(top.skill_name)} (${(Number(top.gap_rate) * 100).toFixed(0)}% uncovered).`
      : "No critical skill gap rows were returned.";
    for (const row of critical.slice(0, 4)) {
      facts.push(
        `${String(row.skill_name)}: coverage ${(Number(row.internal_coverage_rate) * 100).toFixed(0)}%, gap ${(Number(row.gap_rate) * 100).toFixed(0)}% (synthetic internal skills).`,
      );
    }
    interpretation.push(
      "Internal skill supply is synthetic GlobalTech data. O*NET labels are external public taxonomy.",
    );
  } else if (/learning/i.test(question)) {
    const recs = asRecord(evidence[1] ?? evidence[0]);
    const list = Array.isArray(recs.recommendations) ? recs.recommendations : [];
    headline = "Prioritize AI/cloud learning paths against the largest Engineering critical-skill gaps.";
    facts.push("Internal workforce skills are synthetic; Microsoft Learn recommendations are external public content.");
    for (const item of list.slice(0, 3).map((row) => asRecord(row))) {
      facts.push(`${String(item.title)}`);
    }
  } else if (/quality tests/i.test(question)) {
    headline = "Quality tests and source health are available from the serving layer.";
    facts.push("Current published metrics remain trusted; the APAC volume test belongs to incident replay.");
  }

  if (demoCase === "incident" && /apac|workforce change|lineage/i.test(question)) {
    facts.push("You are in incident replay, not the current trusted snapshot.");
  }

  return {
    question,
    supported: true,
    headline,
    facts,
    interpretation,
    quality_status: quality,
    freshness,
    definition,
    evidence,
    lineage,
    tools_used: tools.map((tool) => tool.name),
  };
}

export async function answerPeopleDemoQuestion(
  question: string,
  demoCase?: PeopleDemoCase,
): Promise<PeopleAskAnswer> {
  const tools = matchPeoplePlaybook(question);
  if (!tools) {
    return {
      question,
      supported: false,
      headline: "I can look that up with governed People tools.",
      facts: [
        "Ask about a metric value, definition, quality incident, location, tenure, compensation, or skills.",
        "SQL and arithmetic stay in the database. This assistant does not run arbitrary queries.",
      ],
      interpretation: [],
      quality_status: "unknown",
      freshness: null,
      evidence: [],
      tools_used: [],
    };
  }
  const evidence = [];
  for (const tool of tools) {
    evidence.push(await runPeopleTool(tool));
  }
  return composePeopleAnswer(question, tools, evidence, demoCase);
}
