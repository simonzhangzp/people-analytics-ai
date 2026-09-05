import fs from "node:fs";
import { expect, test } from "@playwright/test";

const TENCENT_MBA =
  "E:\\Personal\\Old Work Files\\腾讯COE资料\\人员信息\\腾讯MBA学位LIST.xlsx";
const HEADCOUNT_WFUTURE =
  "D:\\Work Material\\Red Hat\\Python Model\\Workforce Planning\\preprocessor\\headcount_Wfuture.csv";

test.describe("cruel People file acceptance", () => {
  test("Test A: Tencent MBA list answers in one turn then leadership", async ({
    page,
  }) => {
    test.skip(!fs.existsSync(TENCENT_MBA), "Tencent MBA workbook is not on this machine.");
    test.setTimeout(180_000);
    await page.goto("/workbench/tencent-mba");
    await page.getByTestId("workbench-file-input").setInputFiles(TENCENT_MBA);
    await expect(page.getByText(/腾讯MBA学位LIST/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId("workbench-question").fill(
      "用A列作为员工ID。告诉我HC，以及gender、nationality、org、level等主要cut。什么样的员工最典型？",
    );
    await page.getByTestId("ask-workbench-question").click();
    await expect(page.getByTestId("thread-answer").first()).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText(/typical observed employee profile/i)).toBeVisible();
    await expect
      .poll(async () => page.locator('[data-chart-engine="flint"] svg').count())
      .toBeGreaterThanOrEqual(3);
    await expect(page.getByText(/metric studio|agree on definitions/i)).toHaveCount(0);
    await page.getByTestId("workbench-question").fill("show me leadership only");
    await page.getByTestId("ask-workbench-question").click();
    await expect(page.getByTestId("data-thread-turn")).toHaveCount(2);
    await expect(page.getByTestId("thread-answer").nth(1)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/Catalog Error:/i)).toHaveCount(0);
  });

  test("Test B: aggregated snapshot uses SUM(headcount) then continues", async ({
    page,
  }) => {
    test.skip(
      !fs.existsSync(HEADCOUNT_WFUTURE),
      "headcount_Wfuture.csv is not on this machine.",
    );
    test.setTimeout(240_000);
    await page.goto("/workbench/headcount-wfuture");
    await page.getByTestId("workbench-file-input").setInputFiles(HEADCOUNT_WFUTURE);
    await expect(page.getByText(/headcount_Wfuture/i).first()).toBeVisible({
      timeout: 120_000,
    });
    await page.getByTestId("workbench-question").fill("headcount by country");
    await page.getByTestId("ask-workbench-question").click();
    const first = page.getByTestId("thread-answer").first();
    await expect(first).toContainText(/headcount by country/i, {
      timeout: 90_000,
    });
    await expect(page.getByTestId("answer-method").first()).toContainText(
      /sum of headcount/i,
    );
    await expect(page.getByTestId("answer-method").first()).toContainText(
      /latest populated snapshot/i,
    );
    await page.getByTestId("workbench-question").fill("show top 10");
    await page.getByTestId("ask-workbench-question").click();
    await expect(page.getByTestId("answer-method").nth(1)).toContainText(
      /top 10/i,
      { timeout: 60_000 },
    );
    await page.getByTestId("workbench-question").fill("show US and India trend");
    await page.getByTestId("ask-workbench-question").click();
    await expect(page.getByTestId("thread-answer").nth(2)).toContainText(
      /trend/i,
      { timeout: 60_000 },
    );
    await expect(
      page.getByTestId("thread-answer").nth(2).locator('[data-chart-engine="flint"] svg'),
    ).toBeVisible();
    await page
      .getByTestId("workbench-question")
      .fill("where did India growth come from?");
    await page.getByTestId("ask-workbench-question").click();
    await expect(page.getByTestId("data-thread-turn")).toHaveCount(4);
    await expect(page.getByTestId("thread-answer").last()).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText(/Catalog Error:/i)).toHaveCount(0);
  });
});
