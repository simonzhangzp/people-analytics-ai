import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function jsonRequest(body: unknown, headers?: HeadersInit): Request {
  return new Request("http://localhost/api/workbench/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(headers).entries()),
    },
    body: JSON.stringify(body),
  });
}

describe("Workbench AI route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects forbidden row keys before task parsing", async () => {
    const response = await POST(
      jsonRequest({
        task: "semantic_interpreter",
        input: {
          nested: {
            rawRows: [{ employeeId: "E-001" }],
          },
        },
      }),
    );
    const payload = (await response.json()) as {
      error: { code: string; path: string };
    };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("forbidden_key");
    expect(payload.error.path).toBe("input.nested.rawRows");
  });

  it("enforces the declared request body limit", async () => {
    const response = await POST(
      jsonRequest(
        {},
        {
          "Content-Length": String(128 * 1024 + 1),
        },
      ),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "payload_too_large" },
    });
  });

  it("labels an unconfigured provider response as deterministic", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const response = await POST(
      jsonRequest({
        task: "semantic_interpreter",
        input: {
          datasets: [
            {
              datasetId: "dataset-1",
              profile: {
                fileName: "safe-profile.json",
                rowCount: 100,
                columnCount: 1,
                inferredType: "workforce_snapshot",
                grain: "employee-month",
                grainConfidence: 0.9,
                columns: [
                  {
                    sourceName: "snapshot_date",
                    inferredType: "date",
                    nullPct: 0,
                    distinctPct: 12,
                    likelyPII: false,
                    semanticMeaning: "Month-end snapshot date",
                    confidence: 0.9,
                  },
                ],
              },
            },
          ],
        },
      }),
    );
    const payload = (await response.json()) as {
      source: string;
      warning: { code: string };
    };

    expect(response.status).toBe(200);
    expect(payload.source).toBe("deterministic");
    expect(payload.warning.code).toBe("not_configured");
  });

  it("does not call live AI without a quota-authenticated session", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "server-key");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://example.supabase.co",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      jsonRequest({
        task: "semantic_interpreter",
        input: {
          datasets: [
            {
              datasetId: "dataset-1",
              profile: {
                fileName: "safe-profile.json",
                rowCount: 10,
                columnCount: 1,
                inferredType: "employee_roster",
                grain: "employee",
                grainConfidence: 0.9,
                columns: [
                  {
                    sourceName: "employee_id",
                    inferredType: "string",
                    nullPct: 0,
                    distinctPct: 100,
                    likelyPII: true,
                  },
                ],
              },
            },
          ],
        },
      }),
    );
    const payload = (await response.json()) as {
      source: string;
      warning: { code: string };
    };

    expect(response.status).toBe(200);
    expect(payload.source).toBe("deterministic");
    expect(payload.warning.code).toBe("auth_required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
