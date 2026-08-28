import type {
  ExecutiveSlide,
  ExecutiveStory,
  InsightChartSpec,
} from "@/types/workbench";
import {
  sanitizeInsightChartSpec,
  sanitizePptText,
  sanitizePptxFileName,
} from "./executive-story";

type PptxModule = typeof import("pptxgenjs");
type PptxPresentation = InstanceType<PptxModule["default"]>;
type PptxSlide = ReturnType<PptxPresentation["addSlide"]>;

interface EditableChartSeries {
  name: string;
  labels: string[];
  values: number[];
}

export interface ExecutiveStoryPptxBuildOptions {
  compression?: boolean;
}

export interface ExecutiveStoryPptxExportOptions
  extends ExecutiveStoryPptxBuildOptions {
  fileName?: string;
}

const COLORS = {
  background: "F7F8FA",
  card: "FFFFFF",
  foreground: "111827",
  muted: "F3F4F6",
  mutedForeground: "647084",
  border: "E3E7ED",
  primary: "3559C7",
  primaryDark: "2846A6",
  primarySoft: "EEF2FF",
  warning: "A36318",
  warningSoft: "FBF3E7",
  inkBlue: "14213D",
} as const;

const CHART_COLORS = [
  COLORS.primary,
  COLORS.warning,
  "31785A",
  "7A5BA7",
  "647084",
] as const;

const SLIDE_HEIGHT = 7.5;

function validateStoryShape(story: ExecutiveStory): void {
  if (story.slideCount !== 3 && story.slideCount !== 5) {
    throw new RangeError("Only 3-slide and 5-slide executive stories can be exported.");
  }
  if (story.slides.length !== story.slideCount) {
    throw new Error(
      `Expected ${story.slideCount} slides, received ${story.slides.length}.`,
    );
  }
}

function safeEvidence(slide: ExecutiveSlide): string[] {
  const evidence = slide.evidence
    .slice(0, 3)
    .map((item) => sanitizePptText(item, 480))
    .filter(Boolean);

  return evidence.length > 0
    ? evidence
    : ["Evidence not specified in the validated insight."];
}

function addText(
  slide: PptxSlide,
  text: unknown,
  options: Parameters<PptxSlide["addText"]>[1],
): void {
  slide.addText(sanitizePptText(text), options);
}

function addSlideFrame(
  pptx: PptxPresentation,
  slide: PptxSlide,
  story: ExecutiveStory,
  executiveSlide: ExecutiveSlide,
  slideNumber: number,
): void {
  slide.background = { color: COLORS.background };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.12,
    h: SLIDE_HEIGHT,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary, transparency: 100 },
    objectName: "Brand accent",
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0.55,
    y: 1.78,
    w: 12.2,
    h: 0,
    line: { color: COLORS.border, width: 1 },
    objectName: "Headline divider",
  });

  addText(slide, executiveSlide.kicker, {
    x: 0.62,
    y: 0.35,
    w: 8.8,
    h: 0.25,
    color: COLORS.primaryDark,
    fontFace: "Segoe UI",
    fontSize: 10,
    bold: true,
    charSpacing: 1.5,
    margin: 0,
    breakLine: false,
    objectName: "Slide role",
  });
  addText(slide, executiveSlide.headline, {
    x: 0.62,
    y: 0.72,
    w: 11.9,
    h: 0.88,
    color: COLORS.inkBlue,
    fontFace: "Segoe UI",
    fontSize: 25,
    bold: true,
    margin: 0,
    valign: "middle",
    fit: "shrink",
    objectName: "Conclusion headline",
  });
  addText(slide, `${story.audience} · ${story.purpose}`, {
    x: 9.5,
    y: 0.34,
    w: 2.7,
    h: 0.25,
    color: COLORS.mutedForeground,
    fontFace: "Segoe UI",
    fontSize: 9,
    align: "right",
    margin: 0,
    objectName: "Audience and purpose",
  });
  addText(slide, `${slideNumber} / ${story.slideCount}`, {
    x: 12.2,
    y: 0.34,
    w: 0.55,
    h: 0.25,
    color: COLORS.mutedForeground,
    fontFace: "Segoe UI",
    fontSize: 9,
    align: "right",
    margin: 0,
    objectName: "Slide number",
  });
}

