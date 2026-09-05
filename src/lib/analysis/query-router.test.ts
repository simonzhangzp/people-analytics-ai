import { describe, expect, it } from "vitest";
import type { LocalWorkbenchDataset } from "@/types/workbench";
import { resolveQueryIntent } from "./query-router";

function dataset(
  columns: Array<
    Partial<LocalWorkbenchDataset["metadata"]["columns"][number]> & {
      sourceName: string;
    }
  >,
  explorationRows: LocalWorkbenchDataset["explorationRows"] = [],
): LocalWorkbenchDataset {
  return {
    metadata: {
      id: "dataset:test",
      name: "people.csv",
      fingerprint: "test",
      localTableName: "people_test",
      fileSize: 100,
      rowCount: 5000,
      inferredType: "aggregate_people",
      typeConfidence: 0.9,
      grain: { label: "aggregate", keys: [], evidence: [] },
      grainConfidence: 0.9,
      columns: columns.map((column, index) => {
        const { sourceName, ...overrides } = column;
        return {
          sourceName,
          sourceIndex: column.sourceIndex ?? index,
          inferredType: column.inferredType ?? "string",
          rowCount: column.rowCount ?? 5000,
          nullCount: column.nullCount ?? 0,
          nullPct: column.nullPct ?? 0,
          distinctCount: column.distinctCount ?? 5,
          distinctPct: column.distinctPct ?? 0.1,
          likelyPII: column.likelyPII ?? false,
          ...overrides,
        };
      }),
      healthScore: 90,
      issues: [],
      status: "Proposed",
      safeProfile: {
        fileName: "people.csv",
        rowCount: 5000,
        columnCount: columns.length,
        inferredType: "aggregate_people",
        grain: "aggregate",
        grainConfidence: 0.9,
        columns: [],
      },
    },
    explorationRows,
  };
}

