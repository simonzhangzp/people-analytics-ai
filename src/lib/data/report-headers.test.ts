import { describe, expect, it } from "vitest";
import {
  resolveTableHeaders,
  stripSectionHeaderLine,
  suggestAskQuestion,
} from "./report-headers";

describe("report headers", () => {
  it("uses the second row when the first row is section titles", () => {
    const table = [
      ["SECTION 1: EMPLOYEE DATA", "", "", "SECTION 4: TALENT REVIEW"],
      ["Employee ID", "Employee Type", "Assignment Status", "Overall Performance"],
      ["E001", "Employee", "Active Assignment", "A"],
    ];
    const resolved = resolveTableHeaders(table);
    expect(resolved.headerLayout).toBe("section_then_fields");
    expect(resolved.dataStart).toBe(2);
    expect(resolved.headers[0]).toBe("Employee ID");
    expect(resolved.headers[3]).toBe("Overall Performance");
  });

  it("keeps a normal single header row", () => {
    const table = [
      ["employee_id", "department", "hire_date"],
      ["1001", "Sales", "2019-01-01"],
    ];
    const resolved = resolveTableHeaders(table);
    expect(resolved.headerLayout).toBe("single");
    expect(resolved.dataStart).toBe(1);
    expect(resolved.headers).toEqual(["employee_id", "department", "hire_date"]);
  });

  it("strips a CSV section title line", () => {
    const csv = "SECTION 1: EMPLOYEE DATA,SECTION 4: TALENT REVIEW\nEmployee ID,Overall Performance\nE001,A\n";
    const prepared = stripSectionHeaderLine(csv);
    expect(prepared.skippedSectionRow).toBe(true);
    expect(prepared.text.startsWith("Employee ID")).toBe(true);
  });

  it("suggests a talent-review question from similar file names", () => {
    expect(suggestAskQuestion("RH_PM_Talent_Review_Report_040419_FY19.xlsx")).toMatch(
      /talent review/i,
    );
  });
});
