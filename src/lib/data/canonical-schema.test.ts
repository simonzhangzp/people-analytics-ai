import { describe, expect, it } from "vitest";
import {
  findCanonicalField,
  isLikelyPii,
  semanticRoleForCanonicalField,
} from "./canonical-schema";

describe("canonical privacy classification", () => {
  it.each([
    "First Name",
    "employee_email",
    "DOB",
    "mobile_phone",
    "national_id",
    "passport_number",
    "postal address",
    "英文名(中文名)",
    "QQ号码",
  ])("marks %s as likely PII", (header) => {
    expect(isLikelyPii(header)).toBe(true);
  });

  it.each(["course_name", "department_name", "company_name"])(
    "does not treat non-person label %s as PII",
    (header) => {
      expect(isLikelyPii(header)).toBe(false);
    },
  );

  it("marks employee, candidate, and manager identifiers as PII", () => {
    expect(findCanonicalField("emp_id")?.likelyPii).toBe(true);
    expect(findCanonicalField("candidate_id")?.likelyPii).toBe(true);
    expect(findCanonicalField("manager_id")?.likelyPii).toBe(true);
  });

  it("preserves Chinese headers and maps common workforce fields", () => {
    expect(findCanonicalField("英文名(中文名)")).toMatchObject({
      canonicalField: "employee_name",
      likelyPii: true,
    });
    expect(findCanonicalField("工作部门")?.canonicalField).toBe("department");
    expect(findCanonicalField("员工类别")?.canonicalField).toBe("employee_type");
    expect(findCanonicalField("最高学历")?.canonicalField).toBe(
      "education_level",
    );
    expect(findCanonicalField("国籍")).toMatchObject({
      canonicalField: "nationality",
      sensitive: true,
    });
  });

  it("maps workforce snapshot files to location, function, and finance department cuts", () => {
    expect(findCanonicalField("location_people")?.canonicalField).toBe(
      "location",
    );
    expect(findCanonicalField("job_function")?.canonicalField).toBe("job_role");
    expect(findCanonicalField("dept_finance")?.canonicalField).toBe(
      "department",
    );
    expect(findCanonicalField("cost_center")?.canonicalField).toBe(
      "cost_center",
    );
  });

  it("does not confuse country with a count measure", () => {
    expect(semanticRoleForCanonicalField("country")).toBe("category");
    expect(semanticRoleForCanonicalField("employee_count")).toBe("measure");
  });
});
