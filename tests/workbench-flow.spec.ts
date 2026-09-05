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
        name: /ask your people data anything/i,
      }),
    ).toBeVisible();
    await expect(page.getByText("monthly_headcount.xlsx").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("terminations.csv").first()).toBeVisible();
    await expect(page.getByText("compensation.xlsx").first()).toBeVisible();
    await expect(page.getByText(/raw rows stay local/i)).toBeVisible();
    await expect(page.getByTestId("workbench-nav-metrics")).toHaveCount(0);
    await expect(page.getByTestId("workbench-nav-analysis")).toHaveCount(0);

    await expect(page.getByTestId("workbench-question")).toHaveValue(
      "Why has Engineering voluntary attrition increased?",
    );
    await page.getByTestId("ask-workbench-question").click();

    const answer = page.getByTestId("thread-answer").first();
    await expect(answer).toContainText(/\+4\.5|4\.5pp/i, {
      timeout: 60_000,
    });
    await expect(page.getByTestId("answer-method").first()).toContainText(
      /retirement excluded/i,
    );
    await expect(
      page.getByText(/should retirement count as voluntary attrition/i),
    ).toHaveCount(0);
    await expect(
      page.getByText("Guided demo aggregate fallback used"),
    ).toHaveCount(0);

    await answer.getByRole("button", { name: /add to story/i }).click();
    await page.getByTestId("story-tray-button").click();
    await page.getByLabel(/audience/i).selectOption("CHRO");
    await expect(page.getByTestId("story-length-recommendation")).toContainText(
      "3 slides recommended",
    );
    await page.getByTestId("generate-story").click();
    await expect(page.getByText("3 editable slides")).toBeVisible();
    await page.getByTestId("story-length-longer").click();
    await expect(page.getByTestId("generate-story")).toContainText(
      "Regenerate 5-slide story",
    );
    await page.getByTestId("generate-story").click();
    await expect(page.getByText("5 editable slides")).toBeVisible();
    await page.getByTestId("story-length-longer").click();
    await expect(page.getByTestId("generate-story")).toContainText(
      "Regenerate 7-slide story",
    );
    await page.getByTestId("generate-story").click();
    await expect(page.getByText("7 editable slides")).toBeVisible();
    await page.getByTestId("story-length-shorter").click();
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

    await expect(
      page.getByRole("button", { name: /open ai co-designer/i }),
    ).toHaveCount(0);
  });
});

