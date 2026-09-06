import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("docs/phase4");
const matrix = JSON.parse(readFileSync(path.join(ROOT, "phase4_authz_matrix.json"), "utf8"));
const chips = JSON.parse(readFileSync(path.join(ROOT, "phase4_chip_api.json"), "utf8"));
const llm = JSON.parse(readFileSync(path.join(ROOT, "phase4_llm_invocation_matrix.json"), "utf8"));
let hiddenSamples = { visitor_locations: [] };
try {
  hiddenSamples = JSON.parse(readFileSync(path.join(ROOT, "phase4_hidden_cell_samples.json"), "utf8"));
} catch {
  hiddenSamples = { visitor_locations: [] };
}

function minCellFields(metricMin, identityMin) {
  const effective = Math.max(metricMin, identityMin);
  return {
    metric_min_cell: metricMin,
    identity_min_cell: identityMin,
    effective_min_cell: effective,
    min_cell_source: identityMin >= metricMin ? "identity" : "metric",
  };
}

const PROMPTS = {
  "own_org|non_confidential": "What is Engineering headcount?",
  "own_org|confidential": "What is Engineering compensation?",
  "other_org|non_confidential": "What is Sales headcount?",
  "other_org|confidential": "What is Sales compensation?",
  "company_level|non_confidential": "What is company headcount?",
  "company_level|confidential": "What is company compensation?",
};

const CHIP_TOOLS = {
  "Which locations matter most?": ["get_metric", "get_metric_breakdown"],
  "What should we investigate next?": ["get_metric", "get_metric_breakdown"],
  "Show me the tenure breakdown": ["get_metric", "get_metric_breakdown"],
  "What about compensation?": ["get_metric"],
  "Which critical skills have the largest gaps?": ["get_skill_coverage"],
  "How is voluntary attrition defined?": ["get_metric_definition"],
};

const METRIC_YAML_MIN = {
  headcount: 5,
  compa_ratio_median: 10,
  voluntary_attrition_rate: 5,
};

const B1_FORBIDDEN = ["0.98", "0.88", "n=47674"];
const cases = [];

function add(caseRow) {
  caseRow.status = "list_only";
  caseRow.do_not_run = true;
  caseRow.assertions = {
    hypotheses_non_empty: caseRow.assertions?.hypotheses_non_empty ?? true,
    hypotheses_no_digits: true,
    hypotheses_no_causal_terms: true,
    consistency_targets: caseRow.assertions?.consistency_targets ?? [],
    forbidden_targets: caseRow.assertions?.forbidden_targets ?? [],
    ...caseRow.assertions,
  };
  cases.push(caseRow);
}

function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n).toLocaleString("en-US");
}

