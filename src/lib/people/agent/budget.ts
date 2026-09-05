import { createHmac } from "node:crypto";
import { peopleCompleteLlmCall, peopleTryConsumeLlm, peopleV2Configured } from "../v2-client";

const CACHE_MS = 60_000;

let cachedLimits: { at: number; remaining?: Record<string, unknown> } | null = null;

export function hashClientIp(ip: string, secret = process.env.PEOPLE_IP_HASH_SECRET): string | null {
  const key = secret?.trim();
  if (!key) return null;
  return createHmac("sha256", key).update(ip.trim() || "unknown").digest("hex");
}

export function clientIpFromHeaders(headers: Headers): { ip: string; country: string | null } {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = headers.get("x-real-ip")?.trim();
  const ip = forwarded || real || "0.0.0.0";
  const country = headers.get("x-vercel-ip-country")?.trim() || null;
  return { ip, country };
}

export interface LlmBudgetDecision {
  allowed: boolean;
  blocked_by: string | null;
  call_id: number | null;
  max_tokens_per_call: number;
  remaining: Record<string, number>;
}

export async function tryConsumeLlmBudget(input: {
  ipHash: string;
  route: string;
  country?: string | null;
}): Promise<LlmBudgetDecision> {
  if (!peopleV2Configured()) {
    return {
      allowed: false,
      blocked_by: "serving_unconfigured",
      call_id: null,
      max_tokens_per_call: 1024,
      remaining: {},
    };
  }
  if (!process.env.PEOPLE_IP_HASH_SECRET?.trim()) {
    return {
      allowed: false,
      blocked_by: "ip_hash_secret_missing",
      call_id: null,
      max_tokens_per_call: 1024,
      remaining: {},
    };
  }
  try {
    const payload = await peopleTryConsumeLlm(input.ipHash, input.route, input.country);
    const remaining = (payload.remaining && typeof payload.remaining === "object"
      ? payload.remaining
      : {}) as Record<string, number>;
    cachedLimits = { at: Date.now(), remaining };
    return {
      allowed: payload.allowed === true,
      blocked_by: payload.blocked_by ? String(payload.blocked_by) : null,
      call_id: typeof payload.call_id === "number" ? payload.call_id : payload.call_id ? Number(payload.call_id) : null,
      max_tokens_per_call: Number(payload.max_tokens_per_call ?? 1024) || 1024,
      remaining,
    };
  } catch {
    return {
      allowed: false,
      blocked_by: "ledger_write_failed",
      call_id: null,
      max_tokens_per_call: 1024,
      remaining: cachedLimits && Date.now() - cachedLimits.at <= CACHE_MS ? (cachedLimits.remaining as Record<string, number>) : {},
    };
  }
}

export async function gatePublicLlm(request: Request, route: string): Promise<{ allowed: boolean; skipped: string | null; callId: number | null }> {
  if (!peopleV2Configured()) {
    return { allowed: true, skipped: null, callId: null };
  }
  const { ip, country } = clientIpFromHeaders(request.headers);
  const ipHash = hashClientIp(ip);
  if (!ipHash) {
    return { allowed: false, skipped: "ip_hash_secret_missing", callId: null };
  }
  const decision = await tryConsumeLlmBudget({ ipHash, route, country });
  if (!decision.allowed) {
    return { allowed: false, skipped: decision.blocked_by, callId: null };
  }
  return { allowed: true, skipped: null, callId: decision.call_id };
}
export async function completeLlmBudget(input: {
  callId: number | null;
  traceId?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  ok?: boolean;
  latencyMs?: number;
}): Promise<void> {
  if (!input.callId) return;
  try {
    await peopleCompleteLlmCall({
      callId: input.callId,
      traceId: input.traceId,
      model: input.model,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      ok: input.ok,
      latencyMs: input.latencyMs,
    });
  } catch {
    /* complete is best-effort; the placeholder already occupies quota */
  }
}