function seriesName(chartSpec: InsightChartSpec): string {
  return (
    sanitizePptText(chartSpec.yLabel, 100) ||
    sanitizePptText(chartSpec.unit, 100) ||
    "Value"
  );
}

function editableChartSeries(
  chartSpec: InsightChartSpec,
): EditableChartSeries[] {
  const primaryName = seriesName(chartSpec);
  const grouped = new Map<
    string,
    { primary: EditableChartSeries; secondary: EditableChartSeries }
  >();

  for (const datum of chartSpec.data) {
    const group = sanitizePptText(datum.group, 100) || primaryName;
    let series = grouped.get(group);
    if (!series) {
      series = {
        primary: { name: group, labels: [], values: [] },
        secondary: {
          name: `${group} comparison`,
          labels: [],
          values: [],
        },
      };
      grouped.set(group, series);
    }

    series.primary.labels.push(datum.label);
    series.primary.values.push(datum.value);
    if (datum.secondaryValue !== undefined) {
      series.secondary.labels.push(datum.label);
      series.secondary.values.push(datum.secondaryValue);
    }
  }

  return [...grouped.values()].flatMap(({ primary, secondary }) =>
    secondary.values.length > 0 ? [primary, secondary] : [primary],
  );
}

function addEditableTable(
  slide: PptxSlide,
  chartSpec: InsightChartSpec,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const hasGroups = chartSpec.data.some((datum) => Boolean(datum.group));
  const hasComparison = chartSpec.data.some(
    (datum) => datum.secondaryValue !== undefined,
  );
  const headers = [
    "Label",
    ...(hasGroups ? ["Group"] : []),
    seriesName(chartSpec),
    ...(hasComparison ? ["Comparison"] : []),
  ];
  const rows: Parameters<PptxSlide["addTable"]>[0] = [
    headers.map((header) => ({
      text: sanitizePptText(header, 100),
      options: {
        bold: true,
        color: COLORS.inkBlue,
        fill: { color: COLORS.primarySoft },
      },
    })),
    ...chartSpec.data.map((datum) => {
      const cells = [
        sanitizePptText(datum.label, 120),
        ...(hasGroups ? [sanitizePptText(datum.group, 100) || "—"] : []),
        String(datum.value),
        ...(hasComparison
          ? [
              datum.secondaryValue === undefined
                ? "—"
                : String(datum.secondaryValue),
            ]
          : []),
      ];
      return cells.map((text) => ({ text }));
    }),
  ];

  addText(slide, chartSpec.title, {
    x,
    y,
    w,
    h: 0.3,
    color: COLORS.inkBlue,
    fontFace: "Segoe UI",
    fontSize: 12,
    bold: true,
    margin: 0,
    objectName: "Table title",
  });
  slide.addTable(rows, {
    x,
    y: y + 0.42,
    w,
    h: h - 0.42,
    border: { type: "solid", color: COLORS.border, pt: 0.75 },
    color: COLORS.foreground,
    fill: { color: COLORS.card },
    fontFace: "Segoe UI",
    fontSize: 10,
    margin: 0.08,
    autoPage: false,
    objectName: "Editable insight table",
  });
}

