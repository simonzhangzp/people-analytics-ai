import { afterEach, describe, expect, it } from "vitest";
import { analyzeHref, formulatorPublicUrl } from "./formulator";

const previousFormulatorUrl = process.env.NEXT_PUBLIC_FORMULATOR_URL;

afterEach(() => {
  if (previousFormulatorUrl === undefined) {
    delete process.env.NEXT_PUBLIC_FORMULATOR_URL;
  } else {
    process.env.NEXT_PUBLIC_FORMULATOR_URL = previousFormulatorUrl;
  }
});

describe("formulator entry", () => {
  it("keeps Analyze on the Formulator entry", () => {
    expect(analyzeHref()).toBe("/app");
  });

  it("is empty when no Formulator origin is configured", () => {
    delete process.env.NEXT_PUBLIC_FORMULATOR_URL;
    expect(formulatorPublicUrl()).toBe("");
  });

  it("exposes a Formulator origin when configured", () => {
    process.env.NEXT_PUBLIC_FORMULATOR_URL = "http://localhost:5567/";
    expect(formulatorPublicUrl()).toBe("http://localhost:5567");
    expect(analyzeHref()).toBe("/app");
  });
});
