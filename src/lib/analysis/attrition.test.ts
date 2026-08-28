import { describe, expect, it } from "vitest";
import {
  VOLUNTARY_ATTRITION_METRIC,
} from "@/lib/metrics/library";
import {
  applyMetricDefinitionPatch,
  createHeadcountBasisPatch,
  createRetirementClassificationPatch,
} from "@/lib/metrics/patches";
import {
  executeAttritionAnalysis,
  executeAttritionAnalysisWithAdapter,
  type AttritionPeriods,
  type AttritionQueryAdapter,
  type AttritionRow,
} from "./attrition";
import { buildAttritionInsights } from "./insights";

const periods: AttritionPeriods = {
  comparison: { id: "2025", label: "FY2025" },
  current: { id: "2026", label: "FY2026" },
};

function groupRows(
  period: string,
  group: string,
  level: string,
  compensationPositioning: number,
  exits: number,
): AttritionRow[] {
  return [
    {
      employeeId: `${period}-${group}-exits`,
      period,
      department: "Engineering",
      tenureBand: group,
      level,
      compensationPositioning,
      activeAtStart: true,
      activeAtEnd: false,
      exitEvent: true,
      terminationType: "Voluntary",
      weight: exits,
    },
    {
      employeeId: `${period}-${group}-stayers`,
      period,
      department: "Engineering",
      tenureBand: group,
      level,
      compensationPositioning,
      activeAtStart: true,
      activeAtEnd: true,
      weight: 100 - exits,
    },
    {
      employeeId: `${period}-${group}-replacements`,
      period,
      department: "Engineering",
      tenureBand: group,
      level,
      compensationPositioning,
      activeAtStart: false,
      activeAtEnd: true,
      weight: exits,
    },
  ];
}

function engineeringRows(): AttritionRow[] {
  return [
    ...groupRows("2025", "2–4 years", "L4", 0.85, 4),
    ...groupRows("2025", "Other tenure", "L5", 1.05, 16),
    ...groupRows("2026", "2–4 years", "L4", 0.85, 10.12),
    ...groupRows("2026", "Other tenure", "L5", 1.05, 18.88),
  ];
}

function retirementRows(): AttritionRow[] {
  return ["2025", "2026"].flatMap((period) => [
    {
      employeeId: `${period}-voluntary`,
      period,
      tenureBand: "2–4 years",
      level: "L4",
      activeAtStart: true,
      activeAtEnd: false,
      exitEvent: true,
      terminationType: "Voluntary",
    },
    {
      employeeId: `${period}-retirement`,
      period,
      tenureBand: "5+ years",
      level: "L5",
      activeAtStart: true,
      activeAtEnd: false,
      exitEvent: true,
      terminationType: "Retirement",
    },
    {
      employeeId: `${period}-stayers`,
      period,
      tenureBand: "Other",
      level: "L4",
      activeAtStart: true,
      activeAtEnd: true,
      weight: 8,
    },
  ]);
}