function addEditableChart(
  pptx: PptxPresentation,
  slide: PptxSlide,
  inputChartSpec: InsightChartSpec,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const chartSpec = sanitizeInsightChartSpec(inputChartSpec);

  if (chartSpec.kind === "table") {
    addEditableTable(slide, chartSpec, x, y, w, h);
    return;
  }

  const series = editableChartSeries(chartSpec);
  if (series.length === 0) {
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w,
      h,
      fill: { color: COLORS.card },
      line: { color: COLORS.border, width: 1 },
      objectName: "Empty chart boundary",
    });
    addText(slide, "No chart points were included in the validated insight.", {
      x: x + 0.35,
      y: y + h / 2 - 0.2,
      w: w - 0.7,
      h: 0.4,
      color: COLORS.mutedForeground,
      fontFace: "Segoe UI",
      fontSize: 12,
      align: "center",
      margin: 0,
      objectName: "Empty chart note",
    });
    return;
  }

  const chartType =
    chartSpec.kind === "line"
      ? pptx.ChartType.line
      : chartSpec.kind === "scatter"
        ? pptx.ChartType.scatter
        : pptx.ChartType.bar;

  slide.addChart(chartType, series, {
    x,
    y,
    w,
    h,
    altText: sanitizePptText(chartSpec.title, 180),
    objectName: "Editable insight chart",
    showTitle: true,
    title: sanitizePptText(chartSpec.title, 180),
    titleColor: COLORS.inkBlue,
    titleFontFace: "Segoe UI",
    titleFontSize: 12,
    showLegend: series.length > 1,
    legendPos: "b",
    legendColor: COLORS.mutedForeground,
    legendFontFace: "Segoe UI",
    legendFontSize: 9,
    chartColors: [...CHART_COLORS],
    chartArea: {
      fill: { color: COLORS.card },
      border: { color: COLORS.border, pt: 1 },
      roundedCorners: false,
    },
    plotArea: {
      fill: { color: COLORS.card },
      border: { color: COLORS.border, pt: 0 },
    },
    catAxisLabelColor: COLORS.mutedForeground,
    catAxisLabelFontFace: "Segoe UI",
    catAxisLabelFontSize: 9,
    catAxisLineColor: COLORS.border,
    catAxisLineShow: true,
    catAxisTitle: sanitizePptText(chartSpec.xLabel, 100),
    showCatAxisTitle: Boolean(chartSpec.xLabel),
    valAxisLabelColor: COLORS.mutedForeground,
    valAxisLabelFontFace: "Segoe UI",
    valAxisLabelFontSize: 9,
    valAxisLineColor: COLORS.border,
    valAxisLineShow: true,
    valAxisTitle: [
      sanitizePptText(chartSpec.yLabel, 100),
      sanitizePptText(chartSpec.unit, 100),
    ]
      .filter(Boolean)
      .join(" · "),
    showValAxisTitle: true,
    valGridLine: { color: COLORS.border, size: 0.75, style: "solid" },
    showValue: chartSpec.kind === "bar" || chartSpec.kind === "stacked-bar",
    dataLabelColor: COLORS.mutedForeground,
    dataLabelFontFace: "Segoe UI",
    dataLabelFontSize: 9,
    dataLabelPosition: "outEnd",
    lineDataSymbol: "circle",
    lineDataSymbolSize: 5,
    lineSize: 2,
    barDir: "col",
    barGrouping: chartSpec.kind === "stacked-bar" ? "stacked" : "clustered",
    showDataTable: false,
  });
}

