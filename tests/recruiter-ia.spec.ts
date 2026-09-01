import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "mobile-390", width: 390, height: 844 },
] as const;

const ROUTES = [
  "/",
  "/enterprise-demo",
  "/enterprise-demo/trust",
  "/enterprise-demo/incident",
  "/enterprise-demo/attrition",
  "/architecture",
  "/perspective",
] as const;

test.describe("recruiter information architecture", () => {
  test("homepage answers the 60-second recruiter questions", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /trusted people data/i })).toBeVisible();
    await expect(page.getByTestId("cta-enterprise-demo")).toBeVisible();
    await expect(page.getByTestId("home-cases")).toBeVisible();
    await expect(page.getByTestId("case-card-trust")).toBeVisible();
    await expect(page.getByTestId("case-card-incident")).toBeVisible();
    await expect(page.getByTestId("case-card-attrition")).toBeVisible();
    await expect(page.getByTestId("why-i-built-this")).toContainText("long before the dashboard");
    await expect(page.getByText("People Analytics requires more than a model.")).toBeVisible();
    await expect(page.getByTestId("synthetic-label")).toContainText("Synthetic Enterprise Dataset");
    await expect(page.getByTestId("primary-nav")).toContainText("Enterprise Demo");
    await expect(page.getByTestId("primary-nav")).not.toContainText("Workbench");
    await expect(page.getByTestId("primary-nav")).not.toContainText("Ask a file");
    await page.screenshot({ path: "test-results/enterprise-demo/home.png", fullPage: true });
  });

  for (const viewport of VIEWPORTS) {
    test(`key routes render at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.locator("h1").first()).toBeVisible();
        await page.screenshot({
          path: `test-results/enterprise-demo/${viewport.name}${route.replaceAll("/", "-") || "-home"}.png`,
          fullPage: true,
        });
      }
    });
  }

  test("lab is secondary and labeled as experiments", async ({ page }) => {
    await page.goto("/lab");
    await expect(page.getByRole("heading", { name: /earlier file-based/i })).toBeVisible();
    await expect(page.getByText(/not the enterprise people data/i)).toBeVisible();
  });
});
