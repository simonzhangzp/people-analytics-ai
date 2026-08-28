import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeAskFile } from "../analytics/ask-file";
import { analyzeLocalWorkforceData } from "../analytics/local-workforce-analysis";
import { decodePeopleFileBytes } from "./file-encoding";
import { parseAndProfileFile, profileRows } from "./local-profiler";
import { resolveTableHeaders } from "./report-headers";

function encodeUtf32Be(text: string) {
  const bytes = new Uint8Array(text.length * 4);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index * 4 + 3] = text.charCodeAt(index);
  }
  return bytes;
}

describe("local profiler file parsing", () => {
  it("decodes UTF-32 BE snapshots, redacts PII, and keeps full-file counts", async () => {
    const csv = [
      '"record_month","latest_hire_dt","employee_number","data_flag","email","country"',
      "2022-07-31,2018-03-12 00:00:00,1001,1-Headcount,ada@example.com,US",
      "2022-08-31,2018-03-12 00:00:00,1001,1-Headcount,ada@example.com,US",
      "2022-08-31,2021-09-01 00:00:00,1002,1-Headcount,lin@example.com,Germany",
      "",
    ].join("\n");
    const bytes = encodeUtf32Be(csv);
    expect(decodePeopleFileBytes(bytes).encoding).toBe("utf-32be");

    const file = new File([bytes], "vdm_headcount_month_f_sample.csv", {
      type: "text/csv",
    });
    const dataset = await parseAndProfileFile(file);

    expect(dataset.entity).toBe("Employee Snapshot");
    expect(dataset.rowCount).toBe(3);
    expect(dataset.aggregates?.encoding).toBe("utf-32be");
    expect(dataset.aggregates?.uniqueEmployees).toBe(2);
    expect(dataset.aggregates?.monthlyHeadcount).toEqual([
      { month: "2022-07", count: 1 },
      { month: "2022-08", count: 2 },
    ]);
    expect(dataset.rows.every((row) => row.email === "[redacted]")).toBe(true);
    expect(dataset.timeRange).toMatch(/2022/);
  });

  it("infers an employee roster and redacts sex as a sensitive dimension", async () => {
    const csv = [
      "employee_number,email,tenure_band,region,cc_dept_by_cc,sex,level3_full_name",
      "1001,ada@example.com,7+ Years,EMEA,Research and Development,Female,\"Wright, Chris\"",
      "1002,lin@example.com,0-6 months,NA,Sales,Male,\"Stack, Lawrence\"",
      "",
    ].join("\n");
    const file = new File([csv], "vdm_roster.csv", { type: "text/csv" });
    const dataset = await parseAndProfileFile(file);

    expect(dataset.entity).toBe("Employee Roster");
    expect(dataset.mappings.some((item) => item.canonicalField === "department")).toBe(
      true,
    );
    expect(
      dataset.mappings.some(
        (item) =>
          item.sourceField === "sex" && item.canonicalField === "gender",
      ),
    ).toBe(true);
    expect(dataset.rows[0].email).toBe("[redacted]");
    expect(dataset.rows[0].sex).toBe("[redacted]");
    expect(dataset.rows[0].level3_full_name).toBe("[redacted]");
  });

  it("recovers a two-row talent-review header and infers the extract", async () => {
    const csv = [
      "SECTION 1: EMPLOYEE DATA,SECTION 4: TALENT REVIEW,SECTION 5: PM APPRAISAL STATUS",
      "Employee ID,Overall Performance,Appraisal Summary",
      "E001,A,COMPLETED",
      "E002,,ONGOING",
      "",
    ].join("\n");
    const file = new File([csv], "RH_PM_Talent_Review_Report.csv", { type: "text/csv" });
    const dataset = await parseAndProfileFile(file);

    expect(dataset.aggregates?.headerLayout).toBe("section_then_fields");
    expect(dataset.entity).toBe("Talent Review Extract");
    expect(dataset.columns.map((column) => column.name)).toContain("Employee ID");
    expect(dataset.columns.map((column) => column.name)).not.toContain(
      "SECTION 1: EMPLOYEE DATA",
    );
  });

  it("profiles the Red Hat talent review workbook when present", async () => {
    const workbook = "D:\\Work Material\\Red Hat\\RH_PM_Talent_Review_Report_040419_FY19.xlsx";
    if (!existsSync(workbook)) return;
    const { readSheet } = await import("read-excel-file/node");
    const table = await readSheet(readFileSync(workbook));
    const { headers, dataStart, headerLayout } = resolveTableHeaders(table);
    const rows = table.slice(dataStart).map((values) =>
      Object.fromEntries(
        headers.map((header, index) => {
          const value = values[index];
          if (value === undefined || value === null || value === "") return [header, null];
          if (value instanceof Date) return [header, value.toISOString()];
          if (typeof value === "string") return [header, value.trim()];
          return [header, value];
        }),
      ),
    );
    const dataset = profileRows(rows, {
      name: "RH_PM_Talent_Review_Report_040419_FY19.xlsx",
      size: 1,
    }, undefined, {
      rowCount: rows.length,
      aggregates: {
        sampled: false,
        sampleRows: rows.length,
        uniqueEmployees: rows.length,
        monthlyHeadcount: [],
        statusCounts: {},
        headerLayout,
      },
    });

    expect(dataset.entity).toBe("Talent Review Extract");
    expect(headerLayout).toBe("section_then_fields");
    expect(dataset.rowCount).toBeGreaterThan(10_000);
    expect(dataset.columns.map((column) => column.name)).toContain("Overall Performance");
    expect(dataset.mappings.some((item) => item.canonicalField === "employee_id")).toBe(true);

    const asked = analyzeAskFile(
      dataset,
      "How complete is this talent review and performance appraisal cycle, and where is review risk concentrated?",
    );
    expect(asked.answerable).toBe(true);
    expect(asked.conclusion).toMatch(/Initiated|reviewed/i);
    expect(asked.columnsUsed.map((column) => column.source)).toContain("Overall Performance");
  }, 60_000);

  it("profiles the local 54 MB UTF-32 snapshot when present", async () => {
    const path = fileURLToPath(
      new URL("../../../sample_data/vdm_headcount_month_f_202208081432.csv", import.meta.url),
    );
    if (!existsSync(path)) return;
    const file = new File([readFileSync(path)], "vdm_headcount_month_f_202208081432.csv", {
      type: "text/csv",
    });
    const dataset = await parseAndProfileFile(file);
    const result = analyzeLocalWorkforceData([dataset]);

    expect(dataset.entity).toBe("Employee Snapshot");
    expect(dataset.aggregates?.encoding).toBe("utf-32be");
    expect(dataset.aggregates?.uniqueEmployees).toBeGreaterThan(1_000);
    expect(dataset.aggregates?.monthlyHeadcount.at(-1)?.month).toBe("2022-08");
    expect(result.metricName).toBe("Headcount");
    expect(result.insight.limitation).toMatch(/Time to Fill/i);

    const asked = analyzeAskFile(
      dataset,
      "population distribution by different data cuts in the file",
    );
    expect(asked.answerable).toBe(true);
    expect(asked.conclusion).toMatch(/snapshot month|workforce status/i);
    expect(asked.metrics.length).toBeGreaterThan(2);
  }, 60_000);
});
