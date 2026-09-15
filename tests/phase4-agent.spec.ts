import { expect, test } from "@playwright/test";
import path from "node:path";

const SHOTS = path.join("docs", "phase4");

test.describe("Phase 4 agent + connect", () => {
  test("trust scorecard links to Metric Explorer; Lab is gone", async ({ page }) => {
    await page.goto("/enterprise-demo/trust");
    if (await page.getByRole("heading", { name: /people serving is not configured/i }).isVisible()) {
      test.skip(true, "People serving env is not configured");
    }
    await expect(page.getByTestId("primary-nav")).toContainText("Enterprise Demo");
    await expect(page.getByTestId("primary-nav")).not.toContainText("Lab");
    await expect(page.locator("footer")).not.toContainText("Lab");
    await expect(page.getByTestId("authz-matrix-title")).toContainText("What site visitor can read");
    await expect(page.getByTestId("eval-scorecard")).toBeVisible();
    await expect(page.getByTestId("eval-scorecard-llm-note")).toContainText(
      "LLM usage rate 0 — this run validates the deterministic skeleton path",
    );
    await page.getByRole("link", { name: "Metric Explorer" }).click();
    await expect(page.getByTestId("metric-explorer")).toBeVisible();
    await page.goto("/dataset");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.goto("/about");
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("connect page shows the public demo token disclaimer", async ({ page }) => {
    await page.goto("/connect");
    await expect(page.getByRole("heading", { level: 1, name: /connect your ai via mcp/i })).toBeVisible();
    await expect(page.getByTestId("mcp-token-disclaimer")).toContainText(
      "public demo token · aggregate only · min_cell 50",
    );
    await expect(page.getByText("get_skill_coverage")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/connect.png`, fullPage: true });
  });

  test("try page: trace reveals every layer, permissions differ by identity, runner labels template hypotheses", async ({
    page,
  }) => {
    await page.goto("/try");
    if (await page.getByRole("heading", { name: /people serving is not configured/i }).isVisible()) {
      test.skip(true, "People serving env is not configured");
    }
    for (const id of ["trace-number", "governance-card", "permissions-lab", "analysis-runner", "roadmap-skills"]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }

    // Module 3: the number only becomes "breakable" after every layer is open.
    const reveal = page.getByTestId("trace-reveal-next");
    for (let i = 0; i < 8 && (await reveal.isVisible()); i += 1) {
      await reveal.click();
    }
    await expect(page.getByTestId("trace-incident-bridge")).toBeVisible();

    // Module 1: same question, two identities, live serving. Decisions render for both.
    await page.getByTestId("permissions-run").click();
    await expect(page.getByTestId("permissions-decision")).toHaveCount(2, { timeout: 30000 });
    const decisions = await page.getByTestId("permissions-decision").allInnerTexts();
    expect(decisions.every((d) => /Allowed|Denied|Refused|Withheld/.test(d))).toBe(true);

    // Module 5: stub the agent so the test never spends LLM budget; label must say the model was not used.
    await page.route("**/api/people/ask", async (route) => {
      const posted = route.request().postDataJSON() as { question?: string };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          question: String(posted.question ?? ""),
          supported: true,
          headline: "Engineering trailing-12m annualized voluntary attrition is 16.0% (as-of 2026-08-31).",
          facts: ["Engineering trailing-12m voluntary attrition: 16.0% as of 2026-08-31."],
          interpretation: ["Location concentrations are observed associations."],
          quality_status: "healthy",
          error_state: null,
          withheld: false,
          llm_skipped: "skipped_by_budget",
          critic: { ok: true, failures: [] },
          tools_used: ["get_metric", "get_metric_breakdown"],
          evidence: [],
          freshness: null,
          trace_id: "00000000-0000-4000-8000-000000000042",
          tier: 2,
          trace: { tools: [], latency_ms: 20, llm_skipped: "skipped_by_budget", llm_calls: 0 },
        }),
      });
    });
    await page.getByTestId("analysis-run").click();
    await expect(page.getByTestId("analysis-headline")).toContainText("16.0%");
    await expect(page.getByTestId("analysis-hypotheses-source")).toContainText("Deterministic template");
    await expect(page.getByTestId("analysis-hypotheses-source")).not.toContainText("Model-authored");
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
