import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { completeStrategyStep } from "./helpers";

async function walkToData(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto("/strategy");
  await completeStrategyStep(page);
  await page.getByTestId("continue-measurement").click();
  await page.getByTestId("review-metric").click();
  await page.getByTestId("continue-data").click();
  await expect(page).toHaveURL(/\/data/);
}

test("snapshot fixture drives headcount analysis through story and action", async ({
  page,
}) => {
  await walkToData(page);
  await page.getByTestId("people-file-input").setInputFiles([
    path.resolve("tests/fixtures/vdm-headcount-snapshot.csv"),
  ]);
  await expect(page.getByTestId("uploaded-data-summary")).toContainText(
    /1 files.*rows processed locally/i,
    { timeout: 30_000 },
  );
  await expect(page.getByRole("cell", { name: "Employee Snapshot" })).toBeVisible();

  await page.getByTestId("confirm-mapping").click();
  await page.getByTestId("continue-analysis").click();
  await expect(page.getByTestId("metric-dashboards")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("analysis-chart")).toBeVisible();
  await expect(page.getByTestId("dashboard-card-time_to_fill")).toContainText(
    /cannot be calculated/i,
  );
  await page.getByTestId("run-analysis").click();
  await expect(page.getByTestId("local-analysis-summary")).toContainText(/Headcount/i);
  await expect(page.getByTestId("analysis-result")).toContainText(/Time to Fill/i);

  await page.getByTestId("continue-story").click();
  await page.getByTestId("generate-story").click();
  await expect(page.getByTestId("story-deck")).toContainText(/headcount/i);

  await page.getByTestId("continue-actions").click();
  await page.getByTestId("create-pilot").click();
  await expect(page.getByTestId("action-card")).toContainText(
    /Time to Fill|requisition|evidence gap/i,
  );
});

const hireExtract = path.resolve(
  "sample_data/vdm_headcount_month_f_202206291451.csv",
);
const roster = path.resolve("sample_data/vdm_headcount_month_f_202210121724.csv");

test("real VDM UTF-32 extracts profile and reach an evidence-linked action", async ({
  page,
}) => {
  test.skip(
    !existsSync(hireExtract) || !existsSync(roster),
    "Local VDM extracts are not present",
  );
  test.setTimeout(90_000);

  await walkToData(page);
  await page.getByTestId("people-file-input").setInputFiles([hireExtract, roster]);
  await expect(page.getByTestId("uploaded-data-summary")).toContainText(
    /2 files.*rows processed locally/i,
    { timeout: 75_000 },
  );
  await expect(page.getByRole("cell", { name: "Employee Hire Extract" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Employee Roster" })).toBeVisible();
  await expect(page.getByText("utf-32be").first()).toBeVisible();

  await page.getByTestId("confirm-mapping").click();
  await page.getByTestId("continue-analysis").click();
  await expect(page.getByTestId("metric-dashboards")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("dashboard-sentence").first()).toBeVisible();
  await page.getByTestId("run-analysis").click();
  await expect(page.getByTestId("local-analysis-summary")).toContainText(
    /Workforce mix|Headcount/i,
  );

  await page.getByTestId("continue-story").click();
  await page.getByTestId("generate-story").click();
  await expect(page.getByTestId("story-deck")).toBeVisible();

  await page.getByTestId("continue-actions").click();
  await page.getByTestId("create-pilot").click();
  await expect(page.getByTestId("action-card")).toContainText(
    /Time to Fill|evidence gap|requisition/i,
  );
});
