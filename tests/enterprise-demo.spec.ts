import { expect, test } from "@playwright/test";

const SHOTS = "test-results/enterprise-demo";

test.describe("recruiter enterprise demo", () => {
  test("landing shows three case studies and portfolio context", async ({ page }) => {
    await page.goto("/enterprise-demo");
    if (await page.getByRole("heading", { name: /people serving is not configured/i }).isVisible()) {
      test.skip(true, "People serving env is not configured in this environment");
    }

    await expect(page.getByTestId("synthetic-label")).toContainText(
      "Synthetic Enterprise People Dataset",
    );
    await expect(page.getByRole("heading", { name: /trusted workforce numbers/i })).toBeVisible();
    await expect(page.getByTestId("case-card-trust")).toBeVisible();
    await expect(page.getByTestId("case-card-incident")).toBeVisible();
    await expect(page.getByTestId("case-card-attrition")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByTestId("why-i-built-this")).toContainText("Why I built this");
    await page.screenshot({ path: `${SHOTS}/landing.png`, fullPage: true });
  });

  test("case 1 shows trusted Engineering headcount", async ({ page }) => {
    await page.goto("/enterprise-demo/trust");
    if (await page.getByRole("heading", { name: /people serving is not configured/i }).isVisible()) {
      test.skip(true, "People serving env is not configured in this environment");
    }

    await expect(page.getByRole("heading", { name: /can i trust engineering headcount/i })).toBeVisible();
    await expect(page.getByTestId("engineering-headcount")).not.toHaveText("—");
    await expect(page.getByTestId("trust-indicators")).toContainText("Certified");
    await expect(page.getByTestId("trust-indicators")).toContainText("Fresh");
    await expect(page.getByTestId("trust-indicators")).toContainText("Healthy");
    await expect(page.getByTestId("quality-unhealthy")).toHaveCount(0);
    await expect(page.getByTestId("quality-tests")).not.toContainText("apac_hris_volume");
    await expect(page.getByTestId("historical-incidents")).toBeVisible();
    await expect(page.getByTestId("trust-lineage")).toContainText("Certified Headcount");
    await expect(page.getByTestId("trust-lineage")).not.toContainText("Mobility");
    await expect(page.locator("body")).not.toContainText("Formulator analysis server");
    await expect(page.getByTestId("metric-definition-trigger")).toBeVisible();
    await expect(page.getByText("Ask a follow-up")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/trust.png`, fullPage: true });
  });

  test("case 2 replays APAC as a data issue", async ({ page }) => {
    await page.goto("/enterprise-demo/incident");
    if (await page.getByRole("heading", { name: /people serving is not configured/i }).isVisible()) {
      test.skip(true, "People serving env is not configured in this environment");
    }

    await expect(page.getByTestId("apac-incident")).toBeVisible();
    await expect(page.getByTestId("incident-data-issue")).toContainText(
      "This is a data issue — not a workforce change.",
    );
    await expect(page.getByText("84,508").first()).toBeVisible();
    await expect(page.getByText("67,936").first()).toBeVisible();
    await expect(page.getByTestId("pipeline-status")).toContainText("Failed");
    await expect(page.getByTestId("replay-lineage")).toContainText("FAILED");
    await expect(page.getByTestId("replay-lineage")).toContainText("BLOCKED");
    await expect(page.getByTestId("replay-lineage")).toContainText("UNHEALTHY");
    await expect(page.getByTestId("replay-lineage")).toContainText("NOT PUBLISHED");
    await expect(
      page.getByText(/prevented incomplete source data from being published/i),
    ).toBeVisible();
    await expect(page.getByText(/historical replay/i)).toBeVisible();

    await page.getByRole("button", { name: "Why did APAC headcount drop?" }).click();
    await expect(page.getByTestId("people-ai-answer")).toContainText(/data issue/i, {
      timeout: 30_000,
    });
    await page.screenshot({ path: `${SHOTS}/incident.png`, fullPage: true });
  });

  test("case 3 tells an attrition story with skills inside it", async ({ page }) => {
    await page.goto("/enterprise-demo/attrition");
    if (await page.getByRole("heading", { name: /people serving is not configured/i }).isVisible()) {
      test.skip(true, "People serving env is not configured in this environment");
    }

    await expect(
      page.getByRole("heading", { name: /why is engineering voluntary attrition increasing/i }),
    ).toBeVisible();
    await expect(page.getByTestId("observed-evidence")).toBeVisible();
    await expect(page.getByTestId("unknown-evidence")).toBeVisible();
    await expect(page.getByText(/hypotheses, not proven causes/i)).toBeVisible();
    await expect(page.getByTestId("attrition-trend")).toHaveAttribute("data-empty", "false");
    await expect(page.getByTestId("attrition-trend-point")).toHaveCount(24);
    await expect(page.getByTestId("attrition-trend-scenario")).toContainText(/2026-03 scenario start/i);
    await expect(page.getByTestId("headline-visible-cells")).toContainText(
      "based on cells visible at this access level",
    );
    await expect(page.getByTestId("case3-headline")).toContainText("APAC-SIN");
    await expect(page.getByTestId("location-tenure").locator("li").first()).toContainText("APAC-SIN");
    await expect(page.getByTestId("min-cell-hidden")).toContainText(/44 cells hidden under min-cell/i);
    await expect(page.getByTestId("unknown-evidence")).toBeVisible();
    await expect(page.getByText(/hypotheses, not proven causes/i)).toBeVisible();
    await expect(page.getByTestId("skills-learning")).toContainText("Could we build critical skills internally?");
    await expect(page.getByTestId("skills-learning")).toContainText("O*NET: Public");
    await expect(page.getByTestId("skills-learning")).toContainText("Microsoft Learn: Public");
    await expect(page.getByTestId("learning-recs")).not.toContainText(/minecraft|makecode|Phase 4/i);
    await expect(page.getByTestId("learning-recs").locator("a")).toHaveCount(5);
    await expect(page.getByTestId("learning-recs").locator("a").first()).toHaveAttribute(
      "href",
      /learn\.microsoft\.com/,
    );
    await expect(page.getByTestId("breakdown-window")).toContainText("trailing-12m (annualized)");
    await expect(page.getByText("What I would investigate next")).toBeVisible();
    await expect(page.getByText("Ask a follow-up")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/attrition.png`, fullPage: true });
  });

  test("architecture remains secondary for technical reviewers", async ({ page }) => {
    await page.goto("/architecture");
    await expect(page.getByTestId("people-data-platform")).toContainText("Bronze / silver / gold");
    await expect(page.getByTestId("people-data-platform")).toContainText("metric registry");
    await expect(page.getByTestId("people-data-platform")).toContainText("serving layer");
    await expect(page.getByTestId("transfer-lineage")).toContainText("Employee Transfer");
    await expect(page.locator("body")).not.toContainText("Hetzner");
    await expect(page.locator("body")).not.toContainText("QuantReview");
    await page.screenshot({ path: `${SHOTS}/architecture.png`, fullPage: true });
  });

  test("case 3 role switch changes suppression", async ({ page }) => {
    await page.goto("/enterprise-demo/attrition");
    if (await page.getByRole("heading", { name: /people serving is not configured/i }).isVisible()) {
      test.skip(true, "People serving env is not configured in this environment");
    }
    const visitor = await page.getByTestId("suppression-summary").innerText();
    const visitorList = await page.getByTestId("location-tenure").locator("li").first().innerText();
    expect(visitorList).toMatch(/APAC-SIN/);
    await page.getByTestId("demo-identity").selectOption("demo-people-analyst");
    await expect(page.getByTestId("suppression-summary")).not.toHaveText(visitor, { timeout: 30_000 });
    await expect(page.getByTestId("case3-headline")).toContainText("APAC-SIN");
    await expect(page.getByTestId("location-tenure").locator("li").first()).toContainText("APAC-SIN");
    await expect(page.getByTestId("min-cell-hidden")).toContainText(/30 cells hidden under min-cell/i);
  });
});
