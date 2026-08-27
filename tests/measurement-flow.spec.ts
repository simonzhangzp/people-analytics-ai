import { expect, test } from "@playwright/test";
import { completeStrategyStep } from "./helpers";

test("users can add a library metric and a custom metric to the plan", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto("/workspace/demo/strategy");
  await completeStrategyStep(page);
  await page.getByTestId("continue-measurement").click();
  await expect(page).toHaveURL(/\/measurement/);
  await expect(page.getByTestId("measurement-plan")).toContainText(/Time to Fill/i);

  await page.getByTestId("metric-search").fill("eNPS");
  await page.getByTestId("metric-item-enps").click();
  await expect(page.getByTestId("measurement-plan")).toContainText(/eNPS/i);

  await page.getByTestId("custom-metric-name").fill("Manager slate review SLA");
  await page.getByTestId("custom-metric-definition").fill(
    "Share of slates reviewed by the hiring manager within three days.",
  );
  await page.getByTestId("custom-metric-standard").fill("Completed slates only.");
  await page.getByTestId("submit-custom-metric").click();
  await expect(page.getByTestId("measurement-plan")).toContainText(
    /Manager slate review SLA/i,
  );

  await page.getByTestId("review-metric").click();
  await expect(page.getByTestId("continue-data")).toBeVisible();
});
