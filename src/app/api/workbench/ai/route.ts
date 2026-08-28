import {
  deterministicOnlyProvider,
  jsonResponse,
  readGuardedAIJson,
  resolveLiveAIAccess,
} from "@/lib/ai/route-guard";
import { workbenchAIRequestSchema } from "@/lib/ai/schemas";
import { executeWorkbenchAITask } from "@/lib/ai/tasks";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const guarded = await readGuardedAIJson(request);
  if (!guarded.ok) return guarded.response;

  const parsed = workbenchAIRequestSchema.safeParse(guarded.body);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: {
          code: "invalid_task_input",
          message: "Request does not match a supported Workbench AI task.",
          details: parsed.error.issues.slice(0, 12).map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  try {
    const access = await resolveLiveAIAccess(request);
    const result =
      access.status === "live"
        ? await executeWorkbenchAITask(parsed.data)
        : await executeWorkbenchAITask(
            parsed.data,
            deterministicOnlyProvider(access.warning),
          );
    return jsonResponse(result);
  } catch {
    return jsonResponse(
      {
        error: {
          code: "deterministic_fallback_failed",
          message: "Workbench could not produce a safe structured response.",
        },
      },
      { status: 500 },
    );
  }
}
