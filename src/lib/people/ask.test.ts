import { describe, expect, it } from "vitest";
import { CASE_FOLLOW_UPS, composePeopleAnswer, matchPeoplePlaybook } from "./ask";

describe("People AI playbook", () => {
  it("maps case follow-ups to governed tools", () => {
    for (const question of Object.values(CASE_FOLLOW_UPS).flat()) {
      expect(matchPeoplePlaybook(question), question).not.toBeNull();
    }
  });

  it("rejects unconstrained questions", () => {
    expect(matchPeoplePlaybook("write me SQL against bronze")).toBeNull();
    expect(matchPeoplePlaybook("ask anything about payroll")).toBeNull();
  });

  it("treats APAC drop as a data issue in replay", () => {
    const answer = composePeopleAnswer(
      "Why did APAC headcount drop?",
      [{ name: "get_quality_incidents" }],
      [
        {
          incidents: [
            {
              incident_id: "people-incident-apac-hris-incomplete",
              business_change: false,
              expected_records: 29700,
              actual_records: 10395,
            },
          ],
        },
        {},
        { downstream_marts: ["people_mart_workforce_overview"] },
        { quality_status: "unhealthy", value: 50010 },
      ],
      "incident",
    );
    expect(answer.headline).toMatch(/data issue/i);
    expect(answer.quality_status).toBe("unhealthy");
    expect(answer.facts.join(" ")).toMatch(/29700/);
    expect(answer.facts.join(" ")).toMatch(/not published into the current trusted snapshot/i);
    expect(answer.facts.join(" ")).toMatch(/incident replay/i);
  });

  it("treats current Engineering headcount as trusted when serving is healthy", () => {
    const answer = composePeopleAnswer(
      "What is current Engineering headcount?",
      [{ name: "get_metric_value", args: { metric_id: "headcount" } }],
      [
        { value: 16358, unit: "count", as_of: "2026-08-01", quality_status: "healthy" },
        { business_definition: "Count of workers" },
      ],
      "trust",
    );
    expect(answer.quality_status).toBe("healthy");
    expect(answer.interpretation.join(" ")).toMatch(/certified month-end snapshot/i);
    expect(answer.interpretation.join(" ")).not.toMatch(/not treated as trusted/i);
  });

  it("does not treat unhealthy snapshot quality as trusted", () => {
    const answer = composePeopleAnswer(
      "What is current Engineering headcount?",
      [{ name: "get_metric_value", args: { metric_id: "headcount" } }],
      [
        { value: 17000, unit: "count", as_of: "2026-08-01", quality_status: "unhealthy" },
        { business_definition: "Count of workers" },
      ],
    );
    expect(answer.quality_status).toBe("unhealthy");
    expect(answer.interpretation.join(" ")).toMatch(/not treated as trusted/i);
  });
});
