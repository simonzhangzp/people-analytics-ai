import type {
  ConfidenceLevel,
  EvidenceItem,
  Insight,
} from "@/types/workbench";
import type {
  AttritionAnalysisResult,
  SegmentContribution,
} from "./attrition";

export interface AttritionInsightOptions {
  questionId: string;
  metricIds?: string[];
  sourceDatasetIds?: string[];
}

function signed(value: number | null, unit: string): string {
  if (value === null) return "Unavailable";
  return `${value > 0 ? "+" : ""}${value}${unit}`;
}

function rate(value: number | null): string {
  return value === null ? "Unavailable" : `${value}%`;
}

function evidence(
  id: string,
  label: string,
  value: string,
  sourceDatasetIds: string[],
  detail?: string,
): EvidenceItem {
  return { id, label, value, detail, sourceDatasetIds };
}

function contributionConfidence(
  contribution: SegmentContribution | undefined,
  fallback: ConfidenceLevel,
): ConfidenceLevel {
  if (!contribution) return "Low";
  if (
    contribution.comparisonExits < 5 ||
    contribution.currentExits < 5
  ) {
    return "Low";
  }
  return fallback;
}

function baseInsight(
  result: AttritionAnalysisResult,
  options: AttritionInsightOptions,
): Pick<
  Insight,
  | "questionId"
  | "metricIds"
  | "filters"
  | "period"
  | "comparisonPeriod"
  | "population"
  | "selectedForExecutiveStory"
> {
  return {
    questionId: options.questionId,
    metricIds: options.metricIds ?? [result.metricId],
    filters: { population: result.population },
    period: result.periods.current.label,
    comparisonPeriod: result.periods.comparison.label,
    population: result.population,
    selectedForExecutiveStory: false,
  };
}

/**
 * Turns deterministic results into evidence-complete Workbench insights. Each
 * item retains population, periods, exact values, confidence, limitations, and
 * an explicit next diagnostic branch.
 */
