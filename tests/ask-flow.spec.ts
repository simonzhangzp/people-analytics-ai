import { expect, test } from "@playwright/test";

test("legacy Ask entry opens an empty persistent workbench", async ({ page }) => {
  await page.goto("/ask");
  await expect(page).toHaveURL(/\/workbench\/(new|[a-z0-9-]+)/i);
  await expect(
    page.getByRole("heading", {
      name: /what can these people files answer credibly/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/raw people rows stay in this browser/i).first()).toBeVisible();
  await expect(page.getByTestId("workbench-file-dropzone")).toBeVisible();
});

