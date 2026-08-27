import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

test("ask a talent-review file, confirm definitions, and generate insights", async ({
  page,
}) => {
  await page.goto("/ask");
  await expect(page.getByRole("heading", { name: /ask a question/i })).toBeVisible();
  await expect(page.getByText(/raw people rows stay in this browser/i)).toBeVisible();

  await page.getByTestId("ask-file-input").setInputFiles([
    path.resolve("tests/fixtures/talent-review-sample.csv"),
  ]);
  await expect(page.getByTestId("ask-question")).toHaveValue(/talent review/i);

  await page.getByTestId("ask-analyze").click();
  await expect(page.getByTestId("ask-progress")).toBeVisible();
  await expect(page.getByTestId("ask-file-brief")).toContainText(/talent review/i, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("ask-quality-score")).toBeVisible();
  await expect(page.getByTestId("ask-takeaway")).toBeVisible();
  await expect(page.getByTestId("ask-evidence")).toContainText(/columns used/i);
  await expect(page.getByTestId("ask-evidence")).toContainText(/Talent Review/);
  await expect(page.getByText(/assumption/i).first()).toBeVisible();

  await page.getByRole("radio", { name: /active assignments only/i }).check();
  await page.getByTestId("apply-definitions").click();
  await expect(page.getByTestId("ask-answer")).toContainText(/approved/i, { timeout: 15_000 });

  await page.getByTestId("generate-insights").click();
  await expect(page.getByTestId("ask-insights")).toBeVisible();
  await expect(page.getByTestId("ask-insights")).toContainText(/review coverage/i);
});

test("analyzes a similar talent-review Excel workbook when present", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const workbook = path.resolve(
    "D:/Work Material/Red Hat/RH_PM_Talent_Review_Report_040419_FY19.xlsx",
  );
  test.skip(!existsSync(workbook), "Red Hat talent review workbook is not on this machine");

  await page.goto("/ask");
  await page.getByTestId("ask-file-input").setInputFiles([workbook]);
  await expect(page.getByTestId("ask-question")).toHaveValue(/talent review/i);
  await page.getByTestId("ask-analyze").click();
  await expect(page.getByTestId("ask-file-brief")).toContainText(/13,151|talent review/i, {
    timeout: 45_000,
  });
  await expect(page.getByTestId("ask-evidence")).toContainText(/Overall Performance/);
  await expect(page.getByTestId("ask-takeaway")).toContainText(/21\.6%|2,840/);
  await page.getByTestId("generate-insights").click();
  await expect(page.getByTestId("ask-insights")).toContainText(/review coverage/i);
});

test("answers headcount distribution from a snapshot file", async ({ page }) => {
  await page.goto("/ask");
  await page.getByTestId("ask-file-input").setInputFiles([
    path.resolve("tests/fixtures/vdm-headcount-snapshot.csv"),
  ]);
  await expect(page.getByTestId("ask-question")).toHaveValue(/headcount distributed/i);
  await page.getByTestId("ask-analyze").click();
  await expect(page.getByTestId("ask-takeaway")).toContainText(/snapshot month|workforce status|country/i, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("ask-evidence")).toContainText(/record_month|data_flag|country/i);
  await page.getByTestId("generate-insights").click();
  await expect(page.getByTestId("ask-insights")).toContainText(/headcount|status|month/i);
});
