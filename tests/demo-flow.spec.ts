import { expect, test } from "@playwright/test";

test("lab still routes file-analysis experiments", async ({ page }) => {
  await page.goto("/lab");
  await expect(page.getByRole("heading", { name: /earlier file-based/i })).toBeVisible();
  await page.getByRole("link", { name: "Measurement strategy experiment" }).click();
  await expect(page).toHaveURL(/\/workspace\/demo\/strategy/);

  await page.goto("/demo");
  await expect(page).toHaveURL(/\/workbench\/demo/);
});
