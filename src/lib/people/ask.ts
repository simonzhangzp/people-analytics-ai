import { answerPeopleDemoQuestion } from "./agent/run";
import { matchPeoplePlaybook } from "./agent/router";
import { composeAnswerContract } from "./agent/compose";
import type { PeopleToolCall } from "./agent/types";
import { type PeopleAskAnswer, type PeopleDemoCase } from "./ask-types";

export type { PeopleAskAnswer, PeopleDemoCase } from "./ask-types";
export { CASE_FOLLOW_UPS } from "./ask-types";
export { matchPeoplePlaybook, answerPeopleDemoQuestion };

/** @deprecated Tests and older callers. Prefer composeAnswerContract. */
export function composePeopleAnswer(
  question: string,
  tools: PeopleToolCall[],
  evidence: unknown[],
  demoCase?: PeopleDemoCase,
): PeopleAskAnswer {
  const plan = {
    tier: (/why|apac|concentrat|investigate/i.test(question) ? 2 : 1) as 1 | 2,
    playbook:
      demoCase === "incident"
        ? ("incident" as const)
        : /headcount/i.test(question)
          ? ("metric_value" as const)
          : ("attrition_explore" as const),
    llmEligible: false,
    snapshot_id: (demoCase === "incident" ? "incident_replay" : "current_certified") as
      | "current_certified"
      | "incident_replay",
    tools,
    filters: {},
    metric_id: undefined,
    job_family: /engineering/i.test(question) ? "Engineering" : null,
  };
  const composed = composeAnswerContract({
    question,
    identityId: "demo-external-viewer",
    traceId: "00000000-0000-4000-8000-000000000000",
    demoCase,
    plan,
    tools,
    results: tools.map((call, index) => ({
      call,
      result: evidence[index] ?? {},
      ok: true,
    })),
  });
  return {
    question: composed.question,
    supported: composed.supported,
    headline: composed.headline,
    facts: composed.facts,
    interpretation: composed.interpretation,
    quality_status: composed.quality_status,
    freshness: composed.freshness,
    definition: composed.definition,
    evidence: composed.evidence,
    lineage: composed.lineage,
    tools_used: composed.tools_used,
  };
}