function addEvidenceCards(
  pptx: PptxPresentation,
  slide: PptxSlide,
  evidence: readonly string[],
  hasChart: boolean,
): void {
  addText(slide, "EVIDENCE", {
    x: hasChart ? 8.55 : 0.68,
    y: 2.02,
    w: 2,
    h: 0.24,
    color: COLORS.mutedForeground,
    fontFace: "Segoe UI",
    fontSize: 9,
    bold: true,
    charSpacing: 1.2,
    margin: 0,
    objectName: "Evidence label",
  });

  if (hasChart) {
    evidence.forEach((item, index) => {
      const y = 2.4 + index * 1.02;
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 8.55,
        y,
        w: 4.15,
        h: 0.82,
        rectRadius: 0.05,
        fill: { color: COLORS.card },
        line: { color: COLORS.border, width: 1 },
        objectName: `Evidence card ${index + 1}`,
      });
      addText(slide, item, {
        x: 8.78,
        y: y + 0.12,
        w: 3.7,
        h: 0.56,
        color: COLORS.foreground,
        fontFace: "Segoe UI",
        fontSize: 11,
        margin: 0,
        valign: "middle",
        fit: "shrink",
        objectName: `Evidence text ${index + 1}`,
      });
    });
    return;
  }

  const gap = 0.22;
  const cardWidth = (12.05 - gap * (evidence.length - 1)) / evidence.length;
  evidence.forEach((item, index) => {
    const x = 0.68 + index * (cardWidth + gap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 2.42,
      w: cardWidth,
      h: 2.5,
      rectRadius: 0.05,
      fill: { color: COLORS.card },
      line: { color: COLORS.border, width: 1 },
      objectName: `Evidence card ${index + 1}`,
    });
    addText(slide, `${index + 1}`, {
      x: x + 0.25,
      y: 2.7,
      w: 0.4,
      h: 0.35,
      color: COLORS.primary,
      fontFace: "Segoe UI",
      fontSize: 18,
      bold: true,
      margin: 0,
      objectName: `Evidence number ${index + 1}`,
    });
    addText(slide, item, {
      x: x + 0.25,
      y: 3.25,
      w: cardWidth - 0.5,
      h: 1.22,
      color: COLORS.foreground,
      fontFace: "Segoe UI",
      fontSize: 14,
      bold: true,
      margin: 0,
      valign: "middle",
      fit: "shrink",
      objectName: `Evidence text ${index + 1}`,
    });
  });
}

function addEvidenceBoundary(
  pptx: PptxPresentation,
  slide: PptxSlide,
  executiveSlide: ExecutiveSlide,
): void {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.68,
    y: 5.83,
    w: 12.02,
    h: 0.58,
    rectRadius: 0.04,
    fill: { color: COLORS.warningSoft },
    line: { color: COLORS.warningSoft, transparency: 100 },
    objectName: "Limitation boundary",
  });
  addText(slide, "LIMITATION", {
    x: 0.9,
    y: 6.02,
    w: 0.9,
    h: 0.18,
    color: COLORS.warning,
    fontFace: "Segoe UI",
    fontSize: 8,
    bold: true,
    charSpacing: 1,
    margin: 0,
    objectName: "Limitation label",
  });
  addText(
    slide,
    executiveSlide.limitation ??
      "Limitation not specified in the validated insight.",
    {
      x: 1.82,
      y: 5.94,
      w: 10.55,
      h: 0.34,
      color: COLORS.foreground,
      fontFace: "Segoe UI",
      fontSize: 9.5,
      margin: 0,
      valign: "middle",
      fit: "shrink",
      objectName: "Limitation text",
    },
  );
  addText(slide, executiveSlide.sourceNote, {
    x: 0.68,
    y: 6.76,
    w: 12.02,
    h: 0.25,
    color: COLORS.mutedForeground,
    fontFace: "Segoe UI",
    fontSize: 8.5,
    margin: 0,
    fit: "shrink",
    objectName: "Source and metric note",
  });
}

function addExecutiveSlide(
  pptx: PptxPresentation,
  story: ExecutiveStory,
  executiveSlide: ExecutiveSlide,
  slideNumber: number,
): void {
  const slide = pptx.addSlide();
  const evidence = safeEvidence(executiveSlide);
  const hasChart = Boolean(executiveSlide.chartSpec);

  addSlideFrame(pptx, slide, story, executiveSlide, slideNumber);
  if (executiveSlide.chartSpec) {
    addEditableChart(
      pptx,
      slide,
      executiveSlide.chartSpec,
      0.68,
      2.02,
      7.45,
      3.48,
    );
  }
  addEvidenceCards(pptx, slide, evidence, hasChart);
  addEvidenceBoundary(pptx, slide, executiveSlide);
}

