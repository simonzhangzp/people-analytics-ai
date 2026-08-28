import { describe, expect, it } from "vitest";
import { findCanonicalField, isLikelyPii } from "./canonical-schema";

describe("canonical privacy classification", () => {
  it.each([
    "First Name",
    "employee_email",
    "DOB",
    "mobile_phone",
    "national_id",
    "passport_number",
    "postal address",
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
});
