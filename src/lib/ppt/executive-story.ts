import type {
  EvidenceItem,
  ExecutiveSlide,
  ExecutiveStory,
  Insight,
  InsightChartSpec,
  StorySlideCount,
} from "@/types/workbench";

const MAX_TEXT_LENGTH = 2_000;
const MAX_HEADLINE_LENGTH = 240;
const MAX_EVIDENCE_LENGTH = 480;
const MAX_NOTE_LENGTH = 800;

const BLOCKED_HTML_ELEMENTS =
  /<\s*(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const UNCLOSED_BLOCKED_HTML_ELEMENT =
  /<\s*(?:script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*$/gi;
const HTML_COMMENT_OR_DECLARATION = /<!--[\s\S]*?-->|<![^>]*>|<\?[\s\S]*?\?>/g;
const HTML_TAG = /<\/?[a-z][^>]*>/gi;
const UNSAFE_PROTOCOL_PAYLOAD =
  /\b(?:(?:javascript|vbscript)\s*:|data\s*:\s*text\/html)\s*\S*/gi;
const XML_UNSAFE_CONTROL_CHARACTERS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const BIDI_CONTROL_CHARACTERS = /[\u202A-\u202E\u2066-\u2069]/g;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

const THREE_SLIDE_KICKERS = [
  "Executive brief · Executive answer",
  "Executive brief · Key evidence",
  "Executive brief · Decision context",
] as const;

const FIVE_SLIDE_KICKERS = [
  "Diagnostic deck · Executive answer",
  "Diagnostic deck · What changed",
  "Diagnostic deck · Where it concentrates",
  "Diagnostic deck · Evidence boundary",
  "Diagnostic deck · Decision context",
] as const;

const SEVEN_SLIDE_KICKERS = [
  "Decision deck · Executive answer",
  "Decision deck · What changed",
  "Decision deck · Where it concentrates",
  "Decision deck · Supporting evidence",
  "Decision deck · Evidence boundary",
  "Decision deck · Decision options",
  "Decision deck · Recommended next step",
] as const;

export const STORY_SLIDE_COUNTS = [3, 5, 7] as const;

function eligibleStoryInsights(insights: readonly Insight[]): Insight[] {
  return insights.filter(
    (insight) =>
      insight.validated === true &&
      insight.selectedForExecutiveStory === true,
  );
}

export function recommendExecutiveStorySlideCount(
  insights: readonly Insight[],
): StorySlideCount {
  const eligible = eligibleStoryInsights(insights);
  if (eligible.length === 0) return 3;
  const contentCharacters = eligible.reduce(
    (total, insight) =>
      total +
      insight.headline.length +
      insight.finding.length +
      insight.evidence.reduce(
        (evidenceTotal, item) =>
          evidenceTotal +
          item.label.length +
          item.value.length +
          (item.detail?.length ?? 0),
        0,
      ) +
      insight.limitations.reduce(
        (limitationTotal, item) => limitationTotal + item.length,
        0,
      ),
    0,
  );
  const evidenceCount = eligible.reduce(
    (total, insight) => total + insight.evidence.length,
    0,
  );
  const chartCount = eligible.filter((insight) => insight.chartSpec).length;
  const contentScore =
    eligible.length * 2 +
    Math.ceil(contentCharacters / 700) +
    chartCount +
    Math.ceil(evidenceCount / 3);

  if (eligible.length >= 5 || contentScore >= 16) return 7;
  if (eligible.length >= 3 || contentScore >= 8) return 5;
  return 3;
}

function kickersForSlideCount(slideCount: StorySlideCount) {
  if (slideCount === 7) return SEVEN_SLIDE_KICKERS;
  return slideCount === 5 ? FIVE_SLIDE_KICKERS : THREE_SLIDE_KICKERS;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return isSafeCodePoint(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#([0-9]+);?/g, (match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return isSafeCodePoint(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      return NAMED_ENTITIES[name.toLowerCase()] ?? match;
    });
}

function isSafeCodePoint(codePoint: number): boolean {
  return (
    Number.isInteger(codePoint) &&
    codePoint > 0 &&
    codePoint <= 0x10ffff &&
    !(codePoint >= 0xd800 && codePoint <= 0xdfff)
  );
}

/**
 * Converts untrusted labels into plain PowerPoint text. No HTML is interpreted;
 * active/embedded elements, unsafe protocols, and invalid XML controls are removed.
 */
export function sanitizePptText(
  value: unknown,
  maxLength = MAX_TEXT_LENGTH,
): string {
  if (value === null || value === undefined || maxLength <= 0) {
    return "";
  }

  const boundedLength = Math.min(
    Math.max(Math.trunc(maxLength), 0),
    MAX_TEXT_LENGTH,
  );
  let plainText = String(value).slice(0, Math.max(boundedLength * 8, 8_000));

  // Multiple passes also catch nested encodings such as &amp;lt;script&amp;gt;.
  for (let pass = 0; pass < 3; pass += 1) {
    plainText = decodeHtmlEntities(plainText);
  }

  for (let pass = 0; pass < 3; pass += 1) {
    const withoutBlockedElements = plainText.replace(BLOCKED_HTML_ELEMENTS, " ");
    if (withoutBlockedElements === plainText) {
      break;
    }
    plainText = withoutBlockedElements;
  }

  plainText = plainText
    .replace(UNCLOSED_BLOCKED_HTML_ELEMENT, " ")
    .replace(HTML_COMMENT_OR_DECLARATION, " ")
    .replace(HTML_TAG, " ")
    .replace(UNSAFE_PROTOCOL_PAYLOAD, "")
    .replace(XML_UNSAFE_CONTROL_CHARACTERS, " ")
    .replace(BIDI_CONTROL_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(plainText)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        !(codePoint >= 0xd800 && codePoint <= 0xdfff) &&
        codePoint !== 0xfffe &&
        codePoint !== 0xffff
      );
    })
    .slice(0, boundedLength)
    .join("")
    .trim();
}

