import { expect, test } from "@playwright/test";

test("users can write a custom problem and skip targets", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto("/workspace/demo/strategy");
  await page.getByTestId("intent-problem").click();
  await page.getByTestId("custom-title").fill("Headcount is drifting from plan");
  await page.getByTestId("custom-statement").fill(
    "Monthly headcount is over plan in some units and under in others. We need a measurable workforce-planning question.",
  );
  await page.getByTestId("submit-custom-brief").click();
  await expect(page.getByTestId("strategy-brief")).toContainText(/headcount|workforce/i);
  await expect(page.getByTestId("metric-proposals")).toBeVisible();
  await page.getByTestId("skip-targets").click();
  await page.getByTestId("approve-strategy").click();
  await expect(page.getByTestId("continue-measurement")).toBeVisible();
  await page.getByTestId("continue-measurement").click();
  await expect(page).toHaveURL(/\/measurement/);
  await expect(page.getByText(/skipped for now/i)).toBeVisible();
});
