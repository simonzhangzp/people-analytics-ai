import { jsonResponse } from "@/lib/ai/route-guard";
import { runServingHealthcheck } from "@/lib/people/healthcheck";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim() || process.env.PEOPLE_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function run(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return jsonResponse({ error: { code: "unauthorized", message: "Cron secret missing or invalid." } }, { status: 401 });
  }
  try {
    const payload = await runServingHealthcheck();
    const ok = payload.ok === true;
    return jsonResponse(payload, { status: ok ? 200 : 500 });
  } catch (error) {
    return jsonResponse(
      {
        error: {
          code: "healthcheck_failed",
          message: error instanceof Error ? error.message : "Serving healthcheck failed.",
        },
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return run(request);
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}
