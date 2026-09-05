import path from "node:path";
import { expect, test } from "@playwright/test";

test("answers a simple aggregate headcount question in one Data Thread", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/workbench/direct-headcount");
  await page
    .getByTestId("workbench-file-input")
    .setInputFiles(
      path.resolve(
        process.cwd(),
        "tests",
        "fixtures",
        "hr",
        "aggregate-headcount.csv",
      ),
    );
  await expect(page.getByText("aggregate-headcount.csv").first()).toBeVisible({
    timeout: 60_000,
  });

  await page
    .getByTestId("workbench-question")
    .fill("headcount by different country");
  await page.getByTestId("ask-workbench-question").click();

  const firstAnswer = page.getByTestId("thread-answer").first();
  await expect(firstAnswer).toContainText("Headcount by Country", {
    timeout: 30_000,
  });
  await expect(firstAnswer).toContainText("US is the largest observed group");
  await expect(firstAnswer).toContainText("100");
  await expect(firstAnswer.locator('[data-chart-engine="flint"] svg')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("answer-method").first()).toContainText(
    /sum of headcount/i,
  );
  await expect(page.getByTestId("workbench-nav-metrics")).toHaveCount(0);
  await expect(page.getByTestId("workbench-nav-analysis")).toHaveCount(0);

  await page
    .getByTestId("workbench-question")
    .fill("show me the trend of US vs India");
  await page.getByTestId("ask-workbench-question").click();
  await expect(page.getByTestId("data-thread-turn")).toHaveCount(2);
  await expect(page.getByTestId("thread-answer").nth(1)).toContainText(
    "Headcount trend by Country",
    { timeout: 30_000 },
  );

  await page
    .getByTestId("data-thread-turn")
    .first()
    .getByRole("button", { name: /branch from here/i })
    .click();
  await expect(
    page.getByRole("heading", { name: /branching from answer 1/i }),
  ).toBeVisible();
  await page
    .getByTestId("workbench-question")
    .fill("show the headcount trend");
  await page.getByTestId("ask-workbench-question").click();
  await expect(page.getByTestId("data-thread-turn")).toHaveCount(3);
  await expect(
    page.getByTestId("data-thread-turn").nth(2).getByText(/branched from an earlier answer/i),
  ).toBeVisible();
});

test("answers a workforce profile question with aggregate demographic cuts", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/workbench/mba-profile");
  await page
    .getByTestId("workbench-file-input")
    .setInputFiles(
      path.resolve(process.cwd(), "tests", "fixtures", "hr", "mba-profile.csv"),
    );
  await expect(page.getByText("mba-profile.csv").first()).toBeVisible({
    timeout: 60_000,
  });
  await page.getByTestId("workbench-question").fill(
    "用A列作为员工ID。告诉我HC，以及gender、nationality、org、level等主要cut。什么样的员工最典型？",
  );
  await page.getByTestId("ask-workbench-question").click();
  const answer = page.getByTestId("thread-answer").first();
  await expect(answer).toContainText(/typical observed employee profile/i, {
    timeout: 45_000,
  });
  await expect
    .poll(async () => page.getByTestId("thread-answer").count())
    .toBeGreaterThanOrEqual(4);
  await expect
    .poll(async () => page.locator('[data-chart-engine="flint"] svg').count())
    .toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId("answer-method").first()).toContainText(
    /count distinct/i,
  );
  await page.getByTestId("workbench-question").fill("show me leadership only");
  await page.getByTestId("ask-workbench-question").click();
  await expect(page.getByTestId("data-thread-turn")).toHaveCount(2);
  await expect(page.getByTestId("answer-method").nth(1)).toContainText(
    /leadership only/i,
    { timeout: 30_000 },
  );
});

test("reattaches session-only rows after reload without exposing SQL errors", async ({
  page,
}) => {
  const workspaceId = "reattach-headcount";
  const fixture = path.resolve(
    process.cwd(),
    "tests",
    "fixtures",
    "hr",
    "aggregate-headcount.csv",
  );
  await page.goto(`/workbench/${workspaceId}`);
  await page.evaluate(
    (key) => window.localStorage.removeItem(key),
    `people-workbench:${workspaceId}`,
  );
  await page.reload();
  await page.getByTestId("workbench-file-input").setInputFiles(fixture);
  await expect(page.getByText("aggregate-headcount.csv").first()).toBeVisible({
    timeout: 30_000,
  });
  await page
    .getByTestId("workbench-question")
    .fill("headcount by country");
  await page.getByTestId("ask-workbench-question").click();
  await expect(page.getByTestId("thread-answer").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() =>
      page.evaluate(
        (key) => {
          const value = window.localStorage.getItem(key);
          if (!value) return 0;
          return (
            JSON.parse(value) as { datasetMetadata?: unknown[] }
          ).datasetMetadata?.length ?? 0;
        },
        `people-workbench:${workspaceId}`,
      ),
    )
    .toBe(1);
  await page.evaluate(
    (key) => {
      const value = window.localStorage.getItem(key);
      if (!value) return;
      const saved = JSON.parse(value) as {
        insights: Array<{ finding: string }>;
        thread: Array<{ methodNote?: string }>;
      };
      const technicalMessage =
        'Catalog Error: Table with name "people_old_table" does not exist!';
      saved.insights[0].finding = technicalMessage;
      saved.thread[0].methodNote = technicalMessage;
      window.localStorage.setItem(key, JSON.stringify(saved));
    },
    `people-workbench:${workspaceId}`,
  );

  await page.reload();
  await expect(page.getByTestId("reattach-local-files")).toBeVisible();
  await expect(page.getByTestId("workbench-question")).toBeDisabled();
  await expect(page.getByText(/Catalog Error:/i)).toHaveCount(0);
  await expect(page.getByText(/raw employee rows.*session-only/i).first()).toBeVisible();

  await page.getByTestId("workbench-file-input").setInputFiles(fixture);
  await expect(page.getByTestId("reattach-local-files")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("data-thread-turn")).toHaveCount(1);
  await expect(page.getByTestId("workbench-question")).toBeEnabled();

  await page
    .getByTestId("workbench-question")
    .fill("show the headcount trend");
  await page.getByTestId("ask-workbench-question").click();
  await expect(page.getByTestId("data-thread-turn")).toHaveCount(2);
  await expect(page.getByTestId("thread-answer").nth(1)).toContainText(
    /headcount trend/i,
    { timeout: 30_000 },
  );
  await expect(page.getByText(/Catalog Error:/i)).toHaveCount(0);
});

test("answers Chinese education distribution and value questions directly", async ({
  page,
}) => {
  await page.goto("/workbench/chinese-education");
  await page
    .getByTestId("workbench-file-input")
    .setInputFiles(
      path.resolve(
        process.cwd(),
        "tests",
        "fixtures",
        "hr",
        "chinese-education.csv",
      ),
    );
  await expect(page.getByText("chinese-education.csv").first()).toBeVisible({
    timeout: 30_000,
  });

  await page
    .getByTestId("workbench-question")
    .fill("学位的主要分布情况");
  await page.getByTestId("ask-workbench-question").click();
  await expect(page.getByTestId("thread-answer").first()).toContainText(
    /headcount by academic degree/i,
    { timeout: 30_000 },
  );

  await page.getByTestId("workbench-question").fill("本科学历有多少");
  await page.getByTestId("ask-workbench-question").click();
  await expect(page.getByTestId("thread-answer").nth(1)).toContainText(
    /大学本科 headcount: 2/i,
    { timeout: 30_000 },
  );
  await expect(page.getByText(/Catalog Error:/i)).toHaveCount(0);
});
