import { z } from "zod";
import { jsonResponse, readGuardedAIJson } from "@/lib/ai/route-guard";
import { answerPeopleDemoQuestion, type PeopleDemoCase } from "@/lib/people/ask";

export const runtime = "nodejs";

const requestSchema = z.object({
  question: z.string().trim().min(1).max(400),
  caseId: z.enum(["trust", "incident", "attrition"]).optional(),
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
    const answer = await answerPeopleDemoQuestion(
      parsed.data.question,
      parsed.data.caseId as PeopleDemoCase | undefined,
    );
    return jsonResponse(answer);
  } catch {
    return jsonResponse(
      {
        error: {
          code: "people_tools_failed",
          message: "People serving tools could not answer this question.",
        },
      },
      { status: 500 },
    );
  }
}