export function buildAttritionInsights(
  result: AttritionAnalysisResult,
  options: AttritionInsightOptions,
): Insight[] {
  const sourceDatasetIds =
    options.sourceDatasetIds?.length
      ? [...options.sourceDatasetIds]
      : ["local-workbench"];
  const base = baseInsight(result, options);
  const change = result.trend.voluntaryChangePp;
  const topTenure = result.tenureContribution[0];
  const topLevel = result.levelContribution[0];
  const compensation = result.compensationAssociation;
  const manager = result.managerAnalysis;

  const trendInsight: Insight = {
    id: `${options.questionId}-trend`,
    ...base,
    branchKey: "trend",
    headline:
      change === null
        ? `${result.population} voluntary attrition trend is unavailable`
        : `${result.population} voluntary attrition changed ${signed(change, " pp")}`,
    finding: `${result.periods.current.label} voluntary attrition was ${rate(
      result.trend.current.voluntaryAttritionRate,
    )}, compared with ${rate(
      result.trend.comparison.voluntaryAttritionRate,
    )} in ${result.periods.comparison.label}.`,
    evidence: [
      evidence(
        `${options.questionId}-trend-current-rate`,
        "Current voluntary attrition",
        rate(result.trend.current.voluntaryAttritionRate),
        sourceDatasetIds,
        `${result.trend.current.voluntaryExits} voluntary exits / ${result.trend.current.denominator} ${result.denominatorBasis} headcount`,
      ),
      evidence(
        `${options.questionId}-trend-comparison-rate`,
        "Comparison voluntary attrition",
        rate(result.trend.comparison.voluntaryAttritionRate),
        sourceDatasetIds,
        `${result.trend.comparison.voluntaryExits} voluntary exits / ${result.trend.comparison.denominator} ${result.denominatorBasis} headcount`,
      ),
      evidence(
        `${options.questionId}-trend-change`,
        "Percentage-point change",
        signed(change, " pp"),
        sourceDatasetIds,
        "Current rate minus comparison rate",
      ),
    ],
    confidence: result.confidence,
    limitations: [
      ...result.limitations.filter(
        (limitation) => !limitation.toLowerCase().includes("compensation"),
      ),
      `Rates use ${result.denominatorBasis} headcount under metric version ${result.metricVersion}.`,
    ],
    suggestedFollowUps: [
      {
        key: "tenure",
        label: "Decompose the change by tenure",
        available: result.tenureContribution.length > 0,
        unavailableReason: result.tenureContribution.length
          ? undefined
          : "tenureBand is missing.",
      },
      {
        key: "level",
        label: "Decompose the change by level",
        available: result.levelContribution.length > 0,
        unavailableReason: result.levelContribution.length
          ? undefined
          : "level is missing.",
      },
    ],
    selectedForExecutiveStory: false,
    validated: change !== null,
  };

  const tenureInsight: Insight = {
    id: `${options.questionId}-tenure`,
    ...base,
    branchKey: "tenure",
    headline: topTenure
      ? `${topTenure.segment} contributed ${topTenure.shareOfChangePct ?? "unavailable"}% of the attrition-rate change`
      : "Tenure contribution is unavailable",
    finding: topTenure
      ? `${topTenure.segment} contributed ${signed(
          topTenure.contributionPp,
          " pp",
        )}; its observed exit rate moved from ${rate(
          topTenure.comparisonExitRate,
        )} to ${rate(topTenure.currentExitRate)}.`
      : "No tenure-band evidence was available for contribution analysis.",
    evidence: [
      evidence(
        `${options.questionId}-tenure-share`,
        "Share of total rate change",
        topTenure?.shareOfChangePct === null || !topTenure
          ? "Unavailable"
          : `${topTenure.shareOfChangePct}%`,
        sourceDatasetIds,
        topTenure
          ? `${signed(topTenure.contributionPp, " pp")} / ${signed(change, " pp")}`
          : "tenureBand is missing",
      ),
      evidence(
        `${options.questionId}-tenure-exits`,
        "Voluntary exits",
        topTenure
          ? `${topTenure.comparisonExits} → ${topTenure.currentExits}`
          : "Unavailable",
        sourceDatasetIds,
        `${result.periods.comparison.label} → ${result.periods.current.label}`,
      ),
    ],
    confidence: contributionConfidence(topTenure, result.confidence),
    limitations: [
      "Contribution is an additive percentage-point decomposition, not a causal attribution.",
      topTenure?.segment === "Unknown"
        ? "The leading tenure contribution comes from rows without a tenure band."
        : "Tenure bands use the values supplied in the approved local data.",
    ],
    suggestedFollowUps: [
      {
        key: "level",
        label: "Check whether the tenure contribution concentrates by level",
        available: result.levelContribution.length > 0,
        unavailableReason: result.levelContribution.length
          ? undefined
          : "level is missing.",
      },
    ],
    selectedForExecutiveStory: false,
    validated: Boolean(topTenure),
  };

  const levelInsight: Insight = {
    id: `${options.questionId}-level`,
    ...base,
    branchKey: "level",
    headline: topLevel
      ? `${topLevel.segment} has the largest level contribution at ${signed(
          topLevel.contributionPp,
          " pp",
        )}`
      : "Level contribution is unavailable",
    finding: topLevel
      ? `${topLevel.segment} represented ${topLevel.shareOfChangePct ?? "an unavailable share of"}% of the total voluntary attrition-rate change.`
      : "No employee-level evidence was available for contribution analysis.",
    evidence: [
      evidence(
        `${options.questionId}-level-contribution`,
        "Level contribution",
        signed(topLevel?.contributionPp ?? null, " pp"),
        sourceDatasetIds,
        topLevel
          ? `${topLevel.comparisonExits} comparison exits and ${topLevel.currentExits} current exits`
          : "level is missing",
      ),
      evidence(
        `${options.questionId}-level-rate`,
        "Observed level exit rate",
        topLevel
          ? `${rate(topLevel.comparisonExitRate)} → ${rate(topLevel.currentExitRate)}`
          : "Unavailable",
        sourceDatasetIds,
      ),
    ],
    confidence: contributionConfidence(topLevel, result.confidence),
    limitations: [
      "Level contribution is descriptive and does not adjust for role, geography, tenure, or workforce-composition changes.",
    ],
    suggestedFollowUps: [
      {
        key: "compensation",
        label: "Compare compensation positioning and exit rate",
        available: compensation.status === "observed",
        unavailableReason:
          compensation.status === "observed"
            ? undefined
            : "Both compensation-positioning comparison groups are required.",
      },
    ],
    selectedForExecutiveStory: false,
    validated: Boolean(topLevel),
  };

  const compensationInsight: Insight = {
    id: `${options.questionId}-compensation`,
    ...base,
    branchKey: "compensation",
    headline:
      compensation.status === "observed"
        ? `Below-market positioning had a ${signed(
            compensation.differencePp,
            " pp",
          )} observed exit-rate difference`
        : "Compensation association is unavailable",
    finding: compensation.observedAssociation,
    evidence: [
      evidence(
        `${options.questionId}-compensation-below`,
        "Below-market observed exit rate",
        rate(compensation.belowMarketExitRate),
        sourceDatasetIds,
      ),
      evidence(
        `${options.questionId}-compensation-reference`,
        "At-or-above-market observed exit rate",
        rate(compensation.atOrAboveMarketExitRate),
        sourceDatasetIds,
      ),
      evidence(
        `${options.questionId}-compensation-difference`,
        "Observed rate difference",
        signed(compensation.differencePp, " pp"),
        sourceDatasetIds,
        `${compensation.missingPositioningRows} current-period rows lack compensation positioning`,
      ),
    ],
    confidence: compensation.confidence,
    limitations: [compensation.limitation],
    suggestedFollowUps: [
      {
        key: "organization",
        label: "Assess manager-level concentration",
        available: manager.status === "available",
        unavailableReason:
          manager.status === "blocked" ? manager.reason : undefined,
      },
    ],
    selectedForExecutiveStory: false,
    validated: compensation.status === "observed",
  };

  const managerInsight: Insight = {
    id: `${options.questionId}-manager-gap`,
    ...base,
    branchKey: "organization",
    headline:
      manager.status === "blocked"
        ? "Manager analysis is blocked by missing manager evidence"
        : `Manager evidence covers ${manager.coveragePct}% of the current population`,
    finding:
      manager.status === "blocked"
        ? manager.reason!
        : `Manager identifiers cover ${manager.coveredRows} rows; ${manager.missingRows} rows remain unassigned.`,
    evidence: [
      evidence(
        `${options.questionId}-manager-coverage`,
        "Manager ID coverage",
        `${manager.coveragePct}%`,
        sourceDatasetIds,
        `${manager.coveredRows} covered; ${manager.missingRows} missing`,
      ),
    ],
    confidence:
      manager.status === "blocked"
        ? "Low"
        : manager.coveragePct >= 90
          ? "High"
          : "Medium",
    limitations: [
      manager.reason ??
        "Manager comparisons still require minimum group-size and privacy controls.",
    ],
    suggestedFollowUps: [
      {
        key: "organization",
        label: "Add the approved employee-to-manager hierarchy",
        available: manager.status === "available",
        unavailableReason:
          manager.status === "blocked" ? manager.reason : undefined,
      },
    ],
    selectedForExecutiveStory: false,
    validated: manager.status === "available",
  };

  return [
    trendInsight,
    tenureInsight,
    levelInsight,
    compensationInsight,
    managerInsight,
  ];
}
