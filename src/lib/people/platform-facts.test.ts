import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CERTIFIED_AS_OF,
  PARITY_HEADCOUNT,
  SERVING_FRESHNESS_LABEL,
} from "./parity-home";
import { PEOPLE_DATASET_PAGE_COPY, datasetFreshnessCopy } from "./dataset-page-copy";
import { learningRecommendationsForGaps, MICROSOFT_LEARN_CATALOG } from "./learn-catalog";

const ROOT = path.resolve(process.cwd());

function loadLocalEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(ROOT, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#")) continue;
      const cut = line.indexOf("=");
      if (cut <= 0) continue;
      const key = line.slice(0, cut).trim();
      if (!key || process.env[key]) continue;
      process.env[key] = line.slice(cut + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

describe("homepage platform facts vs data-v1 parity", () => {
  it("committed parity matches the rehearsal headcount RPC bit-for-bit", () => {
    const fixture = path.join(
      ROOT,
      "data-platform/simulator/fixtures/rehearsal_1p00/parity_data_v1.json",
    );
    expect(CERTIFIED_AS_OF).toBe("2026-08-31");
    expect(PARITY_HEADCOUNT).toBe(49823);
    expect(SERVING_FRESHNESS_LABEL).toBe("Frozen at 2026-08-31 (data-v1)");
    if (existsSync(fixture)) {
      const parsed = JSON.parse(readFileSync(fixture, "utf8")) as {
        rows?: Array<{ metric_id?: string; rpc?: number }>;
      };
      const headcount = (parsed.rows ?? []).find((row) => row.metric_id === "headcount");
      expect(headcount?.rpc).toBe(PARITY_HEADCOUNT);
    }
  });

  it("metric registry YAML count is 21 certified files", () => {
    const dir = path.join(ROOT, "data-platform/people_metrics");
    const files = readdirSync(dir).filter((name) => name.endsWith(".yml"));
    expect(files).toHaveLength(21);
  });

  it("quality catalog lists bronze, silver, gold tests and is not a 9-row stub", () => {
    const catalog = readFileSync(
      path.join(ROOT, "data-platform/people_quality/people_quality_catalog.yml"),
      "utf8",
    );
    const yamlIds = [...catalog.matchAll(/test_id:\s+(\S+)/g)].map((match) => match[1]);
    const metricFiles = readdirSync(path.join(ROOT, "data-platform/people_metrics")).filter((name) =>
      name.endsWith(".yml"),
    );
    const extraMetricRange = metricFiles.filter(
      (name) => !yamlIds.includes(`metric_range_${name.replace(/\.yml$/, "")}`),
    );
    expect(yamlIds.length + extraMetricRange.length).toBeGreaterThan(9);
    expect(catalog).toMatch(/layer: bronze/);
    expect(catalog).toMatch(/layer: silver/);
    expect(catalog).toMatch(/layer: gold/);
    const page = readFileSync(path.join(ROOT, "src/app/page.tsx"), "utf8");
    expect(page).not.toMatch(/qualityTests \?\? 30/);
    expect(page).toContain("facts.qualityTests");
  });

  it("homepage and dataset copy do not use stale 50,010 / daily-refresh claims", () => {
    const page = readFileSync(path.join(ROOT, "src/app/page.tsx"), "utf8");
    expect(page).toContain("loadHomePlatformFacts");
    expect(page).not.toMatch(/50010|50,010/);
    expect(page).not.toMatch(/facts\.certified_metrics \?\? 20/);
    expect(page).not.toMatch(/\["Daily", "Pipeline Refresh"\]/);
    expect(PEOPLE_DATASET_PAGE_COPY.freshness).toBe(
      "The dataset is frozen at data-v1 (as-of 2026-08-31).",
    );
    expect(PEOPLE_DATASET_PAGE_COPY.freshness).not.toMatch(/daily job verifies/);
    expect(PEOPLE_DATASET_PAGE_COPY.freshness).not.toMatch(/cutover|streak|thaw|simulate\.step|ok=true/i);
    expect(datasetFreshnessCopy({ consecutiveDays: 2, lastRunDate: "2026-09-05" })).not.toMatch(
      /daily job verifies/,
    );
    expect(datasetFreshnessCopy({ consecutiveDays: 3, lastRunDate: "2026-09-06" })).toMatch(
      /daily job verifies the serving layer/,
    );
    expect(datasetFreshnessCopy({ consecutiveDays: 3, lastRunDate: "2026-09-06" })).toMatch(
      /Last serving check: 2026-09-06/,
    );
    const datasetPage = readFileSync(path.join(ROOT, "src/app/dataset/page.tsx"), "utf8");
    expect(datasetPage).toMatch(/eyebrow">FRESHNESS</);
    expect(datasetPage.indexOf("External sources")).toBeLessThan(datasetPage.indexOf("FRESHNESS"));
    expect(datasetPage).toContain('data-testid="dataset-freshness"');
    expect(datasetPage.indexOf("dataset-freshness")).toBeGreaterThan(datasetPage.indexOf("External sources"));
  });

  it("live people_v2 facts match parity when serving env is present", async () => {
    loadLocalEnv();
    if (process.env.VERCEL && (!process.env.PEOPLE_DB_URL || !process.env.PEOPLE_SERVING_REF)) {
      throw new Error("Vercel builds must set PEOPLE_DB_URL and PEOPLE_SERVING_REF so homepage facts cannot drift.");
    }
    if (!process.env.PEOPLE_DB_URL || !process.env.PEOPLE_SERVING_REF) {
      return;
    }
    const { assertFactsMatchParity, loadHomePlatformFacts } = await import("./platform-facts");
    const facts = await loadHomePlatformFacts();
    assertFactsMatchParity(facts);
    expect(facts.certifiedMetrics).toBe(21);
    expect(facts.qualityTests).toBeGreaterThan(9);
    const liveCount = await import("./v2-client").then((mod) =>
      mod.peopleV2Query<{ n: number }>("select count(*)::int as n from people_v2.people_quality_test"),
    );
    expect(facts.qualityTests).toBe(liveCount[0]?.n);
  });
});

describe("Microsoft Learn recommendations", () => {
  it("returns 3–5 public Learn URLs for Engineering coverage rows", () => {
    const recs = learningRecommendationsForGaps(
      [{ job_family: "Engineering", org_id: "ENG-APAC", coverage_ratio: 0.41 }],
      5,
    );
    expect(recs.length).toBeGreaterThanOrEqual(3);
    expect(recs.length).toBeLessThanOrEqual(5);
    expect(recs).toHaveLength(MICROSOFT_LEARN_CATALOG.length);
    for (const rec of recs) {
      expect(rec.url).toMatch(/^https:\/\/learn\.microsoft\.com\//);
      expect(rec.url.toLowerCase()).not.toMatch(/minecraft|makecode/);
    }
  });
});
