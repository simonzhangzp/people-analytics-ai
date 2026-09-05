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
    await expect(page.getByTestId("platform-facts")).toBeVisible();
    const headcount = page.getByTestId("fact-certified-headcount");
    const liveHeadcount = await headcount.getAttribute("data-value");
    if (liveHeadcount) {
      await expect(headcount).toHaveAttribute("data-value", "49823");
      await expect(page.getByTestId("fact-certified-metrics")).toHaveAttribute("data-value", "21");
      await expect(page.getByTestId("fact-serving-freshness")).toContainText("Frozen at 2026-08-31 (data-v1)");
    }
    await expect(page.getByTestId("platform-facts")).not.toContainText("50,010");
    await expect(page.getByTestId("platform-facts")).not.toContainText("Pipeline Refresh");
    await expect(page.getByTestId("primary-nav")).toContainText("Enterprise Demo");
    await expect(page.getByTestId("primary-nav")).not.toContainText("Workbench");
    await expect(page.getByTestId("primary-nav")).not.toContainText("Ask a file");
    const nav = await page.getByTestId("primary-nav").innerText();
    expect(nav.replace(/\s+/g, " ")).toMatch(/Home\s+Enterprise Demo\s+Architecture\s+Perspective\s+About/);
    await page.screenshot({ path: "test-results/enterprise-demo/home.png", fullPage: true });
  });

  test("about page is the recruiter funnel exit", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: /simon zhang/i })).toBeVisible();
    await expect(page.getByTestId("about-contact")).toContainText("LinkedIn");
    await expect(page.getByRole("link", { name: /linkedin\.com\/in\/simonzp/i })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/simonzp",
    );
    await expect(page.getByTestId("what-i-built-here")).toContainText("21-metric");
    await expect(page.getByTestId("about-contact")).not.toContainText("Resume");
    await expect(page.getByTestId("about-contact")).not.toContainText("GitHub");
    await expect(page.getByRole("link", { name: /download pdf/i })).toHaveCount(0);
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

  test("robots.txt keeps lab surfaces out of the index", async ({ request }) => {
    const text = await (await request.get("/robots.txt")).text();
    for (const path of ["/lab", "/ask", "/workbench", "/demo", "/strategy", "/app", "/workspace"]) {
      expect(text).toContain(`Disallow: ${path}`);
    }
  });
});
