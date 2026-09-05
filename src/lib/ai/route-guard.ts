import { createClient } from "@supabase/supabase-js";
import {
  assertSafeAIPayload,
  UnsafeAIPayloadError,
} from "./payload-guard";
import { PEOPLE_RPC } from "@/lib/people/tables";
import {
  LLMProviderError,
  type LLMProvider,
  type LLMProviderErrorCode,
} from "./provider";

export const MAX_AI_BODY_BYTES = 128 * 1024;

export interface LiveAIWarning {
  code: LLMProviderErrorCode;
  message: string;
  details?: string[];
}

export type LiveAIAccess =
  | { status: "live" }
  | { status: "blocked"; warning: LiveAIWarning };

interface QuotaClient {
  auth: {
    getUser(token: string): Promise<{
      data: { user: unknown | null };
      error: unknown | null;
    }>;
  };
  rpc(name: typeof PEOPLE_RPC.consumeAiQuota): Promise<{
    data: unknown;
    error: unknown | null;
  }>;
}

type QuotaClientFactory = (
  url: string,
  anonKey: string,
  token: string,
) => QuotaClient;

export interface LiveAIAccessOptions {
  env?: Record<string, string | undefined>;
  createQuotaClient?: QuotaClientFactory;
}

interface QuotaRow {
  allowed?: boolean;
  used?: number;
  limit_value?: number;
  resets_at?: string;
}

export class RequestBodyError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "RequestBodyError";
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function readJsonWithLimit(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (
      Number.isFinite(declaredBytes) &&
      declaredBytes > MAX_AI_BODY_BYTES
    ) {
      throw new RequestBodyError(
        413,
        "payload_too_large",
        `Request body exceeds the ${MAX_AI_BODY_BYTES}-byte limit.`,
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
    if (totalBytes > MAX_AI_BODY_BYTES) {
      await reader.cancel();
      throw new RequestBodyError(
        413,
        "payload_too_large",
        `Request body exceeds the ${MAX_AI_BODY_BYTES}-byte limit.`,
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
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new RequestBodyError(
      400,
      "invalid_json",
      "Request body must be valid JSON.",
    );
  }
}

export async function readGuardedAIJson(
  request: Request,
): Promise<
  { ok: true; body: unknown } | { ok: false; response: Response }
> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "unsupported_media_type",
            message: "Content-Type must be application/json.",
          },
        },
        { status: 415 },
      ),
    };
  }

  let body: unknown;
  try {
    body = await readJsonWithLimit(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return {
        ok: false,
        response: jsonResponse(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        ),
      };
    }
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "invalid_request",
            message: "Request body could not be read.",
          },
        },
        { status: 400 },
      ),
    };
  }

  try {
    assertSafeAIPayload(body);
  } catch (error) {
    if (error instanceof UnsafeAIPayloadError) {
      return {
        ok: false,
        response: jsonResponse(
          {
            error: {
              code: error.code,
              message: error.message,
              path: error.path,
            },
          },
          { status: 400 },
        ),
      };
    }
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "unsafe_payload",
            message: "Request payload did not pass the privacy guard.",
          },
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, body };
}

function blocked(
  code: LLMProviderErrorCode,
  message: string,
  details?: string[],
): LiveAIAccess {
  return { status: "blocked", warning: { code, message, details } };
}

function defaultQuotaClient(
  url: string,
  anonKey: string,
  token: string,
): QuotaClient {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as unknown as QuotaClient;
}

export async function resolveLiveAIAccess(
  request: Request,
  options: LiveAIAccessOptions = {},
): Promise<LiveAIAccess> {
  const env = options.env ?? process.env;
  if (!env.DEEPSEEK_API_KEY?.trim()) {
    return blocked(
      "not_configured",
      "DeepSeek is not configured on the server; deterministic fallback was used.",
    );
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return blocked(
      "quota_unconfigured",
      "Live AI is disabled until the user-level Supabase quota is configured.",
    );
  }

  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return blocked(
      "auth_required",
      "Live AI requires an authenticated anonymous workspace session.",
    );
  }

  try {
    const client = (options.createQuotaClient ?? defaultQuotaClient)(
      url,
      anonKey,
      token,
    );
    const userResult = await client.auth.getUser(token);
    if (userResult.error || !userResult.data.user) {
      return blocked(
        "auth_required",
        "Live AI requires a valid anonymous workspace session.",
      );
    }

    const quotaResult = await client.rpc(PEOPLE_RPC.consumeAiQuota);
    const quota = (
      Array.isArray(quotaResult.data)
        ? quotaResult.data[0]
        : quotaResult.data
    ) as QuotaRow | null | undefined;
    if (quotaResult.error || !quota) {
      return blocked(
        "quota_unverified",
        "Live AI quota could not be verified; deterministic fallback was used.",
      );
    }
    if (!quota.allowed) {
      return blocked(
        "quota_exceeded",
        `The daily AI quota has been reached and resets at ${
          quota.resets_at ?? "the next quota window"
        }.`,
        [
          `Used ${quota.used ?? "all"} of ${quota.limit_value ?? "the allowed"} daily requests.`,
        ],
      );
    }
    return { status: "live" };
  } catch {
    return blocked(
      "quota_unverified",
      "Live AI quota could not be verified; deterministic fallback was used.",
    );
  }
}

export function deterministicOnlyProvider(
  warning: LiveAIWarning,
): LLMProvider {
  return {
    name: `deterministic-${warning.code}-fallback`,
    isConfigured: () => false,
    generateStructured: async () => {
      throw new LLMProviderError(
        warning.code,
        warning.message,
        warning.details,
      );
    },
  };
}
