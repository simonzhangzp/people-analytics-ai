import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

interface ManifestEntry {
  id: string;
  fileName: string;
  domain: string;
}

const root = path.resolve(import.meta.dirname, "..", "..");
const manifest = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "manifest.json"), "utf8"),
) as {
  cacheDirectory: string;
  files: ManifestEntry[];
};
const cache = path.join(root, manifest.cacheDirectory);
const hasCache = manifest.files.every((entry) =>
  existsSync(path.join(cache, entry.fileName)),
);
const questions: Record<string, string> = {
  workforce: "What is the observed workforce headcount?",
  retention: "How many retention exits are observed?",
  recruiting: "How much recruiting application activity is observed?",
  compensation: "What is the observed compensation pay gap?",
  performance: "What is the performance rating distribution?",
  absence: "What is the observed absence rate?",
  engagement: "What is the observed engagement survey score?",
  learning: "What is the learning completion or pass rate?",
  mobility: "How many internal mobility movements are observed?",
  diversity: "What is the diversity representation mix?",
};

test.skip(!hasCache, "Run npm run external:fetch to populate ignored files.");

test("ingests and executes all ten pinned external HR schemas", async ({
  page,
}) => {
  test.setTimeout(360_000);

  for (const [index, entry] of manifest.files.entries()) {
    await test.step(entry.id, async () => {
      await page.goto(`/workbench/external-${entry.id}-${index}`);
      await page
        .getByTestId("workbench-file-input")
        .setInputFiles(path.join(cache, entry.fileName));
      await expect(page.getByText(entry.fileName).first()).toBeVisible({
        timeout: 90_000,
      });
      await expect(
        page.getByTestId(`capability-${entry.domain}`),
      ).toContainText("Runnable");
      await expect(
        page.getByText("Local SQL used a compatibility parser"),
      ).toHaveCount(0);

      await page
        .getByTestId("workbench-question")
        .fill(questions[entry.domain] ?? `Summarize ${entry.domain}.`);
      await page.getByTestId("ask-workbench-question").click();
      await expect(page.getByTestId("continue-to-analysis")).toBeEnabled();
      await page.getByTestId("continue-to-analysis").click();
      await page.getByTestId("run-analysis-plan").click();
      await expect(page.getByText("1 validated · 0 data gaps")).toBeVisible({
        timeout: 60_000,
      });
    });
  }
});