/**
 * Produces a path-free, cross-platform filename and always applies one .pptx
 * extension. The function intentionally accepts text only, never image input.
 */
export function sanitizePptxFileName(
  value: unknown,
  fallback = "executive-story",
): string {
  const safeFallback =
    sanitizePptText(fallback, 80)
      .replace(/\.pptx$/i, "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .replace(/\.+/g, "-")
      .replace(/^[.\s]+|[.\s]+$/g, "")
      .replace(/[\s-]+/g, "-")
      .replace(/[.\s-]+$/g, "") || "executive-story";

  let baseName = sanitizePptText(value, 140)
    .replace(/\.pptx$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\.+/g, "-")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .replace(/[\s-]+/g, "-")
    .slice(0, 100)
    .replace(/[.\s-]+$/g, "");

  if (!baseName) {
    baseName = safeFallback;
  }

  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(baseName)) {
    baseName = `_${baseName}`;
  }

  return `${baseName}.pptx`;
}

function cleanRequiredText(
  value: unknown,
  fallback: string,
  maxLength: number,
): string {
  return sanitizePptText(value, maxLength) || fallback;
}

function finiteChartValue(value: number, fieldName: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${fieldName} must be a finite number.`);
  }
  return value;
}

/**
 * Clones chart data without aggregating, sorting, or otherwise recalculating it.
 */
export function sanitizeInsightChartSpec(
  chartSpec: InsightChartSpec,
): InsightChartSpec {
  return {
    kind: chartSpec.kind,
    title: cleanRequiredText(
      chartSpec.title,
      "Validated insight chart",
      180,
    ),
    ...(chartSpec.xLabel
      ? { xLabel: sanitizePptText(chartSpec.xLabel, 100) }
      : {}),
    ...(chartSpec.yLabel
      ? { yLabel: sanitizePptText(chartSpec.yLabel, 100) }
      : {}),
    unit: chartSpec.unit,
    data: chartSpec.data.map((datum, index) => ({
      label: cleanRequiredText(datum.label, `Point ${index + 1}`, 120),
      value: finiteChartValue(datum.value, `chartSpec.data[${index}].value`),
      ...(datum.secondaryValue === undefined
        ? {}
        : {
            secondaryValue: finiteChartValue(
              datum.secondaryValue,
              `chartSpec.data[${index}].secondaryValue`,
            ),
          }),
      ...(datum.group
        ? { group: sanitizePptText(datum.group, 100) || undefined }
        : {}),
    })),
  };
}

function evidenceText(item: EvidenceItem): string {
  const label = sanitizePptText(item.label, 140);
  const value = sanitizePptText(item.value, 160);
  const detail = sanitizePptText(item.detail, 220);
  const labelAndValue = [label, value].filter(Boolean).join(": ");

  return [labelAndValue, detail].filter(Boolean).join(" — ");
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => sanitizePptText(value, 120)).filter(Boolean))];
}

function sourceNote(insight: Insight, evidence: readonly EvidenceItem[]): string {
  const sourceIds = uniqueNonEmpty(
    evidence.flatMap((item) =>
      Array.isArray(item.sourceDatasetIds) ? item.sourceDatasetIds : [],
    ),
  );
  const metricIds = uniqueNonEmpty(
    Array.isArray(insight.metricIds) ? insight.metricIds : [],
  );
  const sourceSummary = sanitizePptText(sourceIds.join(", "), 180);
  const metricSummary = sanitizePptText(metricIds.join(", "), 180);
  const population = sanitizePptText(insight.population, 160);
  const period = sanitizePptText(insight.period, 100);

  return sanitizePptText(
    [
      `Sources: ${sourceSummary || "not specified"}`,
      `Metrics: ${metricSummary || "not specified"}`,
      population ? `Population: ${population}` : "",
      period ? `Period: ${period}` : "",
      "Data boundary: validated insights only; raw rows not included",
    ]
      .filter(Boolean)
      .join(" · "),
    MAX_NOTE_LENGTH,
  );
}

function limitationText(insight: Insight): string {
  const limitation = (Array.isArray(insight.limitations)
    ? insight.limitations
    : []
  )
    .map((item) => sanitizePptText(item, MAX_EVIDENCE_LENGTH))
    .find(Boolean);

  return limitation ?? "Limitation not specified in the validated insight.";
}

function slideFromInsight(
  insight: Insight,
  index: number,
  kicker: string,
  storyKey: string,
): ExecutiveSlide {
  const insightEvidence = Array.isArray(insight.evidence)
    ? insight.evidence.slice(0, 3)
    : [];
  const evidence = insightEvidence
    .map(evidenceText)
    .filter(Boolean)
    .slice(0, 3);
  const safeEvidence =
    evidence.length > 0
      ? evidence
      : [
          cleanRequiredText(
            insight.finding,
            "Evidence not specified in the validated insight.",
            MAX_EVIDENCE_LENGTH,
          ),
        ];

  return {
    id: `${storyKey}-slide-${index + 1}`,
    index,
    kicker,
    headline: cleanRequiredText(
      insight.headline,
      "Validated insight",
      MAX_HEADLINE_LENGTH,
    ),
    insightIds: [sanitizePptText(insight.id, 120)].filter(Boolean),
    ...(insight.chartSpec
      ? { chartSpec: sanitizeInsightChartSpec(insight.chartSpec) }
      : {}),
    evidence: safeEvidence,
    sourceNote: sourceNote(insight, insightEvidence),
    limitation: limitationText(insight),
  };
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Builds a 3-page brief, 5-page diagnostic, or 7-page decision deck exclusively
 * from selected, validated Insight objects. It never receives or reads datasets.
 *
 * If fewer eligible insights than pages are supplied, eligible insights repeat
 * in selection order so the requested deck shape remains exact; no values are
 * inferred or recomputed.
 */
export function buildExecutiveStory(
  insights: readonly Insight[],
  workspaceId: string,
  audience: ExecutiveStory["audience"],
  purpose: ExecutiveStory["purpose"],
  slideCount: StorySlideCount = 3,
): ExecutiveStory {
  if (!STORY_SLIDE_COUNTS.includes(slideCount)) {
    throw new RangeError("Executive stories support exactly 3, 5, or 7 slides.");
  }

  const eligibleInsights = eligibleStoryInsights(insights);

  if (eligibleInsights.length === 0) {
    throw new Error(
      "At least one validated, selected insight is required to build an executive story.",
    );
  }

  const storyKey = `executive-story-${stableHash(
    [
      workspaceId,
      audience,
      purpose,
      String(slideCount),
      ...eligibleInsights.map((insight) => insight.id),
    ].join("|"),
  )}`;
  const kickers = kickersForSlideCount(slideCount);
  const slides = Array.from({ length: slideCount }, (_, index) => {
    const insight = eligibleInsights[index % eligibleInsights.length];
    return slideFromInsight(insight, index, kickers[index], storyKey);
  });

  return {
    id: storyKey,
    workspaceId,
    audience,
    purpose,
    slideCount,
    slides,
    status: "Proposed",
    createdAt: new Date().toISOString(),
  };
}
