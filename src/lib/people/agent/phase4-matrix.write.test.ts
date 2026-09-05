import { writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPeopleAgent } from "./run";
import { routePeopleQuestion } from "./router";

const OUT = path.resolve("docs/phase4/phase4_llm_invocation_matrix.json");

describe.skipIf(process.env.PHASE4_WRITE_MATRIX !== "1")("phase4 llm_invocation matrix writer", () => {
  it("appends a real attempted_failed agent record", async () => {
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
    const answer = await runPeopleAgent({
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
        throw new Error("llm_upstream_timeout");
      },
      fixtureResults: fixtures,
    });
    expect(answer.llm_invocation).toBe("attempted_failed");
    expect(answer.failure_reason?.trim()).toBeTruthy();
    const current = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
    current.attempted_failed = {
      llm_invocation: answer.llm_invocation,
      failure_reason: answer.failure_reason,
      question: answer.question,
      identity_id: answer.identity_id,
      trace_id: answer.trace_id,
      source: "runPeopleAgent planner throw (same compose/run path as /api/people/ask)",
      headline: answer.headline,
    };
    if (!current.attempted_ok) {
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
          hypotheses: ["Investigate the highest-rate visible Engineering slices."],
        }),
        fixtureResults: fixtures,
      });
      expect(ok.llm_invocation).toBe("attempted_ok");
      current.attempted_ok = {
        llm_invocation: ok.llm_invocation,
        failure_reason: ok.failure_reason,
        question: ok.question,
        identity_id: ok.identity_id,
        trace_id: ok.trace_id,
        source: "runPeopleAgent planner success (same compose/run path as /api/people/ask)",
        headline: ok.headline,
      };
    }
    writeFileSync(OUT, `${JSON.stringify(current, null, 2)}\n`);
  });
});
