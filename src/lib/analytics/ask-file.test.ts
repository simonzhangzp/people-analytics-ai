import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAndProfileFile } from "../data/local-profiler";
import { analyzeAskFile, buildAskInsights } from "./ask-file";

function sampleFile() {
  const csv = readFileSync(
    new URL("../../../tests/fixtures/talent-review-sample.csv", import.meta.url),
  );
  return new File([csv], "talent-review-sample.csv", { type: "text/csv" });
}

describe("ask file analysis", () => {
  it("profiles a talent-review extract and answers completeness with assumptions", async () => {
    const dataset = await parseAndProfileFile(sampleFile());
    expect(dataset.entity).toBe("Talent Review Extract");
    expect(dataset.mappings.some((item) => item.canonicalField === "talent_review_status")).toBe(
      true,
    );

    const result = analyzeAskFile(
      dataset,
      "How complete is this talent review and performance appraisal cycle?",
    );

    expect(result.scenario).toBe("talent_review");
    expect(result.qualityScore).toBeGreaterThan(70);
    expect(result.fileSummary).toMatch(/10 people|10 rows/i);
    expect(result.conclusion).toMatch(/6 of 10|60%/);
    expect(result.metrics.find((metric) => metric.name === "Appraisal completed")?.value).toMatch(
      /3 of 10/,
    );
    expect(result.columnsUsed.map((column) => column.source)).toContain("Talent Review");
    expect(result.pendingDefinitions.map((item) => item.id)).toEqual([
      "population",
      "talent_review_meaning",
      "retention_low",
    ]);
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.approvedDefinitions).toEqual([]);
  });

  it("recalculates after the user confirms an active-only population", async () => {
    const dataset = await parseAndProfileFile(sampleFile());
    const result = analyzeAskFile(dataset, "How complete is talent review?", {
      population: "active_only",
      talent_review_meaning: "started",
      retention_low: "do_not_interpret",
    });

    expect(result.metrics.find((metric) => metric.name === "Population")?.value).toBe("8");
    expect(result.approvedDefinitions.join(" ")).toMatch(/Active assignments only/);
    expect(result.conclusion).toMatch(/8/);
  });

  it("does not invent recruiting answers from a talent-review file", async () => {
    const dataset = await parseAndProfileFile(sampleFile());
    const result = analyzeAskFile(dataset, "What is our Time to Fill?");
    expect(result.answerable).toBe(false);
    expect(result.missingEvidence.join(" ")).toMatch(/Time to Fill/i);
  });

  it("answers population distribution from a headcount snapshot", async () => {
    const csv = readFileSync(
      new URL("../../../tests/fixtures/vdm-headcount-snapshot.csv", import.meta.url),
    );
    const file = new File([csv], "vdm_headcount_month_f_sample.csv", { type: "text/csv" });
    const dataset = await parseAndProfileFile(file);
    const result = analyzeAskFile(
      dataset,
      "population distribution by different data cuts in the file",
    );

    expect(result.scenario).toBe("headcount");
    expect(result.answerable).toBe(true);
    expect(result.conclusion).toMatch(/snapshot month|workforce status|country/i);
    expect(result.metrics.some((metric) => /status mix/i.test(metric.name))).toBe(true);
    expect(result.columnsUsed.map((column) => column.source)).toEqual(
      expect.arrayContaining(["record_month", "data_flag", "country"]),
    );
    expect(result.pendingDefinitions.map((item) => item.id)).toContain("headcount_meaning");
  });

  it("builds insights from the same calculated metrics", async () => {
    const dataset = await parseAndProfileFile(sampleFile());
    const result = analyzeAskFile(dataset, "Where is review risk concentrated?");
    const insights = buildAskInsights(result);
    expect(insights.length).toBeGreaterThan(2);
    expect(insights.some((insight) => insight.icon === "alert")).toBe(true);
    expect(insights.every((insight) => insight.body.length > 0)).toBe(true);
  });
});
