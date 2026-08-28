import { readFileSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { buildCapabilityReports } from "../src/lib/semantics/answerability";
import {
  isWorkbenchLikelyPii,
  resolveWorkbenchCanonicalField,
} from "../src/lib/semantics/canonical-fields";
import { buildTableContract } from "../src/lib/semantics/contracts";
import { inferTableGrain } from "../src/lib/semantics/grain-inference";
import type {
  ColumnDataType,
  ColumnProfile,
  DatasetMetadata,
} from "../src/types/workbench";

const FIXTURES = [
  ["workforce", "workforce.csv", "employee_snapshot"],
  ["retention", "retention.csv", "termination_event"],
  ["recruiting", "recruiting.csv", "candidate_application"],
  ["compensation", "compensation.csv", "compensation"],
  ["performance", "performance.csv", "performance_review"],
  ["absence", "absence.csv", "absence"],
  ["engagement", "engagement.csv", "engagement_survey"],
  ["learning", "learning.csv", "learning_record"],
  ["mobility", "mobility.csv", "mobility"],
  ["diversity", "diversity.csv", "demographics"],
] as const;
const root = path.resolve(import.meta.dirname, "..");

function inferredType(expected?: string): ColumnDataType {
  if (expected === "number") return "number";
  if (expected === "boolean") return "boolean";
  if (expected === "date") return "date";
  return "string";
}

function fixtureMetadata(
  domain: (typeof FIXTURES)[number][0],
  fileName: string,
): DatasetMetadata {
  const filePath = path.join(root, "tests", "fixtures", "hr", fileName);
  const parsed = Papa.parse<Record<string, string>>(readFileSync(filePath, "utf8"), {
    header: true,
    skipEmptyLines: true,
  });
  expect(parsed.errors).toHaveLength(0);
  const headers = parsed.meta.fields ?? [];
  const rowCount = parsed.data.length;
  const columns: ColumnProfile[] = headers.map((sourceName) => {
    const mapping = resolveWorkbenchCanonicalField(sourceName);
    const values = parsed.data.map((row) => row[sourceName]).filter(Boolean);
    const likelyPII = isWorkbenchLikelyPii(sourceName);
    return {
      sourceName,
      inferredType: inferredType(mapping?.expectedType),
      rowCount,
      nullCount: rowCount - values.length,
      nullPct: ((rowCount - values.length) / rowCount) * 100,
      distinctCount: new Set(values).size,
      distinctPct: (new Set(values).size / Math.max(values.length, 1)) * 100,
      likelyPII,
      sensitive: mapping?.sensitive,
      canonicalField: mapping?.canonicalField,
      semanticRole: mapping?.semanticRole,
      semanticMeaning: mapping?.semanticMeaning,
      confidence: mapping?.confidence,
    };
  });
  const inference = inferTableGrain({ columns });
  const id = `fixture:${domain}`;
  const tableContract = buildTableContract({
    datasetId: id,
    columns,
    inference,
  });
  return {
    id,
    name: fileName,
    fingerprint: id,
    localTableName: id.replace(":", "_"),
    fileSize: readFileSync(filePath).byteLength,
    rowCount,
    inferredType: inference.inferredType,
    typeConfidence: inference.typeConfidence,
    grain: inference.grain,
    grainConfidence: inference.grainConfidence,
    columns,
    healthScore: 100,
    issues: [],
    status: "Proposed",
    tableContract,
    safeProfile: {
      fileName,
      rowCount,
      columnCount: columns.length,
      inferredType: inference.inferredType,
      grain: inference.grain.label,
      grainConfidence: inference.grainConfidence / 100,
      columns,
    },
  };
}

describe("owned ten-domain HR fixtures", () => {
  const datasets = FIXTURES.map(([domain, fileName]) =>
    fixtureMetadata(domain, fileName),
  );

  it("infers the expected contract for every domain fixture", () => {
    for (const [index, [domain, , expectedType]] of FIXTURES.entries()) {
      const dataset = datasets[index];
      expect(dataset.tableContract?.tableType, domain).toBe(expectedType);
      expect(dataset.tableContract?.domains, domain).toContain(domain);
    }
  });

  it("makes all ten deterministic capabilities runnable", () => {
    const reports = buildCapabilityReports(datasets);
    expect(reports).toHaveLength(10);
    expect(reports.every((report) => report.runnable)).toBe(true);
    expect(new Set(reports.map((report) => report.domain))).toEqual(
      new Set(FIXTURES.map(([domain]) => domain)),
    );
  });

  it("marks direct identifiers and protected demographics safely", () => {
    const employeeIds = datasets.flatMap((dataset) =>
      dataset.columns.filter((column) => column.canonicalField === "employee_id"),
    );
    expect(employeeIds.length).toBeGreaterThan(0);
    expect(employeeIds.every((column) => column.likelyPII)).toBe(true);
    const demographic = datasets
      .find((dataset) => dataset.id === "fixture:diversity")
      ?.columns.find(
        (column) => column.canonicalField === "demographic_category",
      );
    expect(demographic?.sensitive).toBe(true);
    expect(demographic?.semanticRole).toBe("sensitive_dimension");
  });

  it("keeps generic runtime free of demo population and period constants", () => {
    const sources = [
      "src/lib/workbench/runtime.ts",
      "src/lib/workbench/attrition-runtime.ts",
      "src/lib/analysis/registry.ts",
      "src/lib/analysis/executors/generic.ts",
      "src/components/workbench/WorkbenchProvider.tsx",
    ]
      .map((file) => readFileSync(path.join(root, file), "utf8"))
      .join("\n");
    expect(sources).not.toMatch(
      /Engineering|Jul.?Dec 2025|Jan.?Jun 2026|retirementClassification\s*:\s*["']excluded/,
    );
  });
});
