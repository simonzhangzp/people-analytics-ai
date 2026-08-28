import { describe, expect, it, vi } from "vitest";
import {
  MAX_AI_BODY_BYTES,
  readGuardedAIJson,
  resolveLiveAIAccess,
} from "./route-guard";

function request(headers?: HeadersInit, body = "{}") {
  return new Request("http://localhost/api/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(headers).entries()),
    },
    body,
  });
}

const configuredEnv = {
  DEEPSEEK_API_KEY: "test-key",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

describe("shared AI route guard", () => {
  it("blocks live AI when the provider or quota is not configured", async () => {
    await expect(
      resolveLiveAIAccess(request(), { env: {} }),
    ).resolves.toMatchObject({
      status: "blocked",
      warning: { code: "not_configured" },
    });
    await expect(
      resolveLiveAIAccess(request(), {
        env: { DEEPSEEK_API_KEY: "test-key" },
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      warning: { code: "quota_unconfigured" },
    });
  });

  it("requires a valid bearer session before consuming quota", async () => {
    const factory = vi.fn();
    await expect(
      resolveLiveAIAccess(request(), {
        env: configuredEnv,
        createQuotaClient: factory,
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      warning: { code: "auth_required" },
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it("allows live AI only after an atomic quota grant", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          allowed: true,
          used: 3,
          limit_value: 50,
          resets_at: "2026-08-29T00:00:00Z",
        },
      ],
      error: null,
    });
    await expect(
      resolveLiveAIAccess(
        request({ Authorization: "Bearer valid-token" }),
        {
          env: configuredEnv,
          createQuotaClient: () => ({
            auth: {
              getUser: async () => ({
                data: { user: { id: "user-1" } },
                error: null,
              }),
            },
            rpc,
          }),
        },
      ),
    ).resolves.toEqual({ status: "live" });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("distinguishes exhausted and unverifiable quota", async () => {
    const quotaClient = (data: unknown, error: unknown = null) => ({
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      rpc: async () => ({ data, error }),
    });
    const authorized = request({ Authorization: "Bearer valid-token" });
    await expect(
      resolveLiveAIAccess(authorized, {
        env: configuredEnv,
        createQuotaClient: () =>
          quotaClient([
            {
              allowed: false,
              used: 50,
              limit_value: 50,
              resets_at: "2026-08-29T00:00:00Z",
            },
          ]),
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      warning: { code: "quota_exceeded" },
    });
    await expect(
      resolveLiveAIAccess(
        request({ Authorization: "Bearer valid-token" }),
        {
          env: configuredEnv,
          createQuotaClient: () =>
            quotaClient(null, new Error("RPC unavailable")),
        },
      ),
    ).resolves.toMatchObject({
      status: "blocked",
      warning: { code: "quota_unverified" },
    });
  });

  it("applies content-type, byte, JSON, and privacy checks consistently", async () => {
    const wrongType = await readGuardedAIJson(
      new Request("http://localhost/api/ai", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      }),
    );
    expect(wrongType.ok).toBe(false);
    if (!wrongType.ok) expect(wrongType.response.status).toBe(415);

    const tooLarge = await readGuardedAIJson(
      request(undefined, "x".repeat(MAX_AI_BODY_BYTES + 1)),
    );
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok) expect(tooLarge.response.status).toBe(413);

    const unsafe = await readGuardedAIJson(
      request(
        undefined,
        JSON.stringify({ rawRows: [{ employeeId: "E-001" }] }),
      ),
    );
    expect(unsafe.ok).toBe(false);
    if (!unsafe.ok) {
      await expect(unsafe.response.json()).resolves.toMatchObject({
        error: { code: "forbidden_key" },
      });
    }
  });
});
