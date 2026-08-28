import { expect, test } from "@playwright/test";

test.describe("People Analytics Workbench Phase 1", () => {
  test("completes the guided attrition vertical slice", async ({ page }) => {
    test.setTimeout(180_000);
    const aiBodies: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/workbench/ai") && request.method() === "POST") {
        aiBodies.push(request.postData() ?? "");
      }
    });

    await page.goto("/demo");
    await expect(page).toHaveURL(/\/workbench\/demo/);
    await expect(
      page.getByRole("heading", {
        name: /can these files answer an attrition question credibly/i,
      }),
    ).toBeVisible();
    await expect(page.getByText("monthly_headcount.xlsx").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("terminations.csv").first()).toBeVisible();
    await expect(page.getByText("compensation.xlsx").first()).toBeVisible();
    await expect(page.getByText(/relationship evidence/i)).toBeVisible();
    await expect(page.getByText(/coverage/i).first()).toBeVisible();
    await expect(page.getByText(/raw data never uploaded/i)).toBeVisible();

    await expect(page.getByTestId("workbench-question")).toHaveValue(
      "Why has Engineering voluntary attrition increased?",
    );
    await page.getByTestId("ask-workbench-question").click();

    await expect(page.getByTestId("metric-ambiguity")).toBeVisible();
    await expect(page.getByText(/whether retirement/i).first()).toBeVisible();
    await page.getByLabel(/definition instruction/i).fill(
      "Treat retirement separately and use beginning headcount.",
    );
    await page.getByTestId("propose-metric-change").click();
    await expect(page.getByTestId("metric-diff")).toBeVisible();
    await expect(page.getByTestId("metric-diff")).toContainText(/retirement/i);
    await page.getByTestId("apply-metric-change").click();
    await expect(page.getByText(/version 2/i).first()).toBeVisible();

    await page.getByTestId("continue-to-analysis").click();
    await expect(page.getByText(/analysis plan/i).first()).toBeVisible();
    await page.getByTestId("run-analysis-plan").click();
    await expect(page.getByTestId("insight-trend")).toContainText(/\+4\.5|4\.5pp/i, {
      timeout: 60_000,
    });
    await expect(
      page.getByText("Guided demo aggregate fallback used"),
    ).toHaveCount(0);

    await page.getByRole("button", { name: /break down by tenure/i }).click();
    await expect(page.getByTestId("insight-tenure")).toContainText(/68%|2–4|2-4/i, {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /compare compensation/i }).last().click();
    await expect(page.getByTestId("insight-compensation")).toContainText(
      /association|midpoint|positioning/i,
      { timeout: 30_000 },
    );
    await expect(page.getByText(/manager effectiveness.*(absent|cannot|missing)/i).first()).toBeVisible();

    await page.getByRole("button", { name: /explore data/i }).click();
    await expect(page.getByRole("heading", { name: /explore local aggregate data/i })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/exploration stays in this browser/i)).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    for (const testId of [
      "insight-trend",
      "insight-tenure",
      "insight-compensation",
    ]) {
      const card = page.getByTestId(testId);
      const addButton = card.getByRole("button", { name: /add to story/i });
      if (await addButton.isVisible()) await addButton.click();
    }

    await page.getByTestId("continue-to-story").click();
    await page.getByLabel(/audience/i).selectOption("CHRO");
    await page.getByRole("button", { name: "5 slides" }).click();
    await page.getByTestId("generate-story").click();
    await expect(page.getByText("5 editable slides")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("download-pptx").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pptx$/i);

    for (const body of aiBodies) {
      expect(body).not.toMatch(/"rows"|"rawRows"|"sampleValues"/i);
      expect(body).not.toContain("E02001");
    }
  });

  test("uses drawers instead of preserving desktop columns on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workbench/new");
    const dataButton = page.getByRole("button", { name: /open data workspace/i });
    await expect(dataButton).toBeVisible();
    await dataButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("navigation", { name: /workbench navigation/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dataButton).toBeFocused();

    const aiButton = page.getByRole("button", { name: /open ai co-designer/i });
    await expect(aiButton).toBeVisible();
    await aiButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "AI Co-Designer" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(aiButton).toBeFocused();
  });
});