describe("deterministic attrition analysis", () => {
  it("calculates Engineering +4.5 pp and a 68% 2–4 year contribution", () => {
    const result = executeAttritionAnalysis({
      rows: engineeringRows(),
      periods,
      population: "Engineering",
      populationFilter: (row) => row.department === "Engineering",
    });

    expect(result.trend.comparison.voluntaryAttritionRate).toBe(10);
    expect(result.trend.current.voluntaryAttritionRate).toBe(14.5);
    expect(result.trend.voluntaryChangePp).toBe(4.5);
    expect(result.trend.current.totalAttritionRate).toBe(14.5);
    expect(result.tenureContribution[0]).toMatchObject({
      segment: "2–4 years",
      contributionPp: 3.06,
      shareOfChangePct: 68,
    });
    expect(result.managerAnalysis.status).toBe("blocked");
    expect(result.managerAnalysis.reason).toMatch(/managerId is missing/);
    expect(result.compensationAssociation.causal).toBe(false);
    expect(result.compensationAssociation.observedAssociation).toMatch(
      /association, not causation/i,
    );
  });

  it("changes denominator and retirement treatment when definitions are applied", () => {
    const base = executeAttritionAnalysis({
      rows: retirementRows(),
      periods,
      population: "Engineering",
    });
    const beginningDefinition = applyMetricDefinitionPatch(
      createHeadcountBasisPatch(VOLUNTARY_ATTRITION_METRIC, "beginning"),
      "2026-08-27T12:00:00.000Z",
    );
    const beginning = executeAttritionAnalysis({
      rows: retirementRows(),
      periods,
      population: "Engineering",
      metricDefinition: beginningDefinition,
    });
    const retirementDefinition = applyMetricDefinitionPatch(
      createRetirementClassificationPatch(
        VOLUNTARY_ATTRITION_METRIC,
        "voluntary",
      ),
      "2026-08-27T12:00:00.000Z",
    );
    const retirementIncluded = executeAttritionAnalysis({
      rows: retirementRows(),
      periods,
      population: "Engineering",
      metricDefinition: retirementDefinition,
    });

    expect(base.denominatorBasis).toBe("average");
    expect(base.trend.current.denominator).toBe(9);
    expect(base.trend.current.voluntaryAttritionRate).toBe(11.11);
    expect(base.trend.current.totalExits).toBe(2);
    expect(beginning.denominatorBasis).toBe("beginning");
    expect(beginning.trend.current.denominator).toBe(10);
    expect(beginning.trend.current.voluntaryAttritionRate).toBe(10);
    expect(retirementIncluded.retirementClassification).toBe("voluntary");
    expect(retirementIncluded.trend.current.voluntaryExits).toBe(2);
    expect(retirementIncluded.trend.current.voluntaryAttritionRate).toBe(22.22);
  });

  it("loads canonical rows through an injectable parameterized adapter", async () => {
    let capturedSql = "";
    let capturedParameters: readonly unknown[] = [];
    const adapter: AttritionQueryAdapter = {
      async query<T>(sql: string, parameters: readonly unknown[]) {
        capturedSql = sql;
        capturedParameters = parameters;
        return engineeringRows() as unknown as readonly T[];
      },
    };

    const result = await executeAttritionAnalysisWithAdapter(
      adapter,
      {
        tableName: "main.workforce",
        columns: {
          employeeId: "employee_id",
          period: "fiscal_year",
          department: "department",
          tenureBand: "tenure_band",
          level: "level",
          compensationPositioning: "compa_ratio",
          managerId: "manager_id",
          activeAtStart: "active_at_start",
          activeAtEnd: "active_at_end",
          exitEvent: "exit_event",
          terminationType: "termination_type",
          weight: "analytic_weight",
        },
      },
      {
        periods,
        population: "Engineering",
        populationFilter: (row) => row.department === "Engineering",
      },
    );

    expect(capturedSql).toContain('FROM "main"."workforce"');
    expect(capturedSql).toContain('"fiscal_year" IN (?, ?)');
    expect(capturedParameters).toEqual(["2025", "2026"]);
    expect(result.trend.voluntaryChangePp).toBe(4.5);
  });

  it("builds evidence-complete insights and labels association as non-causal", () => {
    const result = executeAttritionAnalysis({
      rows: engineeringRows(),
      periods,
      population: "Engineering",
    });
    const insights = buildAttritionInsights(result, {
      questionId: "question-attrition",
      sourceDatasetIds: ["workforce-local"],
    });

    expect(insights).toHaveLength(5);
    for (const insight of insights) {
      expect(insight.population).toBe("Engineering");
      expect(insight.period).toBe("FY2026");
      expect(insight.comparisonPeriod).toBe("FY2025");
      expect(insight.evidence.length).toBeGreaterThan(0);
      expect(insight.evidence.every((item) => item.value.length > 0)).toBe(true);
      expect(insight.confidence).toMatch(/High|Medium|Low/);
      expect(insight.limitations.length).toBeGreaterThan(0);
      expect(insight.suggestedFollowUps.length).toBeGreaterThan(0);
    }
    expect(insights.find((item) => item.branchKey === "trend")?.headline).toMatch(
      /\+4.5 pp/,
    );
    expect(insights.find((item) => item.branchKey === "tenure")?.headline).toMatch(
      /68%/,
    );
    const compensation = insights.find(
      (item) => item.branchKey === "compensation",
    );
    expect(`${compensation?.finding} ${compensation?.limitations.join(" ")}`).toMatch(
      /association, not causation/i,
    );
  });
});
