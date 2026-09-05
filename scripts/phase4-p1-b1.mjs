import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "https://peopleanalyticsai.net";
const OUT = path.resolve("docs/phase4");
const IDENTITIES = [
  { id: "demo-external-viewer", slug: "visitor", expect: /Compa-ratio comparison is available to internal People identities/ },
  { id: "demo-leader-engineering", slug: "leader", expect: /Scenario control vs slice aggregates/ },
  { id: "demo-hrbp", slug: "hrbp", expect: /Scenario control vs slice aggregates/ },
  { id: "demo-people-analyst", slug: "analyst", expect: /Scenario control vs slice aggregates/ },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

for (const identity of IDENTITIES) {
  await page.goto(`${BASE}/enterprise-demo/attrition?identity=${identity.id}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("case3-headline").waitFor({ timeout: 45_000 });
  const signals = await page.getByTestId("related-signals").innerText();
  if (identity.slug === "visitor" && (/0\.98/.test(signals) || /0\.88/.test(signals))) {
    throw new Error(`visitor still shows compa medians: ${signals}`);
  }
  if (!identity.expect.test(signals)) {
    throw new Error(`${identity.slug} signals mismatch: ${signals}`);
  }
  const pending = page.waitForResponse(
    (res) => res.url().includes("/api/people/ask") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "What about compensation?", exact: true }).click();
  const payload = await (await pending).json();
  if (identity.slug === "visitor" && !/site visitors/i.test(payload.headline)) {
    throw new Error(`visitor chip-04: ${payload.headline}`);
  }
  if (identity.slug !== "visitor" && identity.slug !== "analyst" && /site visitors/i.test(payload.headline)) {
    throw new Error(`${identity.slug} chip-04 still says site visitors: ${payload.headline}`);
  }
  if (identity.slug === "analyst" && !/0\.98/.test(payload.headline)) {
    throw new Error(`analyst chip-04: ${payload.headline}`);
  }
  await page.getByTestId("people-ai-headline").waitFor();
  if (!(await page.getByTestId("people-ai-trace").count())) {
    await page.getByTestId("people-ai-trace-toggle").click();
  }
  await page.screenshot({
    path: path.join(OUT, `p1-b1-${identity.slug}-chip04-signals.png`),
    fullPage: true,
  });
  console.log("ok", identity.slug, payload.headline);
}

await browser.close();
console.log("b1_ok");
