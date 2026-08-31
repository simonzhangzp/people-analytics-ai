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
    await expect(page.getByTestId("why-i-built-this")).toContainText("Why I Built This");
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
    await expect(page.getByText("29,700")).toBeVisible();
    await expect(page.getByText("10,395")).toBeVisible();
    await expect(page.getByTestId("pipeline-status")).toContainText("Failed");
    await expect(
      page.getByText(/prevented incomplete source data from being published/i),
    ).toBeVisible();
    await expect(page.getByText(/historical replay/i)).toBeVisible();

    await page.getByRole("button", { name: "Why did APAC headcount drop?" }).click();
    await expect(page.getByTestId("people-ai-answer")).toContainText(
      /data issue/i,
      { timeout: 30_000 },
    );
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
    await expect(page.getByText(/possible explanations/i)).toBeVisible();
    await expect(page.getByText(/hypotheses, not proven causes/i)).toBeVisible();
    await expect(page.getByTestId("skills-learning")).toContainText("Could we build critical skills internally?");
    await expect(page.getByTestId("skills-learning")).toContainText("O*NET: Public");
    await expect(page.getByTestId("skills-learning")).toContainText("Microsoft Learn: Public");
    await expect(page.getByText("What I would investigate next")).toBeVisible();
    await expect(page.getByText("Ask a follow-up")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/attrition.png`, fullPage: true });
  });

  test("architecture remains secondary for technical reviewers", async ({ page }) => {
    await page.goto("/architecture");
    await expect(page.getByTestId("people-data-platform")).toContainText("Bronze / silver / gold");
    await expect(page.getByTestId("people-data-platform")).toContainText("Metric registry");
    await expect(page.getByTestId("people-data-platform")).toContainText("Serving layer");
    await page.screenshot({ path: `${SHOTS}/architecture.png`, fullPage: true });
  });
});
