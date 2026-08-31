import { describe, expect, it } from "vitest";
import { PEOPLE_RPC } from "./tables";

describe("People serving RPC names", () => {
  it("exposes governed mart RPCs rather than bronze access", () => {
    const names = Object.values(PEOPLE_RPC);
    expect(names).toContain("people_get_metric");
    expect(names).toContain("people_get_metric_definition");
    expect(names).toContain("people_trace_metric_lineage");
    expect(names.every((name) => name.startsWith("people_"))).toBe(true);
    expect(names.join(" ")).not.toMatch(/bronze/i);
  });
});
