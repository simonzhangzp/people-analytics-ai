import { describe, expect, it } from "vitest";
import { MAX_AI_BODY_BYTES, readGuardedAIJson } from "./route-guard";

function request(headers?: HeadersInit, body = "{}") {
  return new Request("http://localhost/api/people/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(headers).entries()),
    },
    body,
  });
}

describe("Ask JSON guard", () => {
  it("applies content-type, byte, JSON, and privacy checks", async () => {
    const wrongType = await readGuardedAIJson(
      new Request("http://localhost/api/people/ask", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      }),
    );
    expect(wrongType.ok).toBe(false);
    if (!wrongType.ok) expect(wrongType.response.status).toBe(415);

    const tooLarge = await readGuardedAIJson(request(undefined, "x".repeat(MAX_AI_BODY_BYTES + 1)));
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok) expect(tooLarge.response.status).toBe(413);

    const unsafe = await readGuardedAIJson(
      request(undefined, JSON.stringify({ rawRows: [{ employeeId: "E-001" }] })),
    );
    expect(unsafe.ok).toBe(false);
    if (!unsafe.ok) {
      await expect(unsafe.response.json()).resolves.toMatchObject({
        error: { code: "forbidden_key" },
      });
    }
  });
});
