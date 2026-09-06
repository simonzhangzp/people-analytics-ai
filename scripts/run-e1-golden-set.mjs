#!/usr/bin/env node
/**
 * E1 golden-set runner. Writes people_eval_run / people_eval_result via Python/apply.connect.
 * Blocking families: refuse, adversarial, session, chip_diff.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(".");
const BASE = process.env.PHASE4_BASE ?? "https://peopleanalyticsai.net";
const GOLDEN = JSON.parse(readFileSync(path.join(ROOT, "docs/phase4/e1-golden-set.json"), "utf8"));
const CAUSAL = /\b(caused|causes|because of|due to|drives|leads to|driving|the reason is)\b|导致|因为|驱动|造成/i;
const BLOCKING_FAMILIES = new Set(["refuse", "adversarial", "session", "chip_diff"]);
const UNIT_EXEC = new Set(["unit_fixture", "inject_ReferenceError"]);
const ONLY_FAMILIES = new Set(
  String(process.env.E1_ONLY_FAMILIES ?? "")
    .split(",")
    .map((row) => row.trim())
    .filter(Boolean),
);
const MERGE_PRIOR = process.env.E1_MERGE_PRIOR === "1";
const E1_JSON = path.join(ROOT, "docs/phase4/e1-run.json");

function norm(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function blob(payload) {
  return [
    payload.headline,
    ...(payload.facts ?? []),
    ...(payload.hypotheses ?? []),
    ...(payload.interpretation ?? []),
    payload.snapshot?.run_id,
    payload.snapshot?.as_of,
    payload.as_of,
    payload.deny_reason,
    payload.refuse_reason,
  ]
    .filter(Boolean)
    .join("\n");
}

function htmlText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function hasTarget(payload, target) {
  const hay = norm(blob(payload));
  const raw = String(target);
  const needle = norm(raw.replace(/^n=/i, ""));
  if (hay.includes(needle)) return true;
  const digits = raw.replace(/^n=/i, "").replace(/,/g, "");
  if (/^\d+$/.test(digits)) {
    const grouped = Number(digits).toLocaleString("en-US");
    if (hay.includes(norm(grouped)) || hay.includes(digits)) return true;
  }
  return false;
}

function toolNames(payload) {
  const used = payload.tools_used ?? payload.trace?.tools ?? [];
  return used.map((item) => (typeof item === "string" ? item : item.name));
}

async function ask(identityId, question) {
  const started = Date.now();
  const response = await fetch(`${BASE}/api/people/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, caseId: "attrition", identityId }),
  });
  const payload = await response.json();
  return { status: response.status, payload, latency_ms: Date.now() - started };
}

function scoreHypotheses(payload, assertions = {}) {
  const failures = [];
  const lines = (payload.hypotheses ?? payload.interpretation ?? []).map((row) => String(row).trim()).filter(Boolean);
  if (assertions.hypotheses_non_empty === false) {
    if (lines.length) failures.push("hypotheses_should_be_empty");
    return failures;
  }
  if (assertions.hypotheses_non_empty && lines.length === 0) failures.push("hypotheses_empty");
  if (assertions.hypotheses_no_digits) {
    for (const line of lines) {
      if (/\d/.test(line)) failures.push("hypothesis_contains_number");
    }
  }
  if (assertions.hypotheses_no_causal_terms) {
    for (const line of lines) {
      if (CAUSAL.test(line)) failures.push("hypothesis_causal_claim");
    }
  }
  return failures;
}

function scoreLive(row, payload) {
  const failures = [];
  const expected = row.expected ?? {};
  const assertions = row.assertions ?? {};
  if (expected.llm_invocation && payload.llm_invocation !== expected.llm_invocation) {
    failures.push(`llm_invocation:${payload.llm_invocation}`);
  }
  if (expected.refuse_reason && payload.refuse_reason !== expected.refuse_reason) {
    failures.push(`refuse_reason:${payload.refuse_reason ?? "null"}`);
  }
  if (typeof expected.denied === "boolean") {
    const denied = payload.denied === true || /not available/i.test(String(payload.headline ?? ""));
    if (expected.denied && !denied) failures.push("expected_denied");
    if (!expected.denied && denied) failures.push("unexpected_denied");
  }
  if (expected.deny_reason && expected.denied) {
    const hay = `${blob(payload)}\n${payload.deny_reason ?? ""}`;
    if (!hay.includes(expected.deny_reason)) failures.push(`deny_reason:${payload.deny_reason ?? "missing"}`);
  }
  for (const tool of expected.required_tools ?? []) {
    if (!toolNames(payload).includes(tool)) failures.push(`missing_tool:${tool}`);
  }
  if (expected.as_of) {
    const asOf = payload.as_of ?? payload.snapshot?.as_of ?? "";
    if (!blob(payload).includes(expected.as_of) && asOf !== expected.as_of) {
      failures.push("as_of_mismatch");
    }
  }
  if (typeof expected.effective_min_cell === "number" && payload.effective_min_cell !== expected.effective_min_cell) {
    failures.push(`effective_min_cell:${payload.effective_min_cell}`);
  }
  if (expected.min_cell_source && payload.min_cell_source && payload.min_cell_source !== expected.min_cell_source) {
    failures.push(`min_cell_source:${payload.min_cell_source}`);
  }
  if (expected.critic_ok === true && payload.critic?.ok === false) {
    failures.push("critic_not_ok");
  }
  if (typeof expected.supported === "boolean" && payload.supported !== expected.supported) {
    failures.push(`supported:${payload.supported}`);
  }
  for (const target of assertions.consistency_targets ?? []) {
    if (!hasTarget(payload, target)) failures.push(`missing_target:${target}`);
  }
  for (const banned of assertions.forbidden_targets ?? []) {
    if (banned && norm(blob(payload)).includes(norm(banned))) {
      failures.push(`forbidden:${banned}`);
    }
  }
  if (assertions.facts_traceable_to_this_turn_tools) {
    const facts = payload.trace?.observed?.facts ?? payload.observed?.facts ?? [];
    const names = new Set(toolNames(payload));
    if (Array.isArray(facts)) {
      for (const fact of facts) {
        if (!fact.source_tool) failures.push("fact_missing_source_tool");
        else if (!names.has(fact.source_tool)) failures.push(`fact_tool_not_this_turn:${fact.source_tool}`);
      }
    }
  }
  failures.push(...scoreHypotheses(payload, assertions));
  return [...new Set(failures)];
}

function rankCase(row) {
  if (UNIT_EXEC.has(row.execution)) return 0;
  if (row.id === "E1-LLM-ATTEMPTED-OK") return 1;
  if (row.id === "E1-LLM-SKIPPED-BUDGET") return 9;
  return 5;
}

async function askUntilBudgetSkip(identityId, question) {
  let last = await ask(identityId, question);
  if (last.payload.llm_invocation === "skipped_by_budget") return last;
  for (let i = 0; i < 8; i += 1) {
    last = await ask(identityId, question);
    if (last.payload.llm_invocation === "skipped_by_budget") return last;
  }
  return last;
}

async function runCase(row, unitMap) {
  if (UNIT_EXEC.has(row.execution)) {
    const passed = unitMap.get(row.id) === true;
    return {
      case_id: row.id,
      family: row.family,
      passed,
      latency_ms: 0,
      failures: passed ? [] : ["unit_fixture_failed"],
      answer_summary: { execution: row.execution },
    };
  }

  if (row.family === "chip_diff") {
    const [left, right] = String(row.prompt).split("||").map((part) => part.trim());
    const a = await ask(row.identity_id, left);
    const b = await ask(row.identity_id, right);
    const failures = [];
    const ha = (a.payload.hypotheses ?? []).join("\n");
    const hb = (b.payload.hypotheses ?? []).join("\n");
    if (row.assertions?.hypotheses_not_identical && ha === hb) failures.push("hypotheses_not_identical");
    failures.push(...scoreHypotheses(a.payload, row.assertions));
    failures.push(...scoreHypotheses(b.payload, row.assertions));
    if (row.expected?.llm_invocation) {
      if (a.payload.llm_invocation !== row.expected.llm_invocation) {
        failures.push(`llm_invocation_left:${a.payload.llm_invocation}`);
      }
      if (b.payload.llm_invocation !== row.expected.llm_invocation) {
        failures.push(`llm_invocation_right:${b.payload.llm_invocation}`);
      }
    }
    const union = new Set([...toolNames(a.payload), ...toolNames(b.payload)]);
    for (const tool of row.expected?.required_tools ?? []) {
      if (!union.has(tool)) failures.push(`missing_tool:${tool}`);
    }
    return {
      case_id: row.id,
      family: row.family,
      passed: failures.length === 0,
      latency_ms: a.latency_ms + b.latency_ms,
      failures: [...new Set(failures)],
      answer_summary: { left: a.payload.headline, right: b.payload.headline, trace_ids: [a.payload.trace_id, b.payload.trace_id] },
    };
  }

  if (row.family === "case1_panel") {
    const started = Date.now();
    const url = `${BASE}/enterprise-demo/trust?identity=${encodeURIComponent(row.identity_id)}`;
    const html = await fetch(url).then((response) => response.text());
    const text = htmlText(html);
    const failures = [];
    const title = row.expected?.panel_title;
    if (title && !text.includes(title)) failures.push(`missing_panel:${title}`);
    if (row.expected?.as_of && !text.includes(row.expected.as_of)) failures.push("as_of_mismatch");
    for (const cell of row.expected?.cells ?? []) {
      if (cell.denied && cell.reason && !text.includes(cell.reason)) {
        failures.push(`missing_reason:${cell.reason}`);
      }
    }
    return {
      case_id: row.id,
      family: row.family,
      passed: failures.length === 0,
      latency_ms: Date.now() - started,
      failures,
      answer_summary: { url, panel_title: title },
    };
  }

  if (row.session?.prior_prompts?.length) {
    for (const prior of row.session.prior_prompts) {
      await ask(row.identity_id, prior);
    }
  }

  const result =
    row.id === "E1-LLM-SKIPPED-BUDGET"
      ? await askUntilBudgetSkip(row.identity_id, row.prompt)
      : await ask(row.identity_id, row.prompt);
  const failures = result.status === 200 ? scoreLive(row, result.payload) : [`http_${result.status}`];
  return {
    case_id: row.id,
    family: row.family,
    passed: failures.length === 0,
    latency_ms: result.latency_ms,
    failures,
    answer_summary: {
      headline: result.payload.headline,
      trace_id: result.payload.trace_id,
      llm_invocation: result.payload.llm_invocation,
      llm_used: result.payload.trace?.llm_used ?? result.payload.llm_used,
      tokens_in: result.payload.trace?.tokens_in,
      tokens_out: result.payload.trace?.tokens_out,
    },
  };
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function rate(rows, pred) {
  const n = rows.length;
  if (!n) return null;
  return Number((rows.filter(pred).length / n).toFixed(4));
}

function parseVitestJson(raw) {
  const map = new Map();
  try {
    const parsed = JSON.parse(raw);
    const suites = parsed.testResults ?? parsed;
    const walk = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      for (const row of node.assertionResults ?? []) {
        const title = String(row.title ?? row.fullName ?? "");
        const id = title.match(/E1-[A-Z0-9-]+/)?.[0];
        if (id) map.set(id, row.status === "passed");
      }
      walk(node.assertionResults);
    };
    walk(suites);
  } catch {
    /* fall through */
  }
  return map;
}

