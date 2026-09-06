import { describe, expect, it } from "vitest";
import { resolveDeepSeekCompletionsUrl } from "./planner";

describe("resolveDeepSeekCompletionsUrl", () => {
  it("defaults and repairs missing scheme instead of throwing Invalid URL", () => {
    expect(resolveDeepSeekCompletionsUrl(null)).toBe("https://api.deepseek.com/chat/completions");
    expect(resolveDeepSeekCompletionsUrl("")).toBe("https://api.deepseek.com/chat/completions");
    expect(resolveDeepSeekCompletionsUrl("api.deepseek.com")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
    expect(resolveDeepSeekCompletionsUrl("https://api.deepseek.com/")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
    expect(resolveDeepSeekCompletionsUrl("not a url")).toBe("https://api.deepseek.com/chat/completions");
    expect(resolveDeepSeekCompletionsUrl('"https://api.deepseek.com"')).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });
});
