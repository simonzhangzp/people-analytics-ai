import { expect, test } from "@playwright/test";

test("marketing routes the workbench and legacy strategy modes distinctly", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /analyze my people data/i }),
  ).toBeVisible();

  await page.getByTestId("hero-workbench").click();
  await expect(page).toHaveURL(/\/workbench\//);
  await expect(page.getByTestId("workbench-file-dropzone")).toBeVisible();

  await page.goto("/");
  await page.getByTestId("hero-strategy").click();
  await expect(page).toHaveURL(/\/workspace\/demo\/strategy/);

  await page.goto("/demo");
  await expect(page).toHaveURL(/\/workbench\/demo/);
});

