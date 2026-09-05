import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "https://peopleanalyticsai.net";
const OUT = path.resolve("docs/phase4");
const CHIPS = [
  "Which locations matter most?",
  "What should we investigate next?",
  "Show me the tenure breakdown",
  "What about compensation?",
  "Which critical skills have the largest gaps?",
  "How is voluntary attrition defined?",
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/dataset`, { waitUntil: "networkidle" });
const freshness = await page.getByTestId("dataset-freshness").innerText();
if (!/frozen at data-v1/i.test(freshness) || /daily job verifies/i.test(freshness)) {
  throw new Error(`Dataset freshness copy is wrong: ${freshness}`);
}
await page.screenshot({ path: path.join(OUT, "p0-dataset-freshness.png"), fullPage: true });

await page.goto(`${BASE}/enterprise-demo/attrition`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Why is Engineering voluntary attrition increasing?" }).waitFor({ timeout: 45_000 });

for (const [index, chip] of CHIPS.entries()) {
  const button = page.getByRole("button", { name: chip, exact: true });
  await button.scrollIntoViewIfNeeded();
  const pending = page.waitForResponse(
    (res) =>
      res.url().includes("/api/people/ask") &&
      res.request().method() === "POST" &&
      res.ok(),
  );
  await button.click();
  const res = await pending;
  const payload = await res.json();
  const headline = String(payload.headline ?? "");
  if (!headline || /withheld/i.test(headline) || payload.withheld) {
    throw new Error(`Chip withheld: ${chip} → ${headline}`);
  }
  await page.getByTestId("people-ai-headline").waitFor();
  const shown = await page.getByTestId("people-ai-headline").innerText();
  if (shown.trim() !== headline.trim()) {
    throw new Error(`Headline mismatch for ${chip}: ui=${shown} api=${headline}`);
  }
  const slug = String(index + 1).padStart(2, "0");
  await page.screenshot({
    path: path.join(OUT, `p1-chip-${slug}.png`),
    fullPage: true,
  });
}

await browser.close();
console.log("screenshots_ok", freshness);
