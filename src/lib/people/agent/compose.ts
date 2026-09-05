import { asList, asRecord, isoDate } from "../format";
import {
  attritionHeadline,
  concentrationLocationFromVisible,
} from "../case3-view";
import { grainFields } from "../metric-grain";
import type { PeopleDemoCase } from "../ask-types";
import type { RouterPlan } from "./router";
import type {
  PeopleAnswerContract,
  PeopleObservedFact,
  PeopleToolCall,
} from "./types";
import {
  composeCompensation,
  composeDefinition,
  composeLocations,
  composeNextSteps,
  composeSkills,
  composeTenure,
  fact,
  formatMetricValue,
  metricVersion,
  num,
  pickNamed,
  tracedFacts,
} from "./compose-playbooks";
import { resolveLlmInvocation } from "./llm-invocation";

function pickMetric(results: unknown[], metricId?: string, jobFamily?: string | null): Record<string, unknown> {
  for (const item of results) {
    const row = asRecord(item);
    if (metricId && row.metric_id !== metricId) continue;
    if (jobFamily && row.job_family && row.job_family !== jobFamily) continue;
    if (row.value != null || row.denied === true) return row;
  }
  return asRecord(results[0]);
}

function healthStatus(results: unknown[], snapshotId: string, metricHealth?: string): string {
  if (snapshotId === "incident_replay") return "blocked";
  const statuses: string[] = [];
  if (metricHealth) statuses.push(metricHealth);
  for (const item of results) {
    const row = asRecord(item);
    if (typeof row.quality_status === "string") statuses.push(row.quality_status);
    if (typeof row.health_status === "string") statuses.push(row.health_status);
  }
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("degraded") || statuses.includes("unhealthy") || statuses.includes("failed")) {
    return statuses.includes("unhealthy") ? "unhealthy" : "degraded";
  }
  if (statuses.includes("healthy")) return "healthy";
  return statuses[0] ?? "healthy";
}

function healthClause(status: string): string | null {
  if (status === "blocked") return "Data health: blocked. This figure is not certified for current reporting.";
  if (status === "degraded" || status === "unhealthy") {
    return `Data health: ${status}. Treat this figure as degraded, not a clean certified read.`;
  }
  return null;
}

