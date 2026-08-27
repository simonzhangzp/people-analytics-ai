import type {
  StageContribution,
  StageDuration,
  TimeToFillAnalysis,
} from "@/types/domain";

const round = (value: number, precision = 1) => {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/**
 * Calculates the Time to Fill gap from deterministic stage aggregates.
 * Narrative text can explain this result, but an LLM never calculates it.
 */
export function calculateTimeToFillAnalysis(
  stages: StageDuration[],
): TimeToFillAnalysis {
  if (stages.length === 0) {
    throw new Error("At least one recruiting stage is required.");
  }

  const currentDays = round(sum(stages.map((stage) => stage.currentDays)));
  const targetDays = round(sum(stages.map((stage) => stage.targetDays)));
  const gapDays = round(currentDays - targetDays);

  const stageContributions: StageContribution[] = stages
    .map((stage) => {
      const excessDays = round(stage.currentDays - stage.targetDays);
      return {
        ...stage,
        excessDays,
        contributionPercent:
          gapDays > 0 ? round((excessDays / gapDays) * 100) : 0,
      };
    })
    .sort((a, b) => b.excessDays - a.excessDays);

  return {
    currentDays,
    targetDays,
    gapDays,
    primaryDriver: stageContributions[0],
    stageContributions,
  };
}

export function calculateReadinessScore(scores: Record<string, number>) {
  const values = Object.values(scores);
  if (values.length === 0) {
    throw new Error("At least one readiness score is required.");
  }

  return Math.round(sum(values) / values.length);
}
