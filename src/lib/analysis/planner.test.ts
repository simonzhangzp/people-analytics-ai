import { describe, expect, it } from "vitest";
import type { AnalysisQuestion } from "@/types/workbench";
import { createAttritionAnalysisPlan } from "./planner";

const question: AnalysisQuestion = {
  id: "question-engineering-attrition",
  text: "Why did Engineering voluntary attrition increase?",
  metricIds: ["metric-voluntary-attrition"],
  createdAt: "2026-08-27T10:00:00.000Z",
};

describe("attrition analysis planner", () => {
  it("uses the trend → tenure → level → compensation → manager path", () => {
    const plan = createAttritionAnalysisPlan(question, {
      createdAt: "2026-08-27T11:00:00.000Z",
      availableFields: [
        "period",
        "tenure_band",
        "level",
        "compensation_positioning",
      ],
    });

    expect(plan.questionId).toBe(question.id);
    expect(plan.createdAt).toBe("2026-08-27T11:00:00.000Z");
    expect(plan.steps.map((step) => step.id)).toEqual([
      "attrition-trend",
      "attrition-tenure-contribution",
      "attrition-level-contribution",
      "attrition-compensation-association",
      "attrition-manager-data-gap",
    ]);
    expect(plan.steps.at(-1)).toMatchObject({
      operation: "data_gap",
      status: "blocked",
    });
    expect(plan.steps.at(-1)?.blockedReason).toMatch(/manager_id is not available/);
  });

  it("plans manager segmentation only when approved manager evidence exists", () => {
    const plan = createAttritionAnalysisPlan(question, {
      availableFields: ["manager_id"],
    });

    expect(plan.steps.at(-1)).toMatchObject({
      operation: "segment",
      status: "planned",
      dimensions: ["manager_id"],
    });
  });
});
