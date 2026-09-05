import { describe, expect, it } from "vitest";
import type { Insight, InsightChartSpec } from "@/types/workbench";
import {
  buildExecutiveStory,
  recommendExecutiveStorySlideCount,
  sanitizePptText,
  sanitizePptxFileName,
} from "./executive-story";
import {
  buildExecutiveStoryPptxArrayBuffer,
  buildExecutiveStoryPptxBuffer,
} from "./export-executive-story";

function makeInsight(
  id: string,
  overrides: Partial<Insight> = {},
): Insight {
  return {
    id,
    questionId: "question-1",
    branchKey: "trend",
    headline: `${id} headline`,
    finding: `${id} finding`,
    metricIds: [`metric-${id}`],
    filters: {},
    period: "2026 Q2",
    comparisonPeriod: "2026 Q1",
    population: "All employees",
    evidence: [
      {
        id: `${id}-evidence-1`,
        label: "Current",
        value: "10%",
        detail: "Validated result",
        sourceDatasetIds: [`dataset-${id}`],
      },
      {
        id: `${id}-evidence-2`,
        label: "Prior",
        value: "8%",
        sourceDatasetIds: [`dataset-${id}`],
      },
    ],
    chartSpec: {
      kind: "line",
      title: `${id} trend`,
      xLabel: "Quarter",
      yLabel: "Rate",
      unit: "percent",
      data: [
        { label: "Q1", value: 8 },
        { label: "Q2", value: 10 },
      ],
    },
    confidence: "High",
    limitations: [`${id} important limitation`],
    suggestedFollowUps: [],
    selectedForExecutiveStory: true,
    validated: true,
    ...overrides,
  };
}