export function composeAnswerContract(input: {
  question: string;
  identityId: string;
  traceId: string;
  demoCase?: PeopleDemoCase;
  plan: RouterPlan;
  tools: PeopleToolCall[];
  results: Array<{ call: PeopleToolCall; result: unknown; ok: boolean; error?: string }>;
  hypotheses?: string[];
  llmSkipped?: string | null;
  llmCalls?: number;
  latencyMs?: number;
  toolTrace?: PeopleAnswerContract["trace"]["tools"];
}): Omit<PeopleAnswerContract, "critic"> & { critic?: PeopleAnswerContract["critic"] } {
  const { question, plan, results, identityId, traceId } = input;
  const payloads = results.map((row) => row.result);
  const rpcFailed = results.some((row) => !row.ok);
  const snapshotId = plan.snapshot_id;
  const firstMetric = pickNamed(results, "get_metric");
  const metricHealth = String(firstMetric.quality_status ?? "");
  let quality = healthStatus(payloads, snapshotId, metricHealth);
  const asOf =
    isoDate(firstMetric.as_of) ||
    isoDate(asRecord(pickNamed(results, "get_serving_snapshot").pointer).as_of) ||
    isoDate(asRecord(pickNamed(results, "get_source_health").pointer).as_of) ||
    isoDate(pickNamed(results, "get_skill_coverage").as_of) ||
    "2026-08-31";

  let observedFacts: PeopleObservedFact[] = [];
  let hypotheses: string[] = [];
  let headline = "Serving tools returned structured evidence.";
  let definition: unknown;
  let lineage: unknown;
  let suppressed: PeopleAnswerContract["suppressed_cells"] = [];
  let skillsUsed: string[] = [];

  if (rpcFailed) {
    headline = "People serving could not complete this lookup. No substitute numbers were generated.";
    observedFacts.push(
      fact("A serving RPC failed. The answer is in an error state and does not include invented metric values.", {
        filters: { error: "rpc" },
      }),
    );
    quality = quality === "healthy" ? "unknown" : quality;
  } else if (plan.playbook === "refuse" || plan.tier === "refuse") {
    headline = "I can look that up with governed People tools.";
    observedFacts.push(
      fact(
        plan.refuse_reason === "unsupported_question"
          ? "Ask about a metric value, definition, quality incident, location, tenure, compensation, or skills."
          : "This question is outside the serving agent policy (personal data, suppression bypass, SQL, or platform mutation).",
        { filters: { refuse: plan.refuse_reason ?? "policy" } },
      ),
    );
    quality = "unknown";
  } else if (plan.playbook === "incident" || snapshotId === "incident_replay") {
    const incidentsPayload = pickNamed(results, "get_quality_incidents");
    const list = asList(incidentsPayload.incidents);
    const apac = asRecord(
      list.find((item) => {
        const id = String(item.incident_id ?? "");
        return id.includes("2026-08-14") || id === "people-incident-apac-hris-incomplete";
      }) ?? list[0],
    );
    const details = asRecord(apac.details);
    headline =
      "This is a data issue, not a workforce change. Headcount in this replay is blocked and must not be treated as certified.";
    quality = "blocked";
    observedFacts.push(
      fact(
        `Expected APAC rows: ${String(details.control_total ?? apac.expected_records ?? "see incident")}; received: ${String(details.rows_received ?? apac.actual_records ?? "see incident")}.`,
        { metric_id: metricVersion("headcount"), filters: { snapshot_id: "incident_replay" }, as_of: asOf, source_tool: "get_quality_incidents" },
      ),
    );
    observedFacts.push(
      fact(`Incident business_change=${String(apac.business_change ?? details.business_change ?? false)}.`, {
        filters: { snapshot_id: "incident_replay" },
        source_tool: "get_quality_incidents",
      }),
    );
    observedFacts.push(
      fact("The incomplete extract was not published into the current trusted snapshot.", {
        filters: { snapshot_id: "incident_replay" },
        source_tool: "get_quality_incidents",
      }),
    );
    observedFacts.push(
      fact("You are in incident replay, not the current trusted snapshot. Blocked metrics are not presented as certified.", {
        filters: { snapshot_id: "incident_replay" },
        source_tool: "get_quality_incidents",
      }),
    );
    hypotheses.push("Replay context only: downstream Headcount reporting is blocked until the HRIS feed is complete.");
    lineage = pickNamed(results, "get_lineage").lineage ?? pickNamed(results, "get_source_health");
  } else if (plan.playbook === "definition") {
    const draft = composeDefinition(results, plan.metric_id);
    headline = draft.headline;
    observedFacts = draft.facts;
    hypotheses = draft.hypotheses;
    definition = draft.definition;
  } else if (plan.playbook === "locations") {
    const draft = composeLocations(results, asOf);
    headline = draft.headline;
    observedFacts = draft.facts;
    hypotheses = draft.hypotheses;
    suppressed = draft.suppressed;
  } else if (plan.playbook === "next_steps") {
    const draft = composeNextSteps(results, asOf);
    headline = draft.headline;
    observedFacts = draft.facts;
    hypotheses = draft.hypotheses;
    suppressed = draft.suppressed;
  } else if (plan.playbook === "tenure") {
    const draft = composeTenure(results, asOf);
    headline = draft.headline;
    observedFacts = draft.facts;
    hypotheses = draft.hypotheses;
    suppressed = draft.suppressed;
  } else if (plan.playbook === "compensation") {
    const draft = composeCompensation(results, asOf, identityId);
    headline = draft.headline;
    observedFacts = draft.facts;
    hypotheses = draft.hypotheses;
  } else if (plan.playbook === "skills") {
    const draft = composeSkills(results, asOf);
    headline = draft.headline;
    observedFacts = draft.facts;
    hypotheses = draft.hypotheses;
    skillsUsed = draft.skillsUsed;
  } else if (plan.playbook === "quality" || results.some((row) => row.call.name === "get_quality_tests")) {
    const tests = asList(pickNamed(results, "get_quality_tests").tests);
    headline = "Quality tests and source health are available from the serving layer.";
    observedFacts.push(
      fact(`${tests.length} quality tests are registered for the data-v1 run.`, {
        filters: { run_id: "data-v1" },
        source_tool: "get_quality_tests",
      }),
    );
    observedFacts.push(
      fact("Current published metrics remain trusted; the APAC volume test belongs to incident replay.", {
        filters: {},
        source_tool: "get_quality_tests",
      }),
    );
  } else if (plan.playbook === "attrition_explore") {
    const eng = pickMetric(
      results.filter((row) => row.call.name === "get_metric").map((row) => row.result),
      plan.metric_id ?? "voluntary_attrition_rate",
      plan.job_family ?? "Engineering",
    );
    const breakdown = pickNamed(results, "get_metric_breakdown");
    const cells = asList(breakdown.cells);
    for (const cell of cells) {
      if (cell.suppressed === true) {
        suppressed.push({
          dimension: String(breakdown.dimension ?? "location_tenure_grade"),
          key: String(cell.key ?? ""),
          n: num(cell.n),
          min_cell: num(breakdown.min_cell) ?? undefined,
        });
      }
    }
    const where = concentrationLocationFromVisible(cells) ?? "a small set of locations";
    const engValue = num(eng.value);
    headline = attritionHeadline({
      t12m: engValue,
      rate: engValue,
      where,
      asOf: isoDate(eng.as_of) || asOf,
    });
    const healthNote = healthClause(quality);
    if (healthNote) headline = `${headline} ${healthNote}`;
    const engAsOf = isoDate(eng.as_of) || asOf;
    const grain = grainFields({
      metricId: String(eng.metric_id ?? plan.metric_id ?? "voluntary_attrition_rate"),
      scope: String(plan.job_family ?? "Engineering"),
      window: "trailing-12m (annualized)",
      asOf: engAsOf,
      annualized: true,
    });
    observedFacts.push(
      fact(`Engineering trailing-12m voluntary attrition: ${formatMetricValue(eng)} as of ${engAsOf}.`, {
        source_tool: "get_metric",
        metric_id: metricVersion(String(eng.metric_id ?? "voluntary_attrition_rate")),
        filters: { job_family: plan.job_family ?? "Engineering", grain: "trailing_12m" },
        value: engValue,
        unit: String(eng.unit ?? "rate"),
        as_of: grain.as_of,
        asOf: grain.asOf,
        grain: grain.window,
        denied: eng.denied === true,
      }),
    );
    observedFacts.push(
      fact(`${suppressed.length} cells suppressed at min_cell ${String(breakdown.min_cell ?? 50)} (n is as-of month headcount).`, {
        source_tool: "get_metric_breakdown",
        filters: { dimension: String(breakdown.dimension ?? ""), min_cell: num(breakdown.min_cell) },
      }),
    );
    const skills = pickNamed(results, "get_skill_coverage");
    const skillRows = asList(skills.rows);
    if (skillRows[0] && num(skillRows[0].coverage_ratio) != null) {
      skillsUsed.push("get_skill_coverage");
      observedFacts.push(
        fact(`Engineering skill coverage (job-family aggregate): ${formatRateSafe(skillRows[0].coverage_ratio)}.`, {
          source_tool: "get_skill_coverage",
          metric_id: metricVersion("skill_coverage"),
          filters: { job_family: "Engineering" },
          value: num(skillRows[0].coverage_ratio),
          unit: "rate",
        }),
      );
    }
    hypotheses.push("Location, tenure, and level concentrations are observed associations. They do not by themselves prove a cause.");
    hypotheses.push("Investigate the highest-rate visible Engineering slices before a company-wide program.");
  } else {
    const metric = pickNamed(results, "get_metric");
    const def = pickNamed(results, "get_metric_definition");
    definition = Object.keys(def).length ? def : undefined;
    const label = plan.job_family ? `${plan.job_family} ` : "";
    const metricId = String(metric.metric_id ?? plan.metric_id ?? "metric");
    headline = `${label}${metricId.replaceAll("_", " ")} is ${formatMetricValue(metric)}.`;
    const healthNote = healthClause(quality);
    if (healthNote) headline = `${headline} ${healthNote}`;
    const metricAsOf = isoDate(metric.as_of) || asOf;
    observedFacts.push(
      fact(`Certified calculator: ${formatMetricValue(metric)} as of ${metricAsOf || "latest month"}.`, {
        source_tool: "get_metric",
        metric_id: metricVersion(metricId),
        filters: { job_family: plan.job_family ?? null, grain: String(metric.window ?? plan.filters.grain ?? "") },
        value: metric.denied === true ? null : num(metric.value),
        unit: String(metric.unit ?? ""),
        as_of: metricAsOf,
        asOf: metricAsOf,
        denied: metric.denied === true,
      }),
    );
    if (quality === "healthy" && snapshotId === "current_certified") {
      hypotheses.push(
        "This is the latest certified month-end snapshot. The APAC extract failure is a separate historical replay and was not published as a workforce change.",
      );
    } else {
      hypotheses.push("This figure is not treated as trusted business data in the selected snapshot.");
    }
  }

  observedFacts = tracedFacts(observedFacts, results);
  const chipBooks = new Set([
    "locations",
    "next_steps",
    "tenure",
    "compensation",
    "skills",
    "definition",
  ]);
  if (chipBooks.has(plan.playbook)) {
    observedFacts = observedFacts.filter((item) => Boolean(item.source_tool));
  }

  const skeletonHypotheses = [...hypotheses];
  const allowLlmHypotheses = plan.playbook === "attrition_explore" && Boolean(input.hypotheses?.length);
  const allowedDigits = new Set(numbersInObserved(headline, observedFacts));
  const candidate = allowLlmHypotheses ? input.hypotheses ?? skeletonHypotheses : skeletonHypotheses;
  const safeHypotheses = candidate.filter((line) =>
    numbersInText(line).every((digit) => allowedDigits.has(digit)),
  );
  const finalHypotheses = safeHypotheses.length ? safeHypotheses : skeletonHypotheses;
  const llm = resolveLlmInvocation({
    llmEligible: plan.llmEligible,
    llmCalls: input.llmCalls ?? 0,
    llmSkipped: input.llmSkipped ?? null,
  });

  return {
    question,
    supported: plan.tier !== "refuse" && !rpcFailed,
    headline,
    facts: observedFacts.map((item) => item.text),
    interpretation: finalHypotheses,
    quality_status: quality,
    freshness: null,
    definition,
    evidence: payloads,
    lineage,
    tools_used: input.tools.map((tool) => tool.name),
    trace_id: traceId,
    tier: plan.tier,
    identity_id: identityId,
    snapshot: {
      pointer_id: snapshotId,
      run_id: "data-v1",
      as_of: asOf,
    },
    observed: { headline, facts: observedFacts },
    hypotheses: finalHypotheses,
    suppressed_cells: suppressed,
    skills_used: skillsUsed,
    error_state: rpcFailed ? "rpc" : null,
    withheld: false,
    llm_skipped: llm.llm_skipped,
    llm_invocation: llm.llm_invocation,
    failure_reason: llm.failure_reason,
    trace: {
      tools: input.toolTrace ?? [],
      latency_ms: input.latencyMs ?? 0,
      llm_skipped: llm.llm_skipped,
      llm_calls: llm.llm_calls,
      llm_used: llm.llm_used,
      llm_invocation: llm.llm_invocation,
      failure_reason: llm.failure_reason,
    },
  };
}

function formatRateSafe(value: unknown): string {
  const n = num(value);
  if (n == null) return "unavailable";
  return `${(n * 100).toFixed(1)}%`;
}

function numbersInText(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

function numbersInObserved(headline: string, facts: PeopleObservedFact[]): Set<string> {
  const set = new Set<string>();
  for (const token of numbersInText(headline)) set.add(token);
  for (const item of facts) {
    for (const token of numbersInText(item.text)) set.add(token);
    if (item.value != null) {
      for (const token of numbersInText(String(item.value)) ) set.add(token);
      for (const token of numbersInText((item.value * 100).toFixed(1))) set.add(token);
    }
  }
  return set;
}

export { healthStatus };
