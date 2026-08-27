import { expect, type Page } from "@playwright/test";

export async function completeStrategyStep(page: Page) {
  await expect(page.getByRole("heading", { name: /strategy or a problem/i })).toBeVisible();
  await page.getByTestId("intent-strategy").click();
  await page.getByTestId("catalog-search").fill("Time to Fill");
  await page.getByTestId("catalog-item-ta-speed-01").click();
  await expect(page.getByTestId("metric-proposals")).toBeVisible();
  await expect(page.getByTestId("strategy-brief")).toContainText(/Time to Fill/i);
  await page.getByTestId("skip-targets").click();
  await page.getByTestId("approve-strategy").click();
  await expect(page.getByTestId("continue-measurement")).toBeVisible();
}
