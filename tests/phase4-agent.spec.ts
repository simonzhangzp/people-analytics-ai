import { expect, test } from "@playwright/test";
import path from "node:path";

const SHOTS = path.join("docs", "phase4");

test.describe("Phase 4 agent + connect", () => {
  test("connect page shows the public demo token disclaimer", async ({ page }) => {
    await page.goto("/connect");
    await expect(page.getByRole("heading", { name: /connect via mcp/i })).toBeVisible();
    await expect(page.getByTestId("mcp-token-disclaimer")).toContainText(
      "public demo token · aggregate only · min_cell 50",
    );
    await expect(page.getByText("get_skill_coverage")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/connect.png`, fullPage: true });
  });

  test("three degrade states render distinct copy", async ({ page }) => {
    await page.route("**/api/people/ask", async (route) => {
      const posted = route.request().postDataJSON() as { question?: string };
      const question = String(posted.question ?? "");
      if (question.includes("RPC")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            question,
            supported: false,
            headline: "People serving could not complete this lookup. No substitute numbers were generated.",
            facts: [],
            interpretation: [],
            quality_status: "unknown",
            error_state: "rpc",
            withheld: false,
            critic: { ok: true, failures: [] },
            tools_used: [],
            evidence: [],
            freshness: null,
          }),
        });
        return;
      }
      if (question.includes("critic")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            question,
            supported: false,
            headline: "Tool results and narrative did not reconcile — answer withheld",
            facts: [],
            interpretation: [],
            quality_status: "unknown",
            error_state: "critic",
            withheld: true,
            critic: { ok: false, failures: ["headline percent 99.9% is not in tool results"] },
            tools_used: [],
            evidence: [],
            freshness: null,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          question,
          supported: true,
          headline: "Engineering trailing-12m annualized voluntary attrition is 16.0%.",
          facts: ["Engineering trailing-12m voluntary attrition: 16.0% as of 2026-08-31."],
          interpretation: ["Location concentrations are observed associations."],
          quality_status: "healthy",
          error_state: null,
          withheld: false,
          llm_skipped: "llm_failed",
          critic: { ok: true, failures: [] },
          tools_used: ["get_metric"],
          evidence: [],
          freshness: null,
          trace_id: "00000000-0000-4000-8000-000000000099",
          tier: 2,
          trace: { tools: [], latency_ms: 12, llm_skipped: "llm_failed", llm_calls: 0 },
        }),
      });
    });

    await page.goto("/enterprise-demo/attrition");
    if (await page.getByRole("heading", { name: /people serving is not configured/i }).isVisible()) {
      test.skip(true, "People serving env is not configured");
    }

    await page.getByLabel("Follow-up question").fill("silent LLM timeout path");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByTestId("people-ai-headline")).toContainText("16.0%");
    await page.screenshot({ path: `${SHOTS}/degrade-llm-silent.png`, fullPage: true });

    await page.getByLabel("Follow-up question").fill("RPC failure demo");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByTestId("people-ai-headline")).toContainText("No substitute numbers");
    await expect(page.getByTestId("people-ai-rpc-error")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/degrade-rpc.png`, fullPage: true });

    await page.getByLabel("Follow-up question").fill("critic fail demo");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByTestId("people-ai-headline")).toContainText(
      "Tool results and narrative did not reconcile — answer withheld",
    );
    await page.getByRole("button", { name: /critic failures/i }).click();
    await expect(page.getByText(/99\.9%/)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/degrade-critic.png`, fullPage: true });
  });
});
