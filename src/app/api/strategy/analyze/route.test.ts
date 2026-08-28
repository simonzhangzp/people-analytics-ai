import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function request(body: unknown, headers?: HeadersInit) {
  return new Request("http://localhost/api/strategy/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(headers).entries()),
    },
    body: JSON.stringify(body),
  });
}

describe("Strategy AI route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns the catalog result without calling DeepSeek when auth is missing", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "server-key");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://example.supabase.co",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      request({
        kind: "strategy",
        title: "Build workforce capability",
        statement: "Improve internal mobility with measurable guardrails.",
      }),
    );
    const payload = (await response.json()) as {
      source: string;
      brief: unknown;
      warning: { code: string };
    };

    expect(response.status).toBe(200);
    expect(payload.source).toBe("catalog");
    expect(payload.brief).toBeDefined();
    expect(payload.warning.code).toBe("auth_required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects raw employee payloads before quota or provider calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      request({
        kind: "problem",
        statement: "Understand retention",
        rawRows: [{ employeeId: "E-001", email: "person@example.com" }],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "forbidden_key", path: "rawRows" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a structured validation error", async () => {
    const response = await POST(request({ kind: "strategy", statement: "" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_task_input" },
    });
  });
});
