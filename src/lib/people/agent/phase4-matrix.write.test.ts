import { writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPeopleAgent } from "./run";
import { routePeopleQuestion } from "./router";

const OUT = path.resolve("docs/phase4/phase4_llm_invocation_matrix.json");

function snapshot(
  row: {
    llm_invocation: string;
    failure_reason: string | null;
    question: string;
    identity_id: string;
    trace_id: string;
    headline: string;
    facts: string[];
    hypotheses: string[];
    tools_used: string[];
  },
  extra: Record<string, unknown> = {},
) {
  return {
    llm_invocation: row.llm_invocation,
    failure_reason: row.failure_reason,
    question: row.question,
    identity_id: row.identity_id,
    trace_id: row.trace_id,
    headline: row.headline,
    facts: row.facts,
    hypotheses: row.hypotheses,
    tools_used: row.tools_used,
    ...extra,
  };
}

describe.skipIf(process.env.PHASE4_WRITE_MATRIX !== "1")("phase4 llm_invocation matrix writer", () => {
  it("writes attempted_ok vs attempted_failed with a full response diff", async () => {
    process.env.PEOPLE_IP_HASH_SECRET = process.env.PEOPLE_IP_HASH_SECRET || "unit-test-secret";
    const plan = routePeopleQuestion("Why is Engineering voluntary attrition increasing?", "attrition");
    const fixtures = plan.tools.map((call) => ({
      call,
      result: {
        metric_id: "voluntary_attrition_rate",
        job_family: "Engineering",
        value: 0.15998,
        unit: "rate",
        as_of: "2026-08-31",
        quality_status: "healthy",
      },
      ok: true as const,
    }));
    const failed = await runPeopleAgent({
      question: "Why is Engineering voluntary attrition increasing?",
      demoCase: "attrition",
      headers: new Headers({ "x-forwarded-for": "198.51.100.77" }),
      consume: async () => ({
        allowed: true,
        blocked_by: null,
        call_id: null,
        max_tokens_per_call: 1024,
        remaining: {},
      }),
      planner: async () => {
        throw new ReferenceError("wrapUntrustedToolData is not defined");
      },
      fixtureResults: fixtures,
    });
    expect(failed.llm_invocation).toBe("attempted_failed");
    expect(failed.failure_reason).toBe("internal_code_error");
    const ok = await runPeopleAgent({
      question: "Why is Engineering voluntary attrition increasing?",
      demoCase: "attrition",
      headers: new Headers({ "x-forwarded-for": "198.51.100.78" }),
      consume: async () => ({
        allowed: true,
        blocked_by: null,
        call_id: null,
        max_tokens_per_call: 1024,
        remaining: {},
      }),
      planner: async () => ({
        tools: [],
        hypotheses: [
          "Investigate the highest-rate visible Engineering slices before treating this as company-wide.",
        ],
      }),
      fixtureResults: fixtures,
    });
    expect(ok.llm_invocation).toBe("attempted_ok");
    const current = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
    current.attempted_failed = snapshot(failed, {
      source: "runPeopleAgent planner throw ReferenceError (same compose/run path as /api/people/ask)",
    });
    current.attempted_ok = snapshot(ok, {
      source: "runPeopleAgent planner success (same compose/run path as /api/people/ask)",
    });
    current.b2a_diff = {
      headline_equal: failed.headline === ok.headline,
      facts_equal: JSON.stringify(failed.facts) === JSON.stringify(ok.facts),
      hypotheses_equal: JSON.stringify(failed.hypotheses) === JSON.stringify(ok.hypotheses),
      tools_equal: JSON.stringify(failed.tools_used) === JSON.stringify(ok.tools_used),
      attempted_ok_hypotheses: ok.hypotheses,
      attempted_failed_hypotheses: failed.hypotheses,
      note: "Planner rewrites hypotheses wording only. E1 scores llm_invocation and tool sequence, not headline/facts equality.",
    };
    writeFileSync(OUT, `${JSON.stringify(current, null, 2)}\n`);
  });
});