describe("hidden query routing", () => {
  it("treats headcount by country as a direct sum at the latest snapshot", () => {
    const source = dataset([
      {
        sourceName: "record_month",
        canonicalField: "snapshot_month",
        inferredType: "date",
      },
      { sourceName: "country", canonicalField: "country" },
      {
        sourceName: "headcount",
        canonicalField: "employee_count",
        inferredType: "number",
      },
    ]);
    const intent = resolveQueryIntent({
      question: "headcount by different country",
      datasets: [source],
      capabilities: [],
    });

    expect(intent).toMatchObject({
      difficulty: "simple",
      domain: "workforce",
      aggregation: "sum",
      measureField: "headcount",
      dimensions: ["country"],
      timeField: "record_month",
      timeStrategy: "latest",
    });
  });

  it("honors an explicit Excel column as the local distinct person key", () => {
    const source = dataset([
      {
        sourceName: "英文名(中文名)",
        likelyPII: true,
        distinctCount: 78,
        rowCount: 84,
      },
      {
        sourceName: "工作部门",
        canonicalField: "department",
        distinctCount: 8,
      },
      { sourceName: "岗位", canonicalField: "job_role", distinctCount: 12 },
    ]);
    const intent = resolveQueryIntent({
      question:
        "员工的 headcount by different cut，典型的员工是什么样的。用A列来count员工数。",
      datasets: [source],
      capabilities: [],
    });

    expect(intent).toMatchObject({
      difficulty: "simple",
      aggregation: "count_distinct",
      measureField: "英文名(中文名)",
    });
    expect(intent?.profileDimensions).toEqual(
      expect.arrayContaining(["工作部门", "岗位"]),
    );
  });

  it("routes Chinese degree distribution and education value questions", () => {
    const source = dataset(
      [
        {
          sourceName: "教育经历_学位",
          canonicalField: "academic_degree",
          semanticRole: "category",
        },
        {
          sourceName: "最高学历",
          canonicalField: "education_level",
          semanticRole: "category",
        },
      ],
      [
        { 教育经历_学位: "硕士", 最高学历: "硕士研究生" },
        { 教育经历_学位: "学士", 最高学历: "大学本科" },
      ],
    );

    expect(
      resolveQueryIntent({
        question: "学位的主要分布情况",
        datasets: [source],
        capabilities: [],
      }),
    ).toMatchObject({
      dimensions: ["教育经历_学位"],
      dimensionFilters: [],
    });
    expect(
      resolveQueryIntent({
        question: "本科学历有多少",
        datasets: [source],
        capabilities: [],
      }),
    ).toMatchObject({
      dimensions: ["最高学历"],
      dimensionFilters: [{ field: "最高学历", values: ["大学本科"] }],
    });
  });

  it("inherits metric context for a conversational trend follow-up", () => {
    const source = dataset([
      {
        sourceName: "record_month",
        canonicalField: "snapshot_month",
        inferredType: "date",
      },
      { sourceName: "country", canonicalField: "country" },
      {
        sourceName: "headcount",
        canonicalField: "employee_count",
        inferredType: "number",
      },
    ]);
    const first = resolveQueryIntent({
      question: "headcount by country",
      datasets: [source],
      capabilities: [],
    })!;
    const followUp = resolveQueryIntent({
      question: "show me the trend of US vs India",
      datasets: [source],
      capabilities: [],
      thread: [
        {
          id: "turn-1",
          question: "headcount by country",
          status: "complete",
          intent: first,
          insightIds: [],
          createdAt: "2026-08-28T00:00:00.000Z",
        },
      ],
    });

    expect(followUp).toMatchObject({
      domain: "workforce",
      measureField: "headcount",
      dimensions: ["country"],
      timeStrategy: "all",
      seriesValues: ["US", "India"],
    });
  });

  it("inherits from the selected branch parent instead of the latest turn", () => {
    const source = dataset([
      {
        sourceName: "record_month",
        canonicalField: "snapshot_month",
        inferredType: "date",
      },
      { sourceName: "country", canonicalField: "country" },
      { sourceName: "department", canonicalField: "department" },
      {
        sourceName: "headcount",
        canonicalField: "employee_count",
        inferredType: "number",
      },
    ]);
    const countryIntent = resolveQueryIntent({
      question: "headcount by country",
      datasets: [source],
      capabilities: [],
    })!;
    const departmentIntent = resolveQueryIntent({
      question: "headcount by department",
      datasets: [source],
      capabilities: [],
    })!;
    const thread = [
      {
        id: "country-turn",
        question: "headcount by country",
        status: "complete" as const,
        intent: countryIntent,
        insightIds: [],
        createdAt: "2026-08-28T00:00:00.000Z",
      },
      {
        id: "department-turn",
        question: "headcount by department",
        status: "complete" as const,
        intent: departmentIntent,
        insightIds: [],
        createdAt: "2026-08-28T00:01:00.000Z",
      },
    ];

    const branched = resolveQueryIntent({
      question: "show me the trend",
      datasets: [source],
      capabilities: [],
      thread,
      parentTurnId: "country-turn",
    });

    expect(branched).toMatchObject({
      dimensions: ["country"],
      inheritedFromTurnId: "country-turn",
      timeStrategy: "all",
    });
  });

  it("uses gender and nationality as aggregate cuts for a profile question", () => {
    const source = dataset([
      {
        sourceName: "英文名(中文名)",
        sourceIndex: 0,
        likelyPII: true,
        distinctCount: 78,
        rowCount: 84,
      },
      {
        sourceName: "性别",
        canonicalField: "gender",
        semanticRole: "sensitive_dimension",
        sensitive: true,
        distinctCount: 2,
      },
      {
        sourceName: "国籍",
        canonicalField: "nationality",
        semanticRole: "sensitive_dimension",
        sensitive: true,
        distinctCount: 4,
      },
      { sourceName: "工作部门", canonicalField: "department", distinctCount: 8 },
      {
        sourceName: "专业职级",
        canonicalField: "seniority_level",
        distinctCount: 6,
      },
    ]);
    const intent = resolveQueryIntent({
      question:
        "用A列作为员工ID。告诉我HC，以及gender、nationality、org、level等主要cut。什么样的员工最典型？",
      datasets: [source],
      capabilities: [],
    });
    expect(intent).toMatchObject({
      aggregation: "count_distinct",
      measureField: "英文名(中文名)",
    });
    expect(intent?.dimensions).toEqual(
      expect.arrayContaining(["性别", "国籍", "工作部门", "专业职级"]),
    );
  });

  it("applies a top-N limit without rebuilding the measure", () => {
    const source = dataset([
      {
        sourceName: "record_month",
        canonicalField: "snapshot_month",
        inferredType: "date",
      },
      { sourceName: "country", canonicalField: "country" },
      {
        sourceName: "headcount",
        canonicalField: "employee_count",
        inferredType: "number",
      },
    ]);
    const first = resolveQueryIntent({
      question: "headcount by country",
      datasets: [source],
      capabilities: [],
    })!;
    const followUp = resolveQueryIntent({
      question: "show top 10",
      datasets: [source],
      capabilities: [],
      thread: [
        {
          id: "turn-1",
          question: "headcount by country",
          status: "complete",
          intent: first,
          insightIds: [],
          createdAt: "2026-08-28T00:00:00.000Z",
        },
      ],
    });
    expect(followUp).toMatchObject({
      aggregation: "sum",
      measureField: "headcount",
      dimensions: ["country"],
      limit: 10,
      timeStrategy: "latest",
    });
  });

  it("keeps the person key and marks a leadership follow-up", () => {
    const source = dataset([
      {
        sourceName: "英文名(中文名)",
        sourceIndex: 0,
        likelyPII: true,
        distinctCount: 78,
        rowCount: 84,
      },
      { sourceName: "岗位", canonicalField: "job_role", distinctCount: 12 },
    ]);
    const first = resolveQueryIntent({
      question: "用A列作为员工ID。告诉我HC。",
      datasets: [source],
      capabilities: [],
    })!;
    const followUp = resolveQueryIntent({
      question: "show me leadership only",
      datasets: [source],
      capabilities: [],
      thread: [
        {
          id: "turn-1",
          question: "用A列作为员工ID。告诉我HC。",
          status: "complete",
          intent: first,
          insightIds: [],
          createdAt: "2026-08-28T00:00:00.000Z",
        },
      ],
    });
    expect(followUp).toMatchObject({
      aggregation: "count_distinct",
      measureField: "英文名(中文名)",
      populationHint: "leadership",
    });
  });

  it("diagnoses India growth using People explore dimensions", () => {
    const source = dataset([
      {
        sourceName: "record_month",
        canonicalField: "snapshot_month",
        inferredType: "date",
      },
      { sourceName: "country", canonicalField: "country" },
      {
        sourceName: "location_people",
        canonicalField: "location",
        distinctCount: 20,
      },
      {
        sourceName: "job_function",
        canonicalField: "job_role",
        distinctCount: 12,
      },
      {
        sourceName: "dept_finance",
        canonicalField: "department",
        distinctCount: 15,
      },
      {
        sourceName: "headcount",
        canonicalField: "employee_count",
        inferredType: "number",
      },
    ]);
    const first = resolveQueryIntent({
      question: "headcount by country",
      datasets: [source],
      capabilities: [],
    })!;
    const trend = resolveQueryIntent({
      question: "show US and India trend",
      datasets: [source],
      capabilities: [],
      thread: [
        {
          id: "turn-1",
          question: "headcount by country",
          status: "complete",
          intent: first,
          insightIds: [],
          createdAt: "2026-08-28T00:00:00.000Z",
        },
      ],
    })!;
    const diagnostic = resolveQueryIntent({
      question: "where did India growth come from?",
      datasets: [source],
      capabilities: [],
      thread: [
        {
          id: "turn-1",
          question: "headcount by country",
          status: "complete",
          intent: first,
          insightIds: [],
          createdAt: "2026-08-28T00:00:00.000Z",
        },
        {
          id: "turn-2",
          question: "show US and India trend",
          status: "complete",
          intent: trend,
          insightIds: [],
          createdAt: "2026-08-28T00:01:00.000Z",
        },
      ],
    });
    expect(diagnostic).toMatchObject({
      difficulty: "diagnostic",
      aggregation: "sum",
      measureField: "headcount",
      timeStrategy: "all",
    });
    expect(diagnostic?.seriesValues).toEqual(expect.arrayContaining(["India"]));
    expect(diagnostic?.exploreDimensions).toEqual(
      expect.arrayContaining(["location_people", "job_function", "dept_finance"]),
    );
  });
});
