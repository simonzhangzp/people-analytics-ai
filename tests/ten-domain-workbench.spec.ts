import path from "node:path";
import { expect, test } from "@playwright/test";

const CASES = [
  {
    domain: "workforce",
    fileName: "workforce.csv",
    question: "What is the observed workforce headcount by period?",
  },
  {
    domain: "retention",
    fileName: "retention.csv",
    question: "How many retention exits are observed?",
  },
  {
    domain: "recruiting",
    fileName: "recruiting.csv",
    question: "How many recruiting applications are observed?",
  },
  {
    domain: "compensation",
    fileName: "compensation.csv",
    question: "What is the observed average compensation?",
  },
  {
    domain: "performance",
    fileName: "performance.csv",
    question: "What is the performance rating distribution?",
  },
  {
    domain: "absence",
    fileName: "absence.csv",
    question: "How much employee absence is observed?",
  },
  {
    domain: "engagement",
    fileName: "engagement.csv",
    question: "What is the observed engagement score?",
  },
  {
    domain: "learning",
    fileName: "learning.csv",
    question: "What is the learning course completion rate?",
  },
  {
    domain: "mobility",
    fileName: "mobility.csv",
    question: "How many internal mobility events are observed?",
  },
  {
    domain: "diversity",
    fileName: "diversity.csv",
    question: "What is the diversity representation mix?",
  },
] as const;

test("runs one deterministic browser path for all ten HR domains", async ({
  page,
}) => {
  test.setTimeout(300_000);

  for (const [index, item] of CASES.entries()) {
    await test.step(item.domain, async () => {
      await page.goto(`/workbench/browser-${item.domain}-${index}`);
      await page
        .getByTestId("workbench-file-input")
        .setInputFiles(
          path.resolve(
            process.cwd(),
            "tests",
            "fixtures",
            "hr",
            item.fileName,
          ),
        );
      await expect(page.getByText(item.fileName).first()).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        page.getByTestId(`capability-${item.domain}`),
      ).toContainText("Runnable");

      await page.getByTestId("workbench-question").fill(item.question);
      await page.getByTestId("ask-workbench-question").click();
      await expect(page.getByTestId("continue-to-analysis")).toBeEnabled();
      await page.getByTestId("continue-to-analysis").click();
      await expect(page.getByTestId("run-analysis-plan")).toBeVisible();
      await page.getByTestId("run-analysis-plan").click();
      await expect(page.getByText("1 validated · 0 data gaps")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Deterministic result")).toBeVisible();
    });
  }
});
