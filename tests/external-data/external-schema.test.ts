import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import readWorkbook from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import { resolveTableHeaders } from "../../src/lib/data/report-headers";
import { buildTableContract } from "../../src/lib/semantics/contracts";
import { inferTableGrain } from "../../src/lib/semantics/grain-inference";
import {
  isWorkbenchLikelyPii,
  resolveWorkbenchCanonicalField,
} from "../../src/lib/semantics/canonical-fields";
import { buildCapabilityReports } from "../../src/lib/semantics/answerability";
import type {
  ColumnDataType,
  ColumnProfile,
  DatasetMetadata,
} from "../../src/types/workbench";

interface ExternalEntry {
  id: string;
  fileName: string;
  format: "csv" | "xlsx";
  domain: string;
  expectedTableTypes: string[];
  expectedCanonicalAny: string[];
  sha256: string;
  license: { name: string; url: string };
}

const root = path.resolve(import.meta.dirname, "..", "..");
const manifest = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "manifest.json"), "utf8"),
) as {
  cacheDirectory: string;
  files: ExternalEntry[];
};
const cache = path.join(root, manifest.cacheDirectory);
const hasCache = manifest.files.every((entry) =>
  existsSync(path.join(cache, entry.fileName)),
);

function valueType(values: unknown[], expected?: string): ColumnDataType {
  if (expected === "date") return "date";
  if (expected === "number") return "number";
  if (expected === "boolean") return "boolean";
  if (expected === "id" || expected === "string") return "string";
  const present = values.filter(
    (value) => value !== null && value !== undefined && value !== "",
  );
  if (present.length === 0) return "unknown";
  if (
    present.every(
      (value) =>
        typeof value === "number" ||
        /^-?\d+(?:\.\d+)?%?$/.test(String(value).trim()),
    )
  ) {
    return "number";
  }
  if (
    present.every(
      (value) =>
        value instanceof Date ||
        /^\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?/.test(String(value).trim()),
    )
  ) {
    return "date";
  }
  return "string";
}

function profiles(headers: string[], rows: unknown[][]): ColumnProfile[] {
  return headers.map((sourceName, index) => {
    const values = rows.map((row) => row[index]);
    const present = values.filter(
      (value) => value !== null && value !== undefined && value !== "",
    );
    const mapping = resolveWorkbenchCanonicalField(sourceName);
    const likelyPII = isWorkbenchLikelyPii(sourceName);
    const inferredType = valueType(values, mapping?.expectedType);
    const comparable = present.map((value) =>
      value instanceof Date ? value.toISOString() : String(value),
    );
    return {
      sourceName,
      inferredType,
      rowCount: rows.length,
      nullCount: rows.length - present.length,
      nullPct: ((rows.length - present.length) / Math.max(rows.length, 1)) * 100,
      distinctCount: new Set(comparable).size,
      distinctPct:
        (new Set(comparable).size / Math.max(present.length, 1)) * 100,
      min: likelyPII ? undefined : comparable.sort()[0],
      max: likelyPII ? undefined : comparable.sort().at(-1),
      likelyPII,
      sensitive: mapping?.sensitive,
      canonicalField: mapping?.canonicalField,
      semanticRole:
        mapping?.semanticRole ??
        (likelyPII
          ? "pii"
          : inferredType === "number"
            ? "measure"
            : inferredType === "date"
              ? "event_date"
              : undefined),
      semanticMeaning: mapping?.semanticMeaning,
      confidence: mapping?.confidence,
    };
  });
}

async function tables(entry: ExternalEntry) {
  const filePath = path.join(cache, entry.fileName);
  if (entry.format === "csv") {
    const parsed = Papa.parse<unknown[]>(readFileSync(filePath, "utf8"), {
      skipEmptyLines: "greedy",
    });
    if (parsed.errors.length > 0) {
      throw new Error(`${entry.id}: ${parsed.errors[0]?.message}`);
    }
    const table = parsed.data;
    const { headers, dataStart } = resolveTableHeaders(table);
    return [{ sheet: undefined, headers, rows: table.slice(dataStart) }];
  }
  const workbook = await readWorkbook(readFileSync(filePath));
  return workbook.flatMap(({ sheet, data }) => {
    const { headers, dataStart } = resolveTableHeaders(data);
    const rows = data
      .slice(dataStart)
      .filter((row) =>
        row.some((value) => value !== null && value !== undefined && value !== ""),
      );
    return headers.length > 0 && rows.length > 0
      ? [{ sheet, headers, rows }]
      : [];
  });
}

