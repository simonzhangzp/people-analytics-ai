import { z } from "zod";
import { jsonResponse, readGuardedAIJson } from "@/lib/ai/route-guard";
import { DEMO_IDENTITIES } from "@/lib/people/demo-identities";
import { runPeopleAgent, toAskAnswer } from "@/lib/people/agent/run";
import type { PeopleDemoCase } from "@/lib/people/ask-types";

export const runtime = "nodejs";
export const maxDuration = 30;

const identities = DEMO_IDENTITIES.map((row) => row.identity_id) as [
  string,
  ...string[],
];

const requestSchema = z.object({
  question: z.string().trim().min(1).max(400),
  caseId: z.enum(["trust", "incident", "attrition"]).optional(),
  identityId: z.enum(identities).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const guarded = await readGuardedAIJson(request);
  if (!guarded.ok) return guarded.response;

  const parsed = requestSchema.safeParse(guarded.body);
  if (!parsed.success) {
    return jsonResponse(
      { error: { code: "invalid_question", message: "Question is missing or too long." } },
      { status: 400 },
    );
  }

  try {
    const answer = await runPeopleAgent({
      question: parsed.data.question,
      demoCase: parsed.data.caseId as PeopleDemoCase | undefined,
      identityId: parsed.data.identityId,
      headers: request.headers,
    });
    return jsonResponse(toAskAnswer(answer));
  } catch {
    return jsonResponse(
      {
        error: {
          code: "people_tools_failed",
          message: "People serving tools could not answer this question.",
        },
        error_state: "rpc",
        headline: "People serving could not complete this lookup. No substitute numbers were generated.",
      },
      { status: 500 },
    );
  }
}
