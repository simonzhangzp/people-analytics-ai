import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { identityShowsCompaRatio } from "./demo-identities";

describe("visitor compa-ratio gate", () => {
  it("hides certified compensation positioning from the site visitor only", () => {
    expect(identityShowsCompaRatio("demo-external-viewer")).toBe(false);
    expect(identityShowsCompaRatio("demo-leader-engineering")).toBe(true);
    expect(identityShowsCompaRatio("demo-hrbp")).toBe(true);
    expect(identityShowsCompaRatio("demo-people-analyst")).toBe(true);
  });

  it("gates Related Signals on the Case 3 page instead of only rewording chip-04", () => {
    const page = readFileSync(
      path.join(process.cwd(), "src/app/enterprise-demo/attrition/page.tsx"),
      "utf8",
    );
    expect(page).toContain("identityShowsCompaRatio");
    expect(page).toContain("Compa-ratio comparison is available to internal People identities.");
    expect(page).toContain('data-testid="related-signals-compa-gate"');
    const payload = readFileSync(path.join(process.cwd(), "src/lib/people/demo-payload.ts"), "utf8");
    expect(payload).toContain("compa_restricted: true");
  });
});