async function createExecutiveStoryPresentation(
  story: ExecutiveStory,
): Promise<PptxPresentation> {
  validateStoryShape(story);

  // Runtime-only import keeps the pure story builder and initial browser bundle
  // independent from pptxgenjs and its Node-specific optional image dependency.
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  const deckKind =
    story.slideCount === 3 ? "Executive brief" : "Diagnostic deck";

  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "People Analytics AI";
  pptx.company = "People Analytics AI";
  pptx.subject = sanitizePptText(
    `${deckKind} · ${story.audience} · ${story.purpose}`,
    240,
  );
  pptx.title = sanitizePptText(
    `${deckKind} for ${story.audience}`,
    240,
  );
  pptx.revision = "1";
  pptx.theme = {
    headFontFace: "Segoe UI",
    bodyFontFace: "Segoe UI",
  };

  story.slides.forEach((slide, index) => {
    addExecutiveSlide(pptx, story, slide, index + 1);
  });

  return pptx;
}

async function outputAsArrayBuffer(
  output: Awaited<ReturnType<PptxPresentation["write"]>>,
): Promise<ArrayBuffer> {
  if (output instanceof ArrayBuffer) {
    return output;
  }
  if (ArrayBuffer.isView(output)) {
    const bytes = new Uint8Array(
      output.buffer,
      output.byteOffset,
      output.byteLength,
    );
    return Uint8Array.from(bytes).buffer;
  }
  if (typeof Blob !== "undefined" && output instanceof Blob) {
    return output.arrayBuffer();
  }
  throw new TypeError("pptxgenjs returned an unsupported binary output.");
}

export function defaultExecutiveStoryPptxFileName(
  story: Pick<ExecutiveStory, "workspaceId" | "slideCount">,
): string {
  const deckKind =
    story.slideCount === 3 ? "executive-brief" : "diagnostic-deck";
  return sanitizePptxFileName(`${story.workspaceId}-${deckKind}`);
}

/**
 * Builds a standards-based PPTX ArrayBuffer without downloading a file.
 */
export async function buildExecutiveStoryPptxArrayBuffer(
  story: ExecutiveStory,
  options: ExecutiveStoryPptxBuildOptions = {},
): Promise<ArrayBuffer> {
  const pptx = await createExecutiveStoryPresentation(story);
  const output = await pptx.write({
    outputType: "arraybuffer",
    compression: options.compression ?? true,
  });
  return outputAsArrayBuffer(output);
}

/**
 * Uint8Array helper suitable for Node Buffer assertions and binary transports.
 */
export async function buildExecutiveStoryPptxBuffer(
  story: ExecutiveStory,
  options: ExecutiveStoryPptxBuildOptions = {},
): Promise<Uint8Array> {
  const arrayBuffer = await buildExecutiveStoryPptxArrayBuffer(story, options);
  const nodeBufferFactory = (
    globalThis as typeof globalThis & {
      Buffer?: { from(input: ArrayBuffer): Uint8Array };
    }
  ).Buffer;

  return nodeBufferFactory
    ? nodeBufferFactory.from(arrayBuffer)
    : new Uint8Array(arrayBuffer);
}

/**
 * Concise alias for callers that only need the generated binary.
 */
export const buildExecutiveStoryPptx = buildExecutiveStoryPptxArrayBuffer;

/**
 * Writes/downloads an editable 16:9 PPTX in the browser via writeFile.
 */
export async function exportExecutiveStoryPptx(
  story: ExecutiveStory,
  options: string | ExecutiveStoryPptxExportOptions = {},
): Promise<string> {
  const normalizedOptions =
    typeof options === "string" ? { fileName: options } : options;
  const fileName = sanitizePptxFileName(
    normalizedOptions.fileName ?? defaultExecutiveStoryPptxFileName(story),
  );
  const pptx = await createExecutiveStoryPresentation(story);

  return pptx.writeFile({
    fileName,
    compression: normalizedOptions.compression ?? true,
  });
}
