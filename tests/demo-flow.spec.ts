import { expect, test } from "@playwright/test";
import path from "node:path";
import { completeStrategyStep } from "./helpers";

test("uploaded People data drives the full strategy-to-action workflow", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /measurement system/i })).toBeVisible();

  await page.getByTestId("hero-demo").click();
  await expect(page).toHaveURL(/\/workspace\/demo\/strategy/);
  await completeStrategyStep(page);
  await page.getByTestId("continue-measurement").click();
  await expect(page).toHaveURL(/\/measurement/);

  await page.getByTestId("review-metric").click();
  await page.getByTestId("continue-data").click();
  await expect(page).toHaveURL(/\/data/);

  await page.getByTestId("people-file-input").setInputFiles([
    path.resolve("sample_data/ibm_bpo_recruiting_candidates.csv"),
    path.resolve("sample_data/ibm_employee_attrition.csv"),
  ]);
  await expect(page.getByTestId("uploaded-data-summary")).toContainText(
    /2 files.*rows processed locally/i,
    { timeout: 45_000 },
  );

  await page.getByTestId("confirm-mapping").click();
  await page.getByTestId("continue-analysis").click();
  await expect(page).toHaveURL(/\/analysis/);

  await expect(page.getByTestId("metric-dashboards")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("analysis-chart")).toBeVisible();
  await expect(page.getByTestId("dashboard-sentence").first()).toBeVisible();
  await expect(page.getByTestId("dashboard-card-time_to_fill")).toContainText(
    /Time to Hire|cannot be calculated/i,
  );
  await page.getByTestId("run-analysis").click();
  await expect(page.getByTestId("local-analysis-summary")).toContainText(/Time to Hire/i);
  await expect(page.getByTestId("analysis-result")).toContainText(
    /uploaded data.*local calculation/i,
  );

  await page.getByTestId("continue-story").click();
  await expect(page).toHaveURL(/\/story/);
  await page.getByTestId("generate-story").click();
  await expect(page.getByTestId("story-deck")).toContainText(/Time to Hire/i);

  await page.getByTestId("continue-actions").click();
  await expect(page).toHaveURL(/\/actions/);
  await page.getByTestId("create-pilot").click();
  await expect(page.getByTestId("action-card")).toContainText(/pilot created|approved/i);
});
