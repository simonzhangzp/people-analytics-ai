import { describe, expect, it } from "vitest";
import { CASE_FOLLOW_UPS } from "../ask-types";
import { DEMO_IDENTITIES, foreignIdentityMentions, identityLabel } from "../demo-identities";
import { composeAnswerContract } from "./compose";
import { classifyPlannerFailure, resolveLlmInvocation } from "./llm-invocation";
import { routePeopleQuestion } from "./router";

const ENG = {
  metric_id: "voluntary_attrition_rate",
  job_family: "Engineering",
  value: 0.15998,
  unit: "rate",
  as_of: "2026-08-31",
};
const BREAKDOWN = {
  dimension: "location_tenure_grade",
  min_cell: 20,
  cells: [
    {
      key: "APAC-SIN|<1y|G7",
      location_id: "APAC-SIN",
      tenure_band: "<1y",
      grade_id: "G7",
      value: 0.343,
      n: 248,
      suppressed: false,
    },
    {
      key: "EMEA-LON|<1y|G3",
      location_id: "EMEA-LON",
      tenure_band: "<1y",
      grade_id: "G3",
      value: null,
      n: 6,
      suppressed: true,
    },
  ],
};

function blob(answer: { headline: string; facts: string[]; hypotheses: string[] }) {
  return `${answer.headline}\n${answer.facts.join("\n")}\n${answer.hypotheses.join("\n")}`;
}

function resultsFor(question: string, identityId: string) {
  const plan = routePeopleQuestion(question, "attrition");
  if (plan.playbook === "compensation") {
    const denied = identityId === "demo-external-viewer";
    return plan.tools.map((call) => ({
      call,
      ok: true,
      result: denied
        ? { denied: true, metric_id: "compa_ratio_median", as_of: "2026-08-31", reason: "sensitivity" }
        : {
            denied: false,
            metric_id: "compa_ratio_median",
            value: 0.98,
            unit: "ratio",
            as_of: "2026-08-31",
            n: 8421,
          },
    }));
  }
  if (plan.playbook === "definition") {
    return plan.tools.map((call) => ({
      call,
      ok: true,
      result: {
        metric_id: "voluntary_attrition_rate",
        business_definition: "Voluntary quits divided by average certified headcount.",
        owner: "People Analytics",
        formula: "voluntary_terms / average certified headcount",
        version: 1,
      },
    }));
  }
  if (plan.playbook === "skills") {
    return plan.tools.map((call) => ({
      call,
      ok: true,
      result: {
        as_of: "2026-08-31",
        rows: [{ org_id: "ENG-APAC", coverage_ratio: 0.629 }],
      },
    }));
  }
  return plan.tools.map((call, index) => ({
    call,
    ok: true,
    result: index === 0 ? ENG : BREAKDOWN,
  }));
}

describe("compose identity_label", () => {
  it("uses identity_label across all six chips and never names a different demo identity", () => {
    for (const row of DEMO_IDENTITIES) {
      for (const chip of CASE_FOLLOW_UPS.attrition) {
        const plan = routePeopleQuestion(chip, "attrition");
        const answer = composeAnswerContract({
          question: chip,
          identityId: row.identity_id,
          traceId: "11111111-1111-4111-8111-111111111111",
          demoCase: "attrition",
          plan,
          tools: plan.tools,
          results: resultsFor(chip, row.identity_id),
        });
        const text = blob(answer);
        expect(foreignIdentityMentions(text, row.identity_id), `${row.identity_id} ${chip}`).toEqual([]);
        if (plan.playbook === "locations") {
          expect(answer.headline).toContain(identityLabel(row.identity_id));
        }
        if (plan.playbook === "compensation" && row.identity_id === "demo-external-viewer") {
          expect(answer.headline).toBe(
            "Compensation positioning is not available to site visitor. No substitute number is shown.",
          );
        }
        if (plan.playbook === "compensation" && row.identity_id !== "demo-external-viewer") {
          expect(answer.headline).toMatch(/n=8421/);
          expect(answer.headline).not.toMatch(/visitor/i);
        }
      }
    }
  });

  it("fails when compose text names the wrong identity", () => {
    expect(foreignIdentityMentions("Among cells visible at visitor min_cell 5", "demo-people-analyst")).toContain(
      "visitor",
    );
    expect(foreignIdentityMentions("restricted for site visitors", "demo-hrbp")).toEqual(
      expect.arrayContaining(["visitor"]),
    );
    expect(CASE_FOLLOW_UPS.attrition).toHaveLength(6);
  });

  it("states org_scope deny with the Engineering leader label, not visitor", () => {
    const plan = routePeopleQuestion("What is Sales compensation?");
    expect(plan.playbook).toBe("metric_value");
    expect(plan.job_family).toBe("Sales");
    expect(plan.tools[0]?.args).toMatchObject({ metric_id: "compa_ratio_median", job_family: "Sales" });
    const answer = composeAnswerContract({
      question: "What is Sales compensation?",
      identityId: "demo-leader-engineering",
      traceId: "33333333-3333-4333-8333-333333333333",
      plan,
      tools: plan.tools,
      results: [
        {
          call: plan.tools[0],
          ok: true,
          result: {
            denied: true,
            reason: "org_scope",
            metric_id: "compa_ratio_median",
            job_family: "Sales",
            as_of: "2026-08-31",
          },
        },
      ],
    });
    expect(answer.headline).toBe(
      "Compensation positioning is not available to Engineering leader. No substitute number is shown.",
    );
    expect(answer.facts.join(" ")).toMatch(/org_scope/);
    expect(answer.headline).not.toMatch(/visitor/i);
    expect(foreignIdentityMentions(`${answer.headline}\n${answer.facts.join("\n")}`, "demo-leader-engineering")).toEqual(
      [],
    );
  });
});

describe("classifyPlannerFailure", () => {
  it("classifies ReferenceError as internal_code_error, not upstream_*", () => {
    const classified = classifyPlannerFailure(new ReferenceError("wrapUntrustedToolData is not defined"));
    expect(classified.failure_reason).toBe("internal_code_error");
    expect(classified.internal?.type).toBe("ReferenceError");
    expect(classified.internal?.frame).toMatch(/^at /);
    expect(classified.failure_reason.startsWith("upstream_")).toBe(false);
  });
});

describe("resolveLlmInvocation failure enum", () => {
  it("keeps attempted_failed failure_reason in the classified enum", () => {
    const state = resolveLlmInvocation({
      llmEligible: true,
      llmSkipped: "internal_code_error",
    });
    expect(state.llm_invocation).toBe("attempted_failed");
    expect(state.failure_reason).toBe("internal_code_error");
  });
});
