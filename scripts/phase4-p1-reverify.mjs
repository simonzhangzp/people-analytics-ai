import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
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
  { id: "demo-external-viewer", slug: "visitor" },
  { id: "demo-leader-engineering", slug: "leader" },
  { id: "demo-hrbp", slug: "hrbp" },
  { id: "demo-people-analyst", slug: "analyst" },
];
const FREEFORM = "Why is Engineering voluntary attrition increasing?";
const TRACE_FORBIDDEN = /\b(failure|error|exception)\b/i;
const BUDGET_NOTICE =
  "The free-form demo has reached today's limit for this network. The six prepared questions below still work.";

const problems = [];
const apiRows = [];
const matrix = {};

await mkdir(OUT, { recursive: true });

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

function note(ok, message) {
  if (!ok) problems.push(message);
  console.log(ok ? "ok" : "FAIL", message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

await page.goto(`${BASE}/dataset`, { waitUntil: "networkidle" });
const freshnessCard = page.locator("section").filter({ has: page.getByText("FRESHNESS", { exact: true }) });
await freshnessCard.waitFor({ timeout: 30_000 });
const freshness = await page.getByTestId("dataset-freshness").innerText();
note(/frozen at data-v1/i.test(freshness), `dataset freshness: ${freshness}`);
note(!(await freshnessCard.locator("p.eyebrow").filter({ hasText: "External sources" }).count()), "freshness is its own card");
await page.screenshot({ path: path.join(OUT, "p0-dataset-freshness.png"), fullPage: true });
await freshnessCard.screenshot({ path: path.join(OUT, "p1-s3-freshness-card.png") });

await page.goto(`${BASE}/enterprise-demo/attrition`, { waitUntil: "domcontentloaded" });
await page.getByTestId("case3-headline").waitFor({ timeout: 45_000 });
const headline = await page.getByTestId("case3-headline").innerText();
note(/16\.0%/.test(headline) && /17\.9%/.test(headline) && /up 1\.9 pp from 2026-07/.test(headline), `B3 headline: ${headline}`);
note(!/Month view \+1\.9 pp versus last month/i.test(headline), "old MoM copy is gone");
await page.getByTestId("case3-headline").screenshot({ path: path.join(OUT, "p1-b3-headline.png") });
await page.getByTestId("attrition-trend").screenshot({ path: path.join(OUT, "p1-s2-chart.png") });
const axisNote = await page.getByTestId("attrition-trend-axis-note").innerText().catch(() => "");
note(/Y-axis starts at/.test(axisNote) && /not 0/.test(axisNote), `S2 axis note: ${axisNote}`);
note(Boolean(await page.getByTestId("attrition-trend-scenario").count()), "S2 scenario marker present");

for (const identity of IDENTITIES) {
  await page.goto(`${BASE}/enterprise-demo/attrition?identity=${identity.id}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("case3-headline").waitFor({ timeout: 45_000 });
  const signals = await page.getByTestId("related-signals").innerText();
  if (identity.id === "demo-external-viewer") {
    note(!/0\.98/.test(signals) && !/0\.88/.test(signals), `B1 ${identity.slug} has no compa medians`);
    note(/Compa-ratio comparison is available to internal People identities/.test(signals), `B1 ${identity.slug} gate copy`);
  } else {
    note(/Compa-ratio/.test(signals) && /0\.\d{2}/.test(signals), `B1 ${identity.slug} shows compa numbers`);
  }

  for (const [index, chip] of CHIPS.entries()) {
    const api = await askApi(identity.id, chip);
    const payload = api.payload;
    apiRows.push({
      identity: identity.id,
      chip,
      llm_invocation: payload.llm_invocation,
      failure_reason: payload.failure_reason ?? null,
      withheld: payload.withheld ?? false,
      headline: payload.headline,
      facts: payload.facts,
      trace_id: payload.trace_id,
    });
    note(api.ok, `API ${identity.slug} ${chip} HTTP`);
    note(payload.llm_invocation === "skipped_by_design", `API ${identity.slug} ${chip} skipped_by_design`);
    note(!payload.withheld, `API ${identity.slug} ${chip} not withheld`);
    if (chip === "How is voluntary attrition defined?") {
      const blob = `${payload.headline}\n${(payload.facts ?? []).join("\n")}`;
      note(/\/\s*average certified headcount/i.test(blob) || /\/ average/.test(blob), `chip-06 formula has denominator: ${blob.slice(0, 240)}`);
    }
    if (identity.id === "demo-external-viewer" && chip === "Show me the tenure breakdown") {
      const blob = (payload.facts ?? []).join(" ");
      note(/No cells hidden at this grain/.test(blob) || /cells hidden/.test(blob), `S1 tenure hidden fact: ${blob.slice(-180)}`);
      if (/0 location × tenure cells hidden/.test(blob)) {
        note(!/among cells still visible/.test(blob), "S1 visitor tenure does not hedge when hidden=0");
      }
    }
    if (identity.id === "demo-external-viewer" && chip === "What about compensation?") {
      note(/restricted for site visitors/i.test(String(payload.headline)), "chip-04 visitor restricted");
    }

    const pending = page.waitForResponse(
      (res) => res.url().includes("/api/people/ask") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: chip, exact: true }).click();
    const res = await pending;
    const body = await res.json();
    await page.getByTestId("people-ai-headline").waitFor();
    const shown = await page.getByTestId("people-ai-headline").innerText();
    note(shown.trim() === String(body.headline ?? "").trim(), `UI headline matches API for ${identity.slug} ${chip}`);
    if (!(await page.getByTestId("people-ai-trace").count())) {
      await page.getByTestId("people-ai-trace-toggle").click();
    }
    await page.getByTestId("people-ai-trace").waitFor();
    const traceText = await page.getByTestId("people-ai-trace").innerText();
    const llmLine = await page.getByTestId("people-ai-trace-llm").innerText();
    note(/llm_invocation skipped_by_design/.test(llmLine), `F2 ${identity.slug} ${chip} ${llmLine}`);
    if (identity.id === "demo-external-viewer") {
      note(!TRACE_FORBIDDEN.test(traceText), `F2 visitor trace has no failure/error/exception: ${chip}`);
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
  });
}

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
  note(notice === BUDGET_NOTICE, `F3 budget copy: ${notice}`);
  note(!/429|quota|rate limit|withheld/i.test(await page.getByTestId("people-ai-answer").innerText()), "F3 no tech words");
  await page.screenshot({ path: path.join(OUT, "p1-f3-budget.png"), fullPage: true });
  record("skipped_by_budget", {
    llm_invocation: "skipped_by_budget",
    question: FREEFORM,
    identity_id: "demo-external-viewer",
    trace_id: freeform.payload?.trace_id,
    failure_reason: freeform.payload?.failure_reason ?? null,
    source: `${BASE}/api/people/ask`,
    headline: freeform.payload?.headline,
    notice: BUDGET_NOTICE,
  });
  const pendingChip = page.waitForResponse(
    (res) => res.url().includes("/api/people/ask") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Which locations matter most?", exact: true }).click();
  const chipAfter = await (await pendingChip).json();
  note(chipAfter.llm_invocation === "skipped_by_design" && !chipAfter.withheld, "chip still works after budget");
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
  });
  await page.screenshot({ path: path.join(OUT, "p1-freeform-attempted-ok.png"), fullPage: true });
  note(true, "free-form still under budget; skipped_by_budget not observed on this IP");
}

await browser.close();

await writeFile(path.join(OUT, "phase4_chip_api.json"), `${JSON.stringify(apiRows, null, 2)}\n`);
await writeFile(path.join(OUT, "phase4_llm_invocation_matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`);
await writeFile(path.join(OUT, "phase4_reverify_problems.json"), `${JSON.stringify(problems, null, 2)}\n`);
console.log("problems", problems.length, problems);
if (problems.length) process.exit(1);
console.log("reverify_ok");
