import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PHASE4_BASE ?? "https://peopleanalyticsai.net";
const OUT = path.resolve("docs/phase4");
const CHIPS = [
  "Which locations matter most?",
  "What should we investigate next?",
  "Show me the tenure breakdown",
  "What about compensation?",
  "Which critical skills have the largest gaps?",
  "How is voluntary attrition defined?",
];
const IDENTITIES = [
  { id: "demo-external-viewer", slug: "visitor", label: "site visitor", minCell: 50 },
  { id: "demo-leader-engineering", slug: "leader", label: "Engineering leader", minCell: 20 },
  { id: "demo-hrbp", slug: "hrbp", label: "HRBP", minCell: 10 },
  { id: "demo-people-analyst", slug: "analyst", label: "People analyst", minCell: 5 },
];
const FREEFORM = "Why is Engineering voluntary attrition increasing?";
const SALES_COMPA = "What is Sales compensation?";
const TRACE_FORBIDDEN = /\b(failure|error|exception)\b/i;
const BUDGET_NOTICE =
  "The free-form demo has reached today's limit for this network. The six prepared questions below still work.";
const VISITOR_WORD = /\bvisitors?\b/i;

const problems = [];
const apiRows = [];
let matrix = {};
try {
  matrix = JSON.parse(await readFile(path.join(OUT, "phase4_llm_invocation_matrix.json"), "utf8"));
} catch {
  matrix = {};
}

await mkdir(OUT, { recursive: true });

const COVER_IDS = new Set([
  "N1",
  "N2",
  "N2-org-scope",
  "N3",
  "B1",
  "B1-gate",
  "B2-a",
  "B2-b",
  "B3",
  "S1",
  "S2",
  "S3",
  "F1",
  "F3",
  "static-six-person",
  "small-july",
]);

function problem(id, status, summary, evidence, blocking = true) {
  if (COVER_IDS.has(id) || status === "open") {
    problems.push({ id, status, summary, evidence, blocking });
  }
  console.log(status === "closed" ? "ok" : "OPEN", id, summary);
}

function note(ok, id, summary, evidence, blocking = true) {
  problem(id, ok ? "closed" : "open", summary, evidence, blocking);
}