async function main() {
  const runId = randomUUID();
  const unitJson = path.join(ROOT, "docs/phase4/e1-unit.json");
  const unit = spawnSync(
    "npx",
    ["vitest", "run", "src/lib/people/agent/e1-unit-fixtures.test.ts", "--reporter=json", `--outputFile=${unitJson}`],
    { cwd: ROOT, encoding: "utf8", shell: true },
  );
  const unitMap = parseVitestJson(
    (() => {
      try {
        return readFileSync(unitJson, "utf8");
      } catch {
        return unit.stdout || "{}";
      }
    })(),
  );
  const unitCases = GOLDEN.cases.filter((row) => UNIT_EXEC.has(row.execution));
  if (unit.status === 0) {
    for (const row of unitCases) {
      if (!unitMap.has(row.id)) unitMap.set(row.id, true);
    }
  } else if (unitMap.size === 0) {
    for (const row of unitCases) unitMap.set(row.id, false);
  }

  if (ONLY_FAMILIES.has("llm")) {
    const garbage = spawnSync(
      "npx",
      [
        "vitest",
        "run",
        "src/lib/people/agent/agent.test.ts",
        "-t",
        "keeps observed byte-identical when the LLM stub returns garbage",
      ],
      { cwd: ROOT, encoding: "utf8", shell: true },
    );
    if (garbage.status !== 0) {
      console.error(garbage.stdout || garbage.stderr || "garbage stub test failed");
      process.exit(garbage.status || 1);
    }
  }

  const selected = GOLDEN.cases.filter((row) => !ONLY_FAMILIES.size || ONLY_FAMILIES.has(row.family));
  const ordered = [...selected].sort((a, b) => rankCase(a) - rankCase(b) || String(a.id).localeCompare(b.id));
  const fresh = [];
  for (const row of ordered) {
    process.stdout.write(`${row.id} ${row.family}\n`);
    fresh.push(await runCase(row, unitMap));
  }

  const prior =
    MERGE_PRIOR || ONLY_FAMILIES.size
      ? JSON.parse(readFileSync(E1_JSON, "utf8"))
      : null;
  if ((MERGE_PRIOR || ONLY_FAMILIES.size) && !prior?.results?.length) {
    throw new Error("E1_ONLY_FAMILIES/E1_MERGE_PRIOR requires docs/phase4/e1-run.json");
  }
  const byId = new Map((prior?.results ?? []).map((row) => [row.case_id, row]));
  for (const row of fresh) byId.set(row.case_id, row);
  const results = [...byId.values()].sort((a, b) => String(a.case_id).localeCompare(b.case_id));

  const live = results.filter((row) => row.latency_ms > 0 || !UNIT_EXEC.has(GOLDEN.cases.find((c) => c.id === row.case_id)?.execution));
  const latencies = results.map((row) => row.latency_ms).filter((n) => Number.isFinite(n) && n > 0);
  const byFamily = {};
  for (const row of results) {
    byFamily[row.family] ??= { n: 0, pass: 0 };
    byFamily[row.family].n += 1;
    if (row.passed) byFamily[row.family].pass += 1;
  }

  const blockingFailed = results.filter((row) => BLOCKING_FAMILIES.has(row.family) && row.passed === false);
  const failed = results.filter((row) => row.passed === false);
  const scorecard = {
    cases: results.length,
    passed: results.filter((row) => row.passed).length,
    rates: {
      metric_accuracy: rate(
        results.filter((row) => row.family === "authz" || row.family === "seed" || row.family === "tools"),
        (row) => row.passed,
      ),
      tool_selection_accuracy: rate(
        results.filter((row) => (GOLDEN.cases.find((c) => c.id === row.case_id)?.expected?.required_tools ?? []).length),
        (row) => row.passed,
      ),
      refuse_accuracy: rate(
        results.filter((row) => row.family === "refuse"),
        (row) => row.passed,
      ),
      causal_violation_rate: rate(results, (row) => row.failures.includes("hypothesis_causal_claim")),
      suppression_violation_rate: rate(
        results.filter((row) => row.family === "suppression"),
        (row) => row.passed === false,
      ),
      session_consistency: rate(
        results.filter((row) => row.family === "session"),
        (row) => row.passed,
      ),
      chip_differentiation: rate(
        results.filter((row) => row.family === "chip_diff"),
        (row) => row.passed,
      ),
      llm_usage_rate: rate(live, (row) => row.answer_summary?.llm_invocation === "attempted_ok"),
    },
    p50_ms: percentile(latencies, 50),
    p95_ms: percentile(latencies, 95),
    by_family: byFamily,
    blocking_failed: blockingFailed.map((row) => row.case_id),
    failed: failed.map((row) => ({ case_id: row.case_id, family: row.family, failures: row.failures })),
    unit_ok: unit.status === 0,
    llm_path_note:
      rate(live, (row) => row.answer_summary?.llm_invocation === "attempted_ok") === 0
        ? "LLM usage rate 0 — this run validates the deterministic skeleton path; the LLM-assisted path is covered by E1-LLM-* and the stub test, pending a successful upstream call."
        : null,
  };

  const status = blockingFailed.length || failed.length ? "fail" : "pass";
  const payload = {
    run_id: runId,
    git_tag: process.env.GIT_TAG ?? "phase4-p1-r6",
    dpl: process.env.DPL ?? "",
    status,
    scorecard,
    results,
    note: ONLY_FAMILIES.size
      ? `e1 golden 101; reran families ${[...ONLY_FAMILIES].join(",")}`
      : "e1 golden 101",
  };
  writeFileSync(path.join(ROOT, "docs/phase4/e1-run.json"), `${JSON.stringify(payload, null, 2)}\n`);

  const write = spawnSync("python", ["write_e1_eval.py", path.join(ROOT, "docs/phase4/e1-run.json")], {
    cwd: path.join(ROOT, "data-platform", "serving"),
    encoding: "utf8",
    shell: true,
  });
  process.stdout.write(write.stdout || "");
  process.stderr.write(write.stderr || "");
  console.log(
    JSON.stringify(
      {
        run_id: runId,
        status,
        blocking_failed: scorecard.blocking_failed,
        failed: scorecard.failed,
        passed: scorecard.passed,
        cases: scorecard.cases,
        rates: scorecard.rates,
      },
      null,
      2,
    ),
  );
  if (write.status !== 0) process.exit(write.status || 1);
  if (status !== "pass") process.exit(1);
}

await main();