function metadata(
  entry: ExternalEntry,
  index: number,
  sheet: string | undefined,
  columns: ColumnProfile[],
  rowCount: number,
): DatasetMetadata {
  const inference = inferTableGrain({ columns });
  const id = `external:${entry.id}:${index}`;
  const contract = buildTableContract({
    datasetId: id,
    columns,
    inference,
  });
  return {
    id,
    name: sheet ? `${entry.fileName} · ${sheet}` : entry.fileName,
    sourceFileName: entry.fileName,
    sheetName: sheet,
    fingerprint: entry.sha256,
    localTableName: `external_${entry.id}_${index}`,
    fileSize: statSync(path.join(cache, entry.fileName)).size,
    rowCount,
    inferredType: inference.inferredType,
    typeConfidence: inference.typeConfidence,
    grain: inference.grain,
    grainConfidence: inference.grainConfidence,
    columns,
    healthScore: 100,
    issues: [],
    status: "Proposed",
    tableContract: contract,
    safeProfile: {
      fileName: entry.fileName,
      rowCount,
      columnCount: columns.length,
      inferredType: inference.inferredType,
      grain: inference.grain.label,
      grainConfidence: inference.grainConfidence / 100,
      columns: columns.map((column) => ({
        sourceName: column.sourceName,
        inferredType: column.inferredType,
        nullPct: column.nullPct,
        distinctPct: column.distinctPct,
        likelyPII: column.likelyPII,
        sensitive: column.sensitive,
        canonicalField: column.canonicalField,
        semanticRole: column.semanticRole,
        semanticMeaning: column.semanticMeaning,
        confidence: column.confidence,
      })),
    },
  };
}

describe.skipIf(!hasCache)("external HR schema harness", () => {
  it("pins ten licensed source files by SHA-256", () => {
    expect(manifest.files).toHaveLength(10);
    expect(new Set(manifest.files.map((entry) => entry.domain)).size).toBe(10);
    for (const entry of manifest.files) {
      const bytes = readFileSync(path.join(cache, entry.fileName));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
      expect(entry.license.name).not.toBe("");
      expect(entry.license.url).toMatch(/^https:\/\//);
    }
  });

  it.each(manifest.files)(
    "$id reads, maps, contracts, and reports answerability",
    async (entry) => {
      const parsedTables = await tables(entry);
      expect(parsedTables.length).toBeGreaterThan(0);
      const datasets = parsedTables.map((table, index) => {
        expect(table.headers.length).toBeGreaterThan(0);
        expect(table.rows.length).toBeGreaterThan(0);
        return metadata(
          entry,
          index,
          table.sheet,
          profiles(table.headers, table.rows),
          table.rows.length,
        );
      });
      const mappedFields = new Set(
        datasets.flatMap((dataset) =>
          dataset.columns.flatMap((column) =>
            column.canonicalField ? [column.canonicalField] : [],
          ),
        ),
      );
      expect(
        entry.expectedCanonicalAny.some((field) => mappedFields.has(field)),
      ).toBe(true);
      const expectedContract = datasets.find((dataset) =>
        entry.expectedTableTypes.includes(
          dataset.tableContract?.tableType ?? "unknown",
        ),
      );
      expect(expectedContract?.tableContract?.tableType).toBeTruthy();
      const capability = buildCapabilityReports(datasets).find(
        (report) => report.domain === entry.domain,
      );
      expect(capability).toBeDefined();
      expect(
        capability?.runnable || (capability?.missing.length ?? 0) > 0,
      ).toBe(true);
      expect(capability?.runnable).toBe(true);
      expect(
        JSON.stringify({ datasets, capability }),
      ).not.toMatch(/Jul.Dec 2025|Jan.Jun 2026|retirementClassification/);
    },
  );
});
