import { createClient } from "@supabase/supabase-js";
import { assertSafeAIPayload, UnsafeAIPayloadError } from "@/lib/ai/payload-guard";
import {
  LLMProviderError,
  type LLMProvider,
} from "@/lib/ai/provider";
import { workbenchAIRequestSchema } from "@/lib/ai/schemas";
import { executeWorkbenchAITask } from "@/lib/ai/tasks";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 128 * 1024;

function deterministicOnlyProvider(message: string): LLMProvider {
  return {
    name: "deterministic-quota-fallback",
    isConfigured: () => false,
    generateStructured: async () => {
      throw new LLMProviderError("not_configured", message);
    },
  };
}

async function quotaProtectedProvider(
  request: Request,
): Promise<LLMProvider | undefined> {
  if (!process.env.DEEPSEEK_API_KEY?.trim()) return undefined;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return deterministicOnlyProvider(
      "Live AI is disabled until the user-level Supabase quota is configured.",
    );
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return deterministicOnlyProvider(
      "Live AI requires an authenticated anonymous workspace session.",
    );
  }

  try {
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const userResult = await client.auth.getUser(token);
    if (userResult.error || !userResult.data.user) {
      return deterministicOnlyProvider(
        "Live AI requires a valid anonymous workspace session.",
      );
    }
    const quotaResult = await client.rpc("consume_ai_quota");
    const quota = Array.isArray(quotaResult.data)
      ? quotaResult.data[0]
      : undefined;
    if (quotaResult.error || !quota?.allowed) {
      return deterministicOnlyProvider(
        quotaResult.error
          ? "Live AI quota could not be verified; deterministic fallback was used."
          : `The daily AI quota has been reached and resets at ${
              quota?.resets_at ?? "the next quota window"
            }.`,
      );
    }
    return undefined;
  } catch {
    return deterministicOnlyProvider(
      "Live AI quota could not be verified; deterministic fallback was used.",
    );
  }
}

class RequestBodyError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "RequestBodyError";
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function readJsonWithLimit(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BODY_BYTES) {
      throw new RequestBodyError(
        413,
        "payload_too_large",
        `Request body exceeds the ${MAX_BODY_BYTES}-byte limit.`,
      );
    }
  }

  if (!request.body) {
    throw new RequestBodyError(400, "invalid_json", "Request body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RequestBodyError(
        413,
        "payload_too_large",
        `Request body exceeds the ${MAX_BODY_BYTES}-byte limit.`,
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestBodyError(
      400,
      "invalid_json",
      "Request body must be valid JSON.",
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type");
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      {
        error: {
          code: "unsupported_media_type",
          message: "Content-Type must be application/json.",
        },
      },
      { status: 415 },
    );
  }

  let body: unknown;
  try {
    body = await readJsonWithLimit(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return jsonResponse(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return jsonResponse(
      {
        error: {
          code: "invalid_request",
          message: "Request body could not be read.",
        },
      },
      { status: 400 },
    );
  }

  try {
    assertSafeAIPayload(body);
  } catch (error) {
    if (error instanceof UnsafeAIPayloadError) {
      return jsonResponse(
        {
          error: {
            code: error.code,
            message: error.message,
            path: error.path,
          },
        },
        { status: 400 },
      );
    }
    return jsonResponse(
      {
        error: {
          code: "unsafe_payload",
          message: "Request payload did not pass the privacy guard.",
        },
      },
      { status: 400 },
    );
  }

  const parsed = workbenchAIRequestSchema.safeParse(body);
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
    const provider = await quotaProtectedProvider(request);
    const result = provider
      ? await executeWorkbenchAITask(parsed.data, provider)
      : await executeWorkbenchAITask(parsed.data);
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