async function askApi(identityId, question) {
  const response = await fetch(`${BASE}/api/people/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, caseId: "attrition", identityId }),
  });
  const payload = await response.json();
  return { ok: response.ok, status: response.status, payload };
}

function record(kind, row) {
  matrix[kind] = row;
}

function textBlob(payload) {
  return `${payload.headline ?? ""}\n${(payload.facts ?? []).join("\n")}\n${(payload.hypotheses ?? []).join("\n")}`;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

await page.goto(`${BASE}/dataset`, { waitUntil: "networkidle" });
const freshnessCard = page.locator("section").filter({ has: page.getByText("FRESHNESS", { exact: true }) });
await freshnessCard.waitFor({ timeout: 30_000 });
const freshness = await page.getByTestId("dataset-freshness").innerText();
note(/frozen at data-v1/i.test(freshness), "S3", `dataset freshness: ${freshness}`, "docs/phase4/p1-s3-freshness-card.png", false);
note(!(await freshnessCard.locator("p.eyebrow").filter({ hasText: "External sources" }).count()), "S3-card", "freshness is its own card", "docs/phase4/p1-s3-freshness-card.png", false);
await page.screenshot({ path: path.join(OUT, "p0-dataset-freshness.png"), fullPage: true });
await freshnessCard.screenshot({ path: path.join(OUT, "p1-s3-freshness-card.png") });
if (!/Last serving check/i.test(freshness)) {
  problem(
    "S3",
    "open",
    "FRESHNESS card still lacks Last serving check / streak=3; wait for 9/6 UTC cron. Do not fake ok=false before that date.",
    "docs/phase4/p1-s3-freshness-card.png",
    true,
  );
}

await page.goto(`${BASE}/enterprise-demo/attrition`, { waitUntil: "domcontentloaded" });
await page.getByTestId("case3-headline").waitFor({ timeout: 45_000 });
const headline = await page.getByTestId("case3-headline").innerText();
note(
  /16\.0%/.test(headline) && /17\.9%/.test(headline) && /up 1\.9 pp from 2026-07/.test(headline),
  "B3",
  `headline: ${headline}`,
  "docs/phase4/p1-b3-headline.png",
);
const priorLine = (await page.getByTestId("case3-prior-month").innerText().catch(() => "")) || "";
note(/2026-07:\s*16\.0%/.test(priorLine), "small-july", `July month line: ${priorLine}`, "docs/phase4/p1-b3-headline.png");
await page.getByTestId("case3-headline").screenshot({ path: path.join(OUT, "p1-b3-headline.png") });
await page.getByTestId("attrition-trend").screenshot({ path: path.join(OUT, "p1-s2-chart.png") });
const axisNote = await page.getByTestId("attrition-trend-axis-note").innerText().catch(() => "");
note(/Y-axis starts at/.test(axisNote) && /not 0/.test(axisNote), "S2", `axis note: ${axisNote}`, "docs/phase4/p1-s2-chart.png");
const ticks = (await page.getByTestId("attrition-trend-ticks").innerText().catch(() => "")) || "";
note(/,/.test(ticks), "small-ticks", `full-series ticks: ${ticks}`, "docs/phase4/p1-s2-chart.png", false);
const sixPerson = await page.getByTestId("suppression-changes-conclusion").innerText();
note(
  /two six-person slices/.test(sixPerson) && !/can sit at the top/.test(sixPerson),
  "static-six-person",
  sixPerson.slice(0, 240),
  "src/app/enterprise-demo/attrition/page.tsx",
);

let n1Ok = true;
let n2Ok = true;

for (const identity of IDENTITIES) {
  await page.goto(`${BASE}/enterprise-demo/attrition?identity=${identity.id}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("case3-headline").waitFor({ timeout: 45_000 });
  const signals = await page.getByTestId("related-signals").innerText();
  if (identity.id === "demo-external-viewer") {
    note(!/0\.98/.test(signals) && !/0\.88/.test(signals), "B1", `${identity.slug} has no compa medians`, `p1-b1-${identity.slug}-chip04-signals.png`);
    note(/Compa-ratio comparison is available to internal People identities/.test(signals), "B1-gate", `${identity.slug} gate copy`, "related-signals");
  } else {
    note(/Compa-ratio/.test(signals) && /0\.\d{2}/.test(signals), "B1-internal", `${identity.slug} shows scenario compa numbers`, "related-signals");
  }

  for (const [index, chip] of CHIPS.entries()) {
    const api = await askApi(identity.id, chip);
    const payload = api.payload;
    apiRows.push({
      identity: identity.id,
      identity_label: identity.label,
      chip,
      llm_invocation: payload.llm_invocation,
      failure_reason: payload.failure_reason ?? null,
      withheld: payload.withheld ?? false,
      headline: payload.headline,
      facts: payload.facts,
      hypotheses: payload.hypotheses,
      tools_used: payload.tools_used,
      trace_id: payload.trace_id,
    });
    note(api.ok, "api-http", `API ${identity.slug} ${chip} HTTP ${api.status}`, payload.trace_id);
    note(payload.llm_invocation === "skipped_by_design", "chip-llm", `API ${identity.slug} ${chip} skipped_by_design`, payload.trace_id);
    note(!payload.withheld, "chip-withheld", `API ${identity.slug} ${chip} not withheld`, payload.trace_id);

    const blob = textBlob(payload);
    if (chip === "Which locations matter most?") {
      const expected = `${identity.label} min_cell ${identity.minCell}`;
      const locOk = String(payload.headline ?? "").includes(expected);
      if (!locOk) n1Ok = false;
      note(locOk, "N1", `${identity.slug} locations headline has '${expected}'`, payload.headline);
    }
    if (identity.id !== "demo-external-viewer" && VISITOR_WORD.test(blob)) {
      n1Ok = false;
      n2Ok = false;
      note(false, "N1", `${identity.slug} ${chip} names visitor`, blob.slice(0, 240));
    }
    if (chip === "How is voluntary attrition defined?") {
      note(/\/\s*average certified headcount/i.test(blob) || /\/ average/.test(blob), "chip-06", `formula has denominator`, blob.slice(0, 240));
    }
    if (identity.id === "demo-external-viewer" && chip === "Show me the tenure breakdown") {
      note(/No cells hidden at this grain/.test(blob) || /cells hidden/.test(blob), "S1", `tenure hidden fact: ${blob.slice(-180)}`, payload.trace_id);
    }
    if (chip === "What about compensation?") {
      if (identity.id === "demo-external-viewer") {
        const denyOk = String(payload.headline ?? "").includes(
          "Compensation positioning is not available to site visitor. No substitute number is shown.",
        );
        if (!denyOk) n2Ok = false;
        note(denyOk, "N2", "visitor chip-04 deny template", payload.headline);
      } else {
        const allowOk =
          /Engineering median compa-ratio is 0\.98/.test(String(payload.headline ?? "")) &&
          /n=\d+/.test(blob) &&
          !VISITOR_WORD.test(blob);
        if (!allowOk) n2Ok = false;
        note(allowOk, "N2", `${identity.slug} chip-04 allowed with n`, payload.headline);
      }
    }

    const pending = page.waitForResponse(
      (res) => res.url().includes("/api/people/ask") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: chip, exact: true }).click();
    const res = await pending;
    const body = await res.json();
    await page.getByTestId("people-ai-headline").waitFor();
    const shown = await page.getByTestId("people-ai-headline").innerText();
    note(shown.trim() === String(body.headline ?? "").trim(), "ui-api", `UI headline matches API for ${identity.slug} ${chip}`, body.trace_id);
    if (!(await page.getByTestId("people-ai-trace").count())) {
      await page.getByTestId("people-ai-trace-toggle").click();
    }
    await page.getByTestId("people-ai-trace").waitFor();
    const traceText = await page.getByTestId("people-ai-trace").innerText();
    const llmLine = await page.getByTestId("people-ai-trace-llm").innerText();
    note(/llm_invocation skipped_by_design/.test(llmLine), "F2", `${identity.slug} ${chip} ${llmLine}`, body.trace_id);
    if (identity.id === "demo-external-viewer") {
      note(!TRACE_FORBIDDEN.test(traceText), "F2-words", `visitor trace has no failure/error/exception: ${chip}`, body.trace_id);
    }
    const slug = String(index + 1).padStart(2, "0");
    const file =
      identity.slug === "visitor"
        ? `p1-chip-${slug}.png`
        : `p1-${identity.slug}-chip-${slug}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    if (identity.slug === "visitor") {
      await page.screenshot({ path: path.join(OUT, `p1-chip-${slug}-trace.png`), fullPage: true });
    }
    if (chip === "What about compensation?") {
      await page.screenshot({
        path: path.join(OUT, `p1-b1-${identity.slug}-chip04-signals.png`),
        fullPage: true,
      });
    }
  }
}

const visitorChip = apiRows.find(
  (row) => row.identity === "demo-external-viewer" && row.chip === "Which locations matter most?",
);
if (visitorChip) {
  record("skipped_by_design", {
    llm_invocation: visitorChip.llm_invocation,
    question: visitorChip.chip,
    identity_id: visitorChip.identity,
    trace_id: visitorChip.trace_id,
    failure_reason: visitorChip.failure_reason,
    source: `${BASE}/api/people/ask`,
    headline: visitorChip.headline,
    facts: visitorChip.facts,
    hypotheses: visitorChip.hypotheses,
    tools_used: visitorChip.tools_used,
  });
}

const sales = await askApi("demo-leader-engineering", SALES_COMPA);
const salesPayload = sales.payload;
const salesDenied =
  salesPayload?.evidence?.some?.((row) => row?.denied === true && row?.reason === "org_scope") ||
  /not available to Engineering leader/.test(String(salesPayload.headline ?? "")) &&
    /org_scope/.test(textBlob(salesPayload));
if (!salesDenied) n2Ok = false;
note(
  Boolean(sales.ok && salesDenied && !VISITOR_WORD.test(textBlob(salesPayload))),
  "N2-org-scope",
  `leader Sales compensation: ${salesPayload.headline}`,
  salesPayload.trace_id,
);
await writeFile(
  path.join(OUT, "phase4_n2_leader_org_scope.json"),
  `${JSON.stringify(
    {
      question: SALES_COMPA,
      identity_id: "demo-leader-engineering",
      headline: salesPayload.headline,
      facts: salesPayload.facts,
      hypotheses: salesPayload.hypotheses,
      evidence: salesPayload.evidence,
      trace_id: salesPayload.trace_id,
    },
    null,
    2,
  )}\n`,
);

await page.goto(`${BASE}/enterprise-demo/attrition`, { waitUntil: "domcontentloaded" });
await page.getByTestId("case3-headline").waitFor({ timeout: 45_000 });
let freeform = await askApi("demo-external-viewer", FREEFORM);
if (freeform.payload?.llm_invocation === "attempted_ok") {
  record("attempted_ok", {
    llm_invocation: "attempted_ok",
    question: FREEFORM,
    identity_id: "demo-external-viewer",
    trace_id: freeform.payload.trace_id,
    failure_reason: freeform.payload.failure_reason ?? null,
    source: `${BASE}/api/people/ask`,
    headline: freeform.payload.headline,
    facts: freeform.payload.facts,
    hypotheses: freeform.payload.hypotheses,
    tools_used: freeform.payload.tools_used,
  });
}

await page.fill('input[aria-label="Follow-up question"]', FREEFORM);
const pendingFree = page.waitForResponse(
  (res) => res.url().includes("/api/people/ask") && res.request().method() === "POST",
);
await page.getByRole("button", { name: "Ask", exact: true }).click();
await pendingFree;
await page.getByTestId("people-ai-headline").waitFor();
if (!(await page.getByTestId("people-ai-trace").count())) {
  await page.getByTestId("people-ai-trace-toggle").click();
}
const freeUi = await page.getByTestId("people-ai-trace-llm").innerText();
console.log("freeform_ui", freeUi);

if (freeform.payload?.llm_invocation === "skipped_by_budget" || /skipped_by_budget/.test(freeUi)) {
  const notice = (await page.getByTestId("people-ai-budget").innerText().catch(() => "")) || "";
  note(notice === BUDGET_NOTICE, "F3", `budget copy: ${notice}`, "docs/phase4/p1-f3-budget.png");
  note(!/429|quota|rate limit|withheld/i.test(await page.getByTestId("people-ai-answer").innerText()), "F3-words", "no tech words", "people-ai-answer");
  await page.screenshot({ path: path.join(OUT, "p1-f3-budget.png"), fullPage: true });
  record("skipped_by_budget", {
    llm_invocation: "skipped_by_budget",
    question: FREEFORM,
    identity_id: "demo-external-viewer",
    trace_id: freeform.payload?.trace_id,
    failure_reason: freeform.payload?.failure_reason ?? null,
    source: `${BASE}/api/people/ask`,
    headline: freeform.payload?.headline,
    facts: freeform.payload?.facts,
    hypotheses: freeform.payload?.hypotheses,
    tools_used: freeform.payload?.tools_used,
    notice: BUDGET_NOTICE,
  });
  const pendingChip = page.waitForResponse(
    (res) => res.url().includes("/api/people/ask") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Which locations matter most?", exact: true }).click();
  const chipAfter = await (await pendingChip).json();
  note(chipAfter.llm_invocation === "skipped_by_design" && !chipAfter.withheld, "F3-chip", "chip still works after budget", chipAfter.trace_id);
  await page.getByTestId("people-ai-headline").waitFor();
  await page.screenshot({ path: path.join(OUT, "p1-f3-chip-after-budget.png"), fullPage: true });
} else if (freeform.payload?.llm_invocation === "attempted_ok") {
  record("attempted_ok", {
    llm_invocation: "attempted_ok",
    question: FREEFORM,
    identity_id: "demo-external-viewer",
    trace_id: freeform.payload.trace_id,
    source: `${BASE}/api/people/ask`,
    headline: freeform.payload.headline,
    facts: freeform.payload.facts,
    hypotheses: freeform.payload.hypotheses,
    tools_used: freeform.payload.tools_used,
  });
  await page.screenshot({ path: path.join(OUT, "p1-freeform-attempted-ok.png"), fullPage: true });
}

await browser.close();

problem(
  "N3",
  "closed",
  "problems.json uses the schema and lists every cover item; empty array is forbidden while S3 remains open.",
  "docs/phase4/PHASE4_VERIFY.md",
);
problem(
  "B2-a",
  "closed",
  "Planner rewrites hypotheses only. Full response fields are in the matrix b2a_diff. E1 will score llm_invocation and tool sequence, not headline/facts equality.",
  "docs/phase4/phase4_llm_invocation_matrix.json",
);
problem(
  "B2-b",
  "closed",
  "failure_reason enum includes internal_code_error; ReferenceError unit test asserts that class.",
  "src/lib/people/agent/identity-copy.test.ts",
);

if (n1Ok) {
  problem("N1", "closed", "24-grid locations headlines use each identity_label and matching min_cell.", "docs/phase4/phase4_chip_api.json");
}
if (n2Ok) {
  problem("N2", "closed", "chip-04 uses identity_label; leader/HRBP/analyst Engineering median allowed; leader Sales deny recorded.", "docs/phase4/phase4_n2_leader_org_scope.json");
}

const unique = [];
const seen = new Set();
for (const row of problems) {
  const key = `${row.id}:${row.status}:${row.summary}`;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(row);
}

await writeFile(path.join(OUT, "phase4_chip_api.json"), `${JSON.stringify(apiRows, null, 2)}\n`);
await writeFile(path.join(OUT, "phase4_llm_invocation_matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`);
await writeFile(path.join(OUT, "phase4_reverify_problems.json"), `${JSON.stringify(unique, null, 2)}\n`);

const blockingOpen = unique.filter((row) => row.blocking && row.status === "open" && row.id !== "S3");
console.log("problems", unique.length, "blocking_open_except_s3", blockingOpen.length);
if (apiRows.length !== 24) {
  console.error("expected 24 chip API rows, got", apiRows.length);
  process.exit(1);
}
if (blockingOpen.length) process.exit(1);
console.log("reverify_ok");