describe("buildExecutiveStory", () => {
  it("projects validated selected insights without recalculating their chart data", () => {
    const first = makeInsight("first");
    const second = makeInsight("second", { chartSpec: undefined });
    const unvalidated = makeInsight("unvalidated", { validated: false });
    const unselected = makeInsight("unselected", {
      selectedForExecutiveStory: false,
    });
    const originalChart = structuredClone(first.chartSpec);

    Object.defineProperty(unvalidated, "headline", {
      get() {
        throw new Error("Unvalidated insight content was accessed.");
      },
    });

    const story = buildExecutiveStory(
      [first, unvalidated, unselected, second],
      "workspace-1",
      "CHRO",
      "Inform",
    );

    expect(story.slideCount).toBe(3);
    expect(story.slides).toHaveLength(3);
    expect(story.slides.map((slide) => slide.insightIds[0])).toEqual([
      "first",
      "second",
      "first",
    ]);
    expect(story.slides.flatMap((slide) => slide.insightIds)).not.toContain(
      "unvalidated",
    );
    expect(story.slides.flatMap((slide) => slide.insightIds)).not.toContain(
      "unselected",
    );
    expect(story.slides[0].headline).toBe(first.headline);
    expect(story.slides[0].chartSpec).toEqual(originalChart);
    expect(story.slides[0].chartSpec).not.toBe(first.chartSpec);
    expect(first.chartSpec).toEqual(originalChart);
    expect(story.slides[0].evidence).toEqual([
      "Current: 10% — Validated result",
      "Prior: 8%",
    ]);
  });

  it("recommends story length from selected content density", () => {
    expect(recommendExecutiveStorySlideCount([makeInsight("one")])).toBe(3);
    expect(
      recommendExecutiveStorySlideCount([
        makeInsight("dense", { finding: "Detailed evidence. ".repeat(140) }),
      ]),
    ).toBe(5);
    expect(
      recommendExecutiveStorySlideCount(
        Array.from({ length: 3 }, (_, index) =>
          makeInsight(`medium-${index + 1}`),
        ),
      ),
    ).toBe(5);
    expect(
      recommendExecutiveStorySlideCount(
        Array.from({ length: 5 }, (_, index) =>
          makeInsight(`long-${index + 1}`),
        ),
      ),
    ).toBe(7);
    expect(
      recommendExecutiveStorySlideCount([
        makeInsight("not-selected", {
          selectedForExecutiveStory: false,
        }),
      ]),
    ).toBe(3);
  });

  it("builds exact brief, diagnostic, and decision deck structures", () => {
    const insights = Array.from({ length: 7 }, (_, index) =>
      makeInsight(`insight-${index + 1}`),
    );
    const brief = buildExecutiveStory(
      insights,
      "workspace-brief",
      "HR Leadership Team",
      "Strategy review",
      3,
    );
    const diagnostic = buildExecutiveStory(
      insights,
      "workspace-diagnostic",
      "People Analytics Leadership",
      "Diagnose",
      5,
    );
    const decision = buildExecutiveStory(
      insights,
      "workspace-decision",
      "Business Leadership",
      "Recommend action",
      7,
    );

    expect(brief.slides).toHaveLength(3);
    expect(brief.slides.every((slide) => /Executive brief/.test(slide.kicker))).toBe(
      true,
    );
    expect(diagnostic.slides).toHaveLength(5);
    expect(
      diagnostic.slides.every((slide) => /Diagnostic deck/.test(slide.kicker)),
    ).toBe(true);
    expect(diagnostic.slides.map((slide) => slide.index)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(decision.slides).toHaveLength(7);
    expect(
      decision.slides.every((slide) => /Decision deck/.test(slide.kicker)),
    ).toBe(true);
    expect(
      [...brief.slides, ...diagnostic.slides, ...decision.slides].every(
        (slide) =>
          slide.headline.length > 0 &&
          slide.evidence.length >= 1 &&
          slide.evidence.length <= 3 &&
          /Sources:/.test(slide.sourceNote) &&
          /Metrics:/.test(slide.sourceNote) &&
          /raw rows not included/.test(slide.sourceNote) &&
          Boolean(slide.limitation),
      ),
    ).toBe(true);
  });

  it("caps evidence at three and falls back to the validated finding", () => {
    const manyEvidence = makeInsight("many", {
      evidence: Array.from({ length: 5 }, (_, index) => ({
        id: `evidence-${index}`,
        label: `Evidence ${index}`,
        value: String(index),
        sourceDatasetIds: ["dataset-many"],
      })),
    });
    const noEvidence = makeInsight("none", {
      finding: "Direct validated finding",
      evidence: [],
    });

    const story = buildExecutiveStory(
      [manyEvidence, noEvidence],
      "workspace-2",
      "Business Leadership",
      "Recommend action",
      3,
    );

    expect(story.slides[0].evidence).toHaveLength(3);
    expect(story.slides[1].evidence).toEqual(["Direct validated finding"]);
  });

  it("rejects a story with no eligible insight", () => {
    expect(() =>
      buildExecutiveStory(
        [
          makeInsight("unvalidated", { validated: false }),
          makeInsight("unselected", {
            selectedForExecutiveStory: false,
          }),
        ],
        "workspace-3",
        "TA Leadership",
        "Inform",
      ),
    ).toThrow(/validated, selected insight/i);
  });

  it("cleans all projected text and source identifiers", () => {
    const malicious = makeInsight("safe-id", {
      headline:
        "<b>Retention rose</b><script>alert('headline')</script>&amp;lt;img src=x onerror=alert(1)&amp;gt;",
      finding: "<em>Finding</em>",
      metricIds: ["metric<script>alert(2)</script>-1"],
      population: "<strong>Executives</strong>",
      evidence: [
        {
          id: "evidence-1",
          label: "<i>Rate</i>",
          value: "javascript:alert(3) 10%",
          detail: "<iframe>bad</iframe>Validated",
          sourceDatasetIds: ["dataset<img src=x onerror=alert(4)>-1"],
        },
      ],
      limitations: ["<b>Small population</b><script>bad()</script>"],
    });

    const story = buildExecutiveStory(
      [malicious],
      "workspace-safe",
      "CHRO",
      "Inform",
    );
    const serialized = JSON.stringify(story.slides);

    expect(serialized).not.toMatch(/<[^>]*>/);
    expect(serialized).not.toMatch(/javascript\s*:/i);
    expect(serialized).not.toMatch(/alert\(|bad\(\)/i);
    expect(story.slides[0].headline).toBe("Retention rose");
    expect(story.slides[0].limitation).toBe("Small population");
  });
});

describe("PowerPoint text and filename safety", () => {
  it("removes nested HTML, script bodies, controls, and unsafe protocols", () => {
    expect(
      sanitizePptText(
        "&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;<b>Safe</b>\u0000 javascript:run()",
      ),
    ).toBe("Safe");
  });

  it("produces a path-free .pptx filename", () => {
    const fileName = sanitizePptxFileName(
      "../../Q2:<script>alert(1)</script> Executive?.PPTX",
    );

    expect(fileName).toMatch(/\.pptx$/);
    expect(fileName).not.toMatch(/[<>:"/\\|?*\u0000-\u001F]/);
    expect(fileName).not.toContain("..");
    expect(fileName).not.toMatch(/script|alert/i);
  });
});

describe("editable PPTX generation", () => {
  it(
    "exports the longer 7-slide decision deck",
    async () => {
      const story = buildExecutiveStory(
        Array.from({ length: 7 }, (_, index) =>
          makeInsight(`decision-${index + 1}`),
        ),
        "workspace-decision-export",
        "Business Leadership",
        "Recommend action",
        7,
      );
      const arrayBuffer = await buildExecutiveStoryPptxArrayBuffer(story);
      const { default: JSZip } = await import("jszip");
      const archive = await JSZip.loadAsync(arrayBuffer);

      expect(
        Object.keys(archive.files).filter((entry) =>
          /^ppt\/slides\/slide\d+\.xml$/.test(entry),
        ),
      ).toHaveLength(7);
    },
    30_000,
  );

  it(
    "builds a valid 16:9 PPTX zip with editable charts and no media images",
    async () => {
      const story = buildExecutiveStory(
        [makeInsight("export")],
        "workspace-export",
        "CHRO",
        "Inform",
        3,
      );
      const arrayBuffer =
        await buildExecutiveStoryPptxArrayBuffer(story);
      const uint8Array = await buildExecutiveStoryPptxBuffer(story);

      expect(Array.from(new Uint8Array(arrayBuffer.slice(0, 4)))).toEqual([
        0x50, 0x4b, 0x03, 0x04,
      ]);
      expect(Array.from(uint8Array.slice(0, 4))).toEqual([
        0x50, 0x4b, 0x03, 0x04,
      ]);
      expect(Buffer.isBuffer(uint8Array)).toBe(true);

      const { default: JSZip } = await import("jszip");
      const archive = await JSZip.loadAsync(arrayBuffer);
      const entries = Object.keys(archive.files);
      const presentationEntry = archive.file("ppt/presentation.xml");
      const contentTypesEntry = archive.file("[Content_Types].xml");

      expect(contentTypesEntry).not.toBeNull();
      expect(presentationEntry).not.toBeNull();
      expect(
        entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry)),
      ).toHaveLength(3);
      expect(
        entries.filter((entry) => /^ppt\/charts\/chart\d+\.xml$/.test(entry)),
      ).toHaveLength(3);
      expect(
        entries.some(
          (entry) => entry.startsWith("ppt/media/") && !entry.endsWith("/"),
        ),
      ).toBe(false);

      const presentationXml = await presentationEntry!.async("text");
      const slideSize = presentationXml.match(
        /<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/,
      );
      expect(slideSize).not.toBeNull();
      expect(Number(slideSize![1]) / Number(slideSize![2])).toBeCloseTo(
        16 / 9,
        3,
      );
    },
    30_000,
  );

  it(
    "renders every supported chart kind as editable Office objects",
    async () => {
      const kinds: InsightChartSpec["kind"][] = [
        "line",
        "bar",
        "stacked-bar",
        "scatter",
        "table",
      ];
      const story = buildExecutiveStory(
        kinds.map((kind, index) =>
          makeInsight(`chart-${kind}`, {
            chartSpec: {
              kind,
              title: `${kind} chart`,
              xLabel: "Period",
              yLabel: "Value",
              unit: "people",
              data: [
                { label: "A", value: index + 1, group: "Current" },
                {
                  label: "B",
                  value: index + 2,
                  secondaryValue: index,
                  group: "Current",
                },
              ],
            },
          }),
        ),
        "workspace-chart-kinds",
        "People Analytics Leadership",
        "Diagnose",
        5,
      );
      const arrayBuffer =
        await buildExecutiveStoryPptxArrayBuffer(story);
      const { default: JSZip } = await import("jszip");
      const archive = await JSZip.loadAsync(arrayBuffer);
      const entries = Object.keys(archive.files);
      const tableSlide = await archive
        .file("ppt/slides/slide5.xml")!
        .async("text");

      expect(
        entries.filter((entry) => /^ppt\/charts\/chart\d+\.xml$/.test(entry)),
      ).toHaveLength(4);
      expect(tableSlide).toContain("<a:tbl>");
      for (let index = 1; index <= 5; index += 1) {
        const relationships = await archive
          .file(`ppt/slides/_rels/slide${index}.xml.rels`)!
          .async("text");
        const chartRelationships =
          relationships.match(/relationships\/chart/g) ?? [];
        expect(chartRelationships.length).toBeLessThanOrEqual(1);
      }
    },
    30_000,
  );
});