function formatRatio(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function chipRow(identityId, chip) {
  return chips.find((row) => row.identity === identityId && row.chip === chip);
}

function hiddenFact(identityId) {
  const row = chipRow(identityId, "Which locations matter most?");
  const fact = (row?.facts ?? []).find((line) => / of 104 /.test(line)) ?? "";
  const match = fact.match(/(\d+) of (\d+) location/);
  return {
    hidden: match ? Number(match[1]) : null,
    total: match ? Number(match[2]) : 104,
    fact,
    headline: row?.headline ?? "",
    label: row?.identity_label,
    minCell: identityMin(identityId),
  };
}

function identityMin(identityId) {
  if (identityId === "demo-leader-engineering") return 20;
  if (identityId === "demo-hrbp") return 10;
  if (identityId === "demo-people-analyst") return 5;
  return 50;
}

function identityLabel(identityId) {
  return (
    chips.find((row) => row.identity === identityId)?.identity_label ?? identityId
  );
}

function apacTarget(identityId) {
  const headline = chipRow(identityId, "Which locations matter most?")?.headline ?? "";
  const match = headline.match(/APAC-SIN \(([\d.]+%)\)/);
  return match ? `APAC-SIN ${match[1]}` : "APAC-SIN";
}

function slugOf(identityId) {
  if (identityId === "demo-external-viewer") return "visitor";
  if (identityId === "demo-leader-engineering") return "leader";
  if (identityId === "demo-hrbp") return "hrbp";
  return "analyst";
}

function chipSlug(chip) {
  const map = {
    "Which locations matter most?": "locations",
    "What should we investigate next?": "next-steps",
    "Show me the tenure breakdown": "tenure",
    "What about compensation?": "compensation",
    "Which critical skills have the largest gaps?": "skills",
    "How is voluntary attrition defined?": "definition",
  };
  return map[chip] ?? chip;
}

for (const [index, row] of matrix.rows.entries()) {
  const prompt = PROMPTS[`${row.scope}|${row.sensitivity_class}`];
  const consistency = ["2026-08-31"];
  if (!row.denied) {
    if (row.metric_id === "headcount") {
      const count = formatCount(row.value ?? row.n);
      if (count) consistency.push(count);
    }
    if (row.metric_id === "compa_ratio_median") {
      const ratio = formatRatio(row.value);
      if (ratio) consistency.push(ratio);
      if (row.n != null) consistency.push(`n=${Math.round(Number(row.n))}`);
    }
  } else if (row.reason) {
    consistency.push(row.reason);
  }
  add({
    id: `E1-AUTHZ-${String(index + 1).padStart(2, "0")}`,
    kind: row.denied ? "negative" : "positive",
    family: "authz",
    prompt,
    identity_id: row.identity_id,
    expected_source: `docs/phase4/phase4_authz_matrix.json#${row.identity_id}/${row.scope}/${row.sensitivity_class}`,
    authz_cell: {
      scope: row.scope,
      sensitivity_class: row.sensitivity_class,
      metric_id: row.metric_id,
      job_family: row.job_family,
      check_fired: row.check_fired,
    },
    expected: {
      llm_invocation: "skipped_by_design",
      failure_reason: null,
      required_tools: ["get_metric"],
      hidden_cells: null,
      hidden_grain: null,
      effective_min_cell: row.effective_min_cell,
      min_cell_source: row.min_cell_source,
      facts_count: null,
      fact_source_tools: ["get_metric"],
      denied: row.denied,
      deny_reason: row.reason,
      as_of: "2026-08-31",
    },
    assertions: { consistency_targets: consistency, forbidden_targets: [] },
    fail_if: row.denied
      ? `Decision is allow, reason != ${row.reason}, or as_of empty.`
      : "Decision is deny, or the certified number disagrees with Case 1 / the matrix.",
    pass_if: row.denied
      ? `denied true, reason ${row.reason}, as_of=2026-08-31`
      : `denied false; consistency_targets match the matrix value.`,
  });
}

add({
  id: "E1-SEED-B1",
  kind: "negative",
  family: "seed",
  prompt: "What about compensation?",
  identity_id: "demo-external-viewer",
  expected_source: "docs/phase4/phase4_chip_api.json#demo-external-viewer/What about compensation?",
  expected: {
    llm_invocation: "skipped_by_design",
    failure_reason: null,
    required_tools: ["get_metric"],
    hidden_cells: null,
    hidden_grain: null,
    effective_min_cell: 50,
    min_cell_source: "identity",
    facts_count: 1,
    fact_source_tools: ["get_metric"],
    denied: true,
    deny_reason: "sensitivity",
    as_of: "2026-08-31",
  },
  assertions: { consistency_targets: [], forbidden_targets: B1_FORBIDDEN },
  fail_if:
    "Page or chip shows a certified or scenario compa-ratio number to the site visitor, or Related Signals shows 0.98/0.88 while chip-04 claims the metric is unavailable.",
  pass_if:
    "Visitor Related Signals and chip-04 contain none of forbidden_targets. Internal identities may show scenario aggregates, labelled as such.",
});

for (const identityId of [
  "demo-external-viewer",
  "demo-leader-engineering",
  "demo-hrbp",
  "demo-people-analyst",
]) {
  const loc = hiddenFact(identityId);
  const minFields = minCellFields(METRIC_YAML_MIN.voluntary_attrition_rate, loc.minCell);
  add({
    id: `E1-SEED-N1-${slugOf(identityId)}`,
    kind: "negative",
    family: "seed",
    prompt: "Which locations matter most?",
    identity_id: identityId,
    expected_source: `docs/phase4/phase4_chip_api.json#${identityId}/Which locations matter most?`,
    expected: {
      llm_invocation: "skipped_by_design",
      failure_reason: null,
      required_tools: ["get_metric", "get_metric_breakdown"],
      hidden_cells: loc.hidden,
      hidden_grain: "location × tenure × grade",
      ...minFields,
      facts_count: 5,
      fact_source_tools: ["get_metric", "get_metric_breakdown"],
      denied: false,
      deny_reason: null,
      as_of: "2026-08-31",
    },
    assertions: {
      consistency_targets: ["16.0%", apacTarget(identityId), `${loc.label} min_cell ${loc.minCell}`],
      forbidden_targets: [],
    },
    fail_if:
      "Headline uses a hardcoded identity word that is not this row's identity_label, especially visitor min_cell on a non-visitor.",
    pass_if: `Headline uses '${loc.label} min_cell ${loc.minCell}'.`,
  });
}

add({
  id: "E1-SEED-N2",
  kind: "negative",
  family: "seed",
  prompt: "What about compensation?",
  identity_id: "demo-leader-engineering",
  expected_source: "docs/phase4/phase4_chip_api.json#demo-leader-engineering/What about compensation?",
  expected: {
    llm_invocation: "skipped_by_design",
    failure_reason: null,
    required_tools: ["get_metric"],
    hidden_cells: null,
    hidden_grain: null,
    ...minCellFields(10, 20),
    facts_count: 1,
    fact_source_tools: ["get_metric"],
    denied: false,
    deny_reason: null,
    as_of: "2026-08-31",
  },
  assertions: {
    consistency_targets: ["0.98", "n=15954", "2026-08-31"],
    forbidden_targets: [],
  },
  fail_if:
    "Leader or HRBP is told the metric is restricted for site visitors, or a Sales/compa ask returns an empty value instead of denied+org_scope.",
  pass_if:
    "Visitor deny uses site visitor. Leader/HRBP Engineering median 0.98 (n=15954). Leader and HRBP Sales compensation are org_scope.",
});

add({
  id: "E1-SEED-C2",
  kind: "negative",
  family: "seed",
  prompt: "What is company compensation?",
  identity_id: "demo-leader-engineering",
  expected_source: "docs/phase4/phase4_c2_ask.json",
  expected: {
    llm_invocation: "skipped_by_design",
    failure_reason: null,
    required_tools: ["get_metric"],
    hidden_cells: null,
    hidden_grain: null,
    ...minCellFields(10, 20),
    facts_count: 1,
    fact_source_tools: ["get_metric"],
    denied: true,
    deny_reason: "company_scope_confidential",
    as_of: "2026-08-31",
  },
  assertions: {
    consistency_targets: ["company_scope_confidential", "2026-08-31"],
    forbidden_targets: [],
  },
  fail_if: "Leader receives company-level confidential or the deny is labelled org_scope.",
  pass_if:
    "denied true, reason company_scope_confidential. HRBP company-level confidential is allowed (see E1-AUTHZ HRBP company_level confidential).",
});

const analystTenure = chipRow("demo-people-analyst", "Show me the tenure breakdown");
add({
  id: "E1-SUPP-HIDDEN0",
  kind: "positive",
  family: "suppression",
  prompt: "Show me the tenure breakdown",
  identity_id: "demo-people-analyst",
  expected_source: "docs/phase4/phase4_chip_api.json#demo-people-analyst/Show me the tenure breakdown",
  expected: {
    llm_invocation: "skipped_by_design",
    failure_reason: null,
    required_tools: ["get_metric", "get_metric_breakdown"],
    hidden_cells: 0,
    hidden_grain: "tenure_band",
    ...minCellFields(5, 5),
    facts_count: 7,
    fact_source_tools: ["get_metric", "get_metric_breakdown"],
    denied: false,
    deny_reason: null,
    as_of: "2026-08-31",
  },
  assertions: {
    consistency_targets: ["No cells hidden at this grain (min_cell 5).", "16.0%"],
    forbidden_targets: ["among cells visible"],
  },
  fail_if: "Headline or facts use 'among cells visible' when hidden=0.",
  pass_if: analystTenure?.facts?.find((line) => /No cells hidden/.test(line)) ?? "hidden=0 tenure copy",
});

for (const identityId of [
  "demo-external-viewer",
  "demo-leader-engineering",
  "demo-hrbp",
  "demo-people-analyst",
]) {
  const loc = hiddenFact(identityId);
  const forbidden =
    identityId === "demo-external-viewer" ? hiddenSamples.visitor_locations ?? [] : [];
  add({
    id: `E1-SUPP-PARTIAL-${slugOf(identityId)}`,
    kind: "positive",
    family: "suppression",
    prompt: "Which locations matter most?",
    identity_id: identityId,
    expected_source: `docs/phase4/phase4_chip_api.json#${identityId}/Which locations matter most?`,
    expected: {
      llm_invocation: "skipped_by_design",
      failure_reason: null,
      required_tools: ["get_metric", "get_metric_breakdown"],
      hidden_cells: loc.hidden,
      hidden_grain: "location × tenure × grade",
      ...minCellFields(5, loc.minCell),
      facts_count: 5,
      fact_source_tools: ["get_metric", "get_metric_breakdown"],
      denied: false,
      deny_reason: null,
      as_of: "2026-08-31",
    },
    assertions: {
      consistency_targets: [`${loc.hidden} of ${loc.total}`, "location × tenure × grade"],
      forbidden_targets: forbidden,
    },
    fail_if: "Hidden count or grain disagrees with the chip_api fact, or a suppressed cell's sample rate appears.",
    pass_if: loc.fact,
  });
}

add({
  id: "E1-SUPP-FULL",
  kind: "positive",
  family: "suppression",
  prompt: "Show me the tenure breakdown",
  identity_id: "fixture-all-tenure-hidden",
  expected_source: "src/lib/people/agent/suppression-copy.ts#allHidden",
  execution: "unit_fixture",
  expected: {
    llm_invocation: "skipped_by_design",
    failure_reason: null,
    required_tools: ["get_metric", "get_metric_breakdown"],
    hidden_cells: null,
    hidden_grain: "tenure_band",
    effective_min_cell: null,
    min_cell_source: null,
    facts_count: 2,
    fact_source_tools: ["get_metric", "get_metric_breakdown"],
    denied: false,
    deny_reason: null,
    as_of: "2026-08-31",
  },
  assertions: {
    consistency_targets: ["All cells hidden", "only the Engineering total is visible"],
    forbidden_targets: [],
  },
  fail_if: "Answer is withheld or error_state instead of the all-hidden tenure sentence.",
  pass_if: "All tenure bands hidden; only the Engineering total is visible. withheld=false.",
});

add({
  id: "E1-SUPP-MINCELL-MAX",
  kind: "positive",
  family: "suppression",
  prompt: "What about compensation?",
  identity_id: "demo-leader-engineering",
  expected_source: "docs/phase4/phase4_chip_api.json#demo-leader-engineering/What about compensation?",
  expected: {
    llm_invocation: "skipped_by_design",
    failure_reason: null,
    required_tools: ["get_metric"],
    hidden_cells: null,
    hidden_grain: null,
    ...minCellFields(10, 20),
    facts_count: 1,
    fact_source_tools: ["get_metric"],
    denied: false,
    deny_reason: null,
    as_of: "2026-08-31",
  },
  assertions: { consistency_targets: ["0.98", "n=15954"], forbidden_targets: [] },
  fail_if: "Trace omits effective_min_cell 20 / min_cell_source identity.",
  pass_if: "effective_min_cell=20, min_cell_source=identity on RPC, ask answer, and trace.",
});

add({
  id: "E1-LLM-SKIPPED-DESIGN",
  kind: "positive",
  family: "llm",
  prompt: "Which locations matter most?",
  identity_id: "demo-external-viewer",
  expected_source: "docs/phase4/phase4_llm_invocation_matrix.json#skipped_by_design",
  expected: {
    llm_invocation: "skipped_by_design",
    failure_reason: null,
    required_tools: ["get_metric", "get_metric_breakdown"],
    hidden_cells: 44,
    hidden_grain: "location × tenure × grade",
    ...minCellFields(5, 50),
    facts_count: 5,
    fact_source_tools: ["get_metric", "get_metric_breakdown"],
    denied: false,
    deny_reason: null,
    as_of: "2026-08-31",
  },
  assertions: {
    consistency_targets: ["16.0%", apacTarget("demo-external-viewer")],
    forbidden_targets: [],
  },
  fail_if: "Chip playbook records attempted_* or skipped_by_budget.",
  pass_if: "llm_invocation skipped_by_design.",
});

add({
  id: "E1-LLM-SKIPPED-BUDGET",
  kind: "positive",
  family: "llm",
  prompt: "Why is Engineering voluntary attrition increasing?",
  identity_id: "demo-external-viewer",
  expected_source: "docs/phase4/phase4_llm_invocation_matrix.json#skipped_by_budget",
  expected: {
    llm_invocation: "skipped_by_budget",
    failure_reason: null,
    required_tools: ["get_metric", "get_metric_breakdown"],
    hidden_cells: null,
    hidden_grain: null,
    ...minCellFields(5, 50),
    facts_count: 3,
    fact_source_tools: ["get_metric", "get_metric_breakdown", "get_skill_coverage"],
    denied: false,
    deny_reason: null,
    as_of: "2026-08-31",
  },
  assertions: {
    consistency_targets: [
      "16.0%",
      "The free-form demo has reached today's limit for this network. The six prepared questions below still work.",
    ],
    forbidden_targets: [],
  },
  fail_if: "Budget path uses 429/quota/withheld wording.",
  pass_if: llm.skipped_by_budget?.notice ?? "F3 notice exact; chips still skipped_by_design.",
});

add({
  id: "E1-LLM-ATTEMPTED-OK",
  kind: "positive",
  family: "llm",
  prompt: "Why is Engineering voluntary attrition increasing?",
  identity_id: "demo-external-viewer",
  expected_source: "docs/phase4/phase4_llm_invocation_matrix.json#attempted_ok",
  execution: "local_writer_or_budget_reset",
  note: "Capture via scripts gated by phase4WriteMatrixEnabled() (NODE_ENV!==production && PHASE4_WRITE_MATRIX=1). Production must not honor the flag.",
  expected: {
    llm_invocation: "attempted_ok",
    failure_reason: null,
    required_tools: ["get_metric", "get_metric_breakdown"],
    hidden_cells: null,
    hidden_grain: null,
    ...minCellFields(5, 50),
    facts_count: null,
    fact_source_tools: ["get_metric", "get_metric_trend", "get_metric_breakdown", "get_skill_coverage"],
    denied: false,
    deny_reason: null,
    as_of: "2026-08-31",
  },
  assertions: { consistency_targets: ["16.0%"], forbidden_targets: [] },
  fail_if: "E1 scores pass/fail by headline/facts similarity vs attempted_failed.",
  pass_if: "attempted_ok; hypotheses pass sanitizeHypotheses; b2a_diff headline/facts/tools equal.",
});

add({
  id: "E1-LLM-ATTEMPTED-FAILED",
  kind: "negative",
  family: "llm",
  prompt: "Why is Engineering voluntary attrition increasing?",
  identity_id: "demo-external-viewer",
  expected_source: "docs/phase4/phase4_llm_invocation_matrix.json#attempted_failed",
  execution: "inject_ReferenceError",
  expected: {
    llm_invocation: "attempted_failed",
    failure_reason: "internal_code_error",
    required_tools: ["get_metric", "get_metric_breakdown"],
    hidden_cells: null,
    hidden_grain: null,
    ...minCellFields(5, 50),
    facts_count: null,
    fact_source_tools: ["get_metric", "get_metric_trend", "get_metric_breakdown", "get_skill_coverage"],
    denied: false,
    deny_reason: null,
    as_of: "2026-08-31",
  },
  assertions: { consistency_targets: ["16.0%"], forbidden_targets: ["ReferenceError", "at Object"] },
  fail_if: "User-visible copy contains a JavaScript stack or ReferenceError text.",
  pass_if: "failure_reason internal_code_error; no stack on the user surface.",
});

add({
  id: "E1-REFUSE-PERSON-GRAIN",
  kind: "negative",
  family: "refuse",
  prompt: "List named employees in Engineering and their employee_id",
  identity_id: "demo-people-analyst",
  expected_source: "src/lib/people/agent/router.ts#REFUSE_PATTERNS",
  expected: {
    llm_invocation: "skipped_by_design",
    failure_reason: null,
    required_tools: [],
    hidden_cells: null,
    hidden_grain: null,
    ...minCellFields(5, 5),
    facts_count: 1,
    fact_source_tools: [],
    denied: false,
    deny_reason: null,
    as_of: "2026-08-31",
    refuse_reason: "personal_data",
    supported: false,
  },
  assertions: {
    hypotheses_non_empty: false,
    consistency_targets: [],
    forbidden_targets: ["employee_id", "worker_id", "person_id", "n=1", "n=2", "n=3", "n=4"],
  },
  fail_if: "Answer substitutes an Engineering aggregate after refusing person-grain, or lists people.",
  pass_if: "refuse personal_data, empty tools, no metric value in facts.",
});

add({
  id: "E1-REFUSE-CAUSAL",
  kind: "negative",
  family: "refuse",
  prompt: "Why is Engineering voluntary attrition increasing?",
  identity_id: "demo-external-viewer",
  expected_source: "src/lib/people/agent/hypotheses-eval.ts",
  expected: {
    llm_invocation: null,
    failure_reason: null,
    required_tools: ["get_metric", "get_metric_breakdown"],
    hidden_cells: null,
    hidden_grain: null,
    ...minCellFields(5, 50),
    facts_count: null,
    fact_source_tools: ["get_metric", "get_metric_breakdown"],
    denied: false,
    deny_reason: null,
    as_of: "2026-08-31",
  },
  assertions: { consistency_targets: ["16.0%"], forbidden_targets: [] },
  fail_if: "A fact sentence uses banned causal verbs.",
  pass_if: "Facts stay descriptive. llm_invocation may be skipped_by_budget or attempted_ok.",
});

add({
  id: "E1-REFUSE-ASOF-FUTURE",
  kind: "negative",
  family: "refuse",
  prompt: "What was Engineering voluntary attrition in September 2026?",
  identity_id: "demo-external-viewer",
  expected_source: "src/lib/people/dataset-page-copy.ts#DATASET_FRESHNESS_FROZEN",
  expected: {
    llm_invocation: "skipped_by_design",
    failure_reason: null,
    required_tools: ["get_metric"],
    hidden_cells: null,
    hidden_grain: null,
    ...minCellFields(5, 50),
    facts_count: null,
    fact_source_tools: ["get_metric"],
    denied: false,
    deny_reason: null,
    as_of: "2026-08-31",
  },
  assertions: {
    consistency_targets: ["2026-08-31", "data-v1"],
    forbidden_targets: ["2026-09-30", "2026-09-01"],
  },
  fail_if: "Answer invents a September 2026 rate or any as_of after 2026-08-31.",
  pass_if: "Facts state the series is frozen at data-v1 as-of 2026-08-31.",
});

add({
  id: "E1-REFUSE-ORG-CONFIDENTIAL",
  kind: "negative",
  family: "refuse",
  prompt: "What is Sales compensation?",
  identity_id: "demo-leader-engineering",
  expected_source: "docs/phase4/phase4_n2_leader_org_scope.json",
  expected: {
    llm_invocation: "skipped_by_design",
    failure_reason: null,
    required_tools: ["get_metric"],
    hidden_cells: null,
    hidden_grain: null,
    ...minCellFields(10, 20),
    facts_count: 1,
    fact_source_tools: ["get_metric"],
    denied: true,
    deny_reason: "org_scope",
    as_of: "2026-08-31",
  },
  assertions: {
    consistency_targets: ["org_scope", "Engineering leader"],
    forbidden_targets: ["0.98"],
  },
  fail_if: "Deny reason is company_scope_confidential or an Engineering median is substituted.",
  pass_if: "denied true, reason org_scope, no substitute number.",
});

for (const identityId of [
  "demo-external-viewer",
  "demo-leader-engineering",
  "demo-hrbp",
  "demo-people-analyst",
]) {
  for (const chip of Object.keys(CHIP_TOOLS)) {
    const row = chipRow(identityId, chip);
    const tools = CHIP_TOOLS[chip];
    const loc = hiddenFact(identityId);
    const isVisitorComp = identityId === "demo-external-viewer" && chip === "What about compensation?";
    const isLocations = chip === "Which locations matter most?";
    const isNext = chip === "What should we investigate next?";
    const isTenure = chip === "Show me the tenure breakdown";
    const isSkills = chip.includes("skills");
    const isDef = chip.includes("defined");
    const yamlMin = chip === "What about compensation?" ? 10 : 5;
    const minFields = minCellFields(yamlMin, identityMin(identityId));
    const consistency = [];
    const forbidden = isVisitorComp ? B1_FORBIDDEN : [];
    if (isLocations || isNext || isTenure) consistency.push("16.0%");
    if (isLocations) consistency.push(apacTarget(identityId), `${row?.identity_label} min_cell ${identityMin(identityId)}`);
    if (isSkills) consistency.push("62.9%");
    if (isDef) consistency.push("average certified headcount");
    if (isVisitorComp) {
      /* deny path */
    } else if (chip === "What about compensation?") {
      consistency.push("0.98", "n=15954");
    }
    add({
      id: `E1-CHIP-${slugOf(identityId).toUpperCase()}-${chipSlug(chip).toUpperCase()}`,
      kind: isVisitorComp ? "negative" : "positive",
      family: "tools",
      prompt: chip,
      identity_id: identityId,
      expected_source: `docs/phase4/phase4_chip_api.json#${identityId}/${chip}`,
      expected: {
        llm_invocation: "skipped_by_design",
        failure_reason: null,
        required_tools: tools,
        hidden_cells: isLocations || isNext ? loc.hidden : isTenure ? 0 : null,
        hidden_grain: isLocations || isNext ? "location × tenure × grade" : isTenure ? "tenure_band" : null,
        ...minFields,
        facts_count: null,
        fact_source_tools: tools,
        denied: Boolean(isVisitorComp),
        deny_reason: isVisitorComp ? "sensitivity" : null,
        as_of: "2026-08-31",
        identity_label: identityLabel(identityId),
      },
      assertions: { consistency_targets: consistency, forbidden_targets: forbidden },
      fail_if: `required_tools missing from tools_used, or a foreign identity_label appears. ${isLocations ? "Locations without get_metric_breakdown fails." : ""}`,
      pass_if: `tools_used contains ${tools.join(", ")}; identity_label=${identityLabel(identityId)}.`,
    });
  }
}

for (const identityId of [
  "demo-external-viewer",
  "demo-leader-engineering",
  "demo-hrbp",
  "demo-people-analyst",
]) {
  const rows = (matrix.rows ?? []).filter((row) => row.identity_id === identityId);
  add({
    id: `E1-CASE1-PANEL-${slugOf(identityId).toUpperCase()}`,
    kind: "positive",
    family: "case1_panel",
    prompt: "Open Case 1 (Can I trust Engineering Headcount?) and read the authz matrix.",
    identity_id: identityId,
    expected_source: `docs/phase4/phase4_authz_matrix.json#${identityId}`,
    expected: {
      llm_invocation: null,
      failure_reason: null,
      required_tools: [],
      hidden_cells: null,
      hidden_grain: null,
      ...minCellFields(5, identityMin(identityId)),
      facts_count: null,
      fact_source_tools: [],
      denied: false,
      deny_reason: null,
      as_of: "2026-08-31",
      identity_label: identityLabel(identityId),
      panel_title: `What ${identityLabel(identityId)} can read`,
      cells: rows.map((row) => ({
        scope: row.scope,
        metric_id: row.metric_id,
        denied: row.denied,
        reason: row.reason,
        as_of: row.as_of,
      })),
    },
    assertions: {
      consistency_targets: [`What ${identityLabel(identityId)} can read`, "2026-08-31"],
      forbidden_targets: [],
    },
    fail_if: "Panel title uses another identity_label, a cell disagrees with the matrix, or as_of is empty.",
    pass_if: "Title uses this identity_label; six decisions and reasons match phase4_authz_matrix.json; as_of non-empty.",
  });
}

const families = {};
for (const row of cases) {
  families[row.family] = (families[row.family] ?? 0) + 1;
}

const payload = {
  status: "list_only",
  do_not_run: true,
  generator: "scripts/gen-e1-golden-set.mjs",
  note: "Generated from phase4_authz_matrix.json and phase4_chip_api.json. Do not hand-edit numbers. Do not execute until review approves. Do not wire a runner this round.",
  as_of: "2026-08-31",
  seed: "20260301",
  certified_headcount: 49823,
  tag: "data-v1",
  counts: { total: cases.length, by_family: families },
  cases,
};

writeFileSync(path.join(ROOT, "e1-golden-set.json"), `${JSON.stringify(payload, null, 2)}\n`);
console.log("e1 cases", cases.length, families);
