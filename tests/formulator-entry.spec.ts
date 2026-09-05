import { expect, test } from "@playwright/test";

test("analyze entry explains server storage and keeps a local fallback", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page.getByText(/stored in the formulator workspace/i),
  ).toBeVisible();
  await expect(page.getByTestId("formulator-local-fallback")).toBeVisible();
  await page.getByTestId("formulator-local-fallback").click();
  await expect(page).toHaveURL(/\/workbench\//);
  await expect(page.getByTestId("workbench-file-dropzone")).toBeVisible();
});
