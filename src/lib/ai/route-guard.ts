import { assertSafeAIPayload, UnsafeAIPayloadError } from "./payload-guard";

export const MAX_AI_BODY_BYTES = 128 * 1024;

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
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_AI_BODY_BYTES) {
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
    throw new RequestBodyError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

export async function readGuardedAIJson(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
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
        response: jsonResponse({ error: { code: error.code, message: error.message } }, { status: error.status }),
      };
    }
    return {
      ok: false,
      response: jsonResponse(
        { error: { code: "invalid_request", message: "Request body could not be read." } },
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
          { error: { code: error.code, message: error.message, path: error.path } },
          { status: 400 },
        ),
      };
    }
    return {
      ok: false,
      response: jsonResponse(
        { error: { code: "unsafe_payload", message: "Request payload did not pass the privacy guard." } },
        { status: 400 },
      ),
    };
  }

  return { ok: true, body };
}
