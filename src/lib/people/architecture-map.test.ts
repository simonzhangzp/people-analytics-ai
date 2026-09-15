import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_LAYERS,
  ARCHITECTURE_PILLARS,
  CASE_PROOF,
  layerById,
} from "./architecture-map";
import { COMPARISON_ROWS } from "./comparison";
import { CASES } from "./demo-cases";
import { ENVIRONMENT_FACTS } from "./environment-facts";
import { PARITY_HEADCOUNT } from "./parity-home";

/** Brief §12: roadmap capabilities must never be tagged live. */
const ROADMAP_WORDS = [
  /skills registry/i,
  /SKILL\.md/i,
  /signal agent/i,
  /signals page/i,
  /proactive brief/i,
  /case 4/i,
  /sandbox/i,
  /tier 3/i,
  /data-v2/i,
  /nightly automatic e1/i,
  /statistical methods library/i,
  /model library/i,
  /skill evaluation/i,
  /human approval/i,
];

const RETIRED_ROUTES = ["/lab", "/ask", "/workbench", "/demo", "/strategy", "/app", "/workspace"];

describe("architecture map live-vs-target boundary", () => {
  it("has five layers L1..L5 and two pillars", () => {
    expect(ARCHITECTURE_LAYERS.map((row) => row.id)).toEqual(["L1", "L2", "L3", "L4", "L5"]);
    expect(ARCHITECTURE_PILLARS.map((row) => row.id)).toEqual(["governance", "observability"]);
  });

  it("never tags a roadmap capability as live", () => {
    const components = [
      ...ARCHITECTURE_LAYERS.flatMap((row) => row.components),
      ...ARCHITECTURE_PILLARS.flatMap((row) => row.components),
    ];
    for (const component of components) {
      if (component.status !== "live") continue;
      for (const word of ROADMAP_WORDS) {
        expect(component.label, `${component.label} matches roadmap word ${word}`).not.toMatch(word);
      }
    }
  });

  it("marks a layer mixed when it contains any target component", () => {
    for (const layer of ARCHITECTURE_LAYERS) {
      const hasTarget = layer.components.some((row) => row.status === "target");
      if (hasTarget) expect(layer.status, layer.id).toBe("mixed");
      else expect(layer.status, layer.id).toBe("live");
    }
  });

  it("links only to live routes, never to retired ones", () => {
    const hrefs = [
      ...ARCHITECTURE_LAYERS.flatMap((row) => [row.cta.href, ...row.components.map((c) => c.href ?? "")]),
      ...ARCHITECTURE_PILLARS.flatMap((row) => [row.cta.href, ...row.components.map((c) => c.href ?? "")]),
      ...COMPARISON_ROWS.map((row) => row.tryHref ?? ""),
    ].filter(Boolean);
    for (const href of hrefs) {
      const path = href.split("#")[0];
      expect(RETIRED_ROUTES, href).not.toContain(path);
      expect(href.startsWith("/"), href).toBe(true);
    }
  });

  it("maps every case to at least one layer and every case id exists", () => {
    for (const item of CASES) {
      const proof = CASE_PROOF[item.id];
      expect(proof.layers.length).toBeGreaterThan(0);
      for (const id of proof.layers) expect(layerById(id).id).toBe(id);
    }
  });

  it("comparison rows tag reusable intelligence as target and everything else live", () => {
    for (const row of COMPARISON_ROWS) {
      expect(row.status).toBe(row.id === "reusable-intelligence" ? "target" : "live");
    }
  });
});

describe("environment facts", () => {
  it("uses the committed parity headcount", () => {
    const headcount = ENVIRONMENT_FACTS.find((row) => row.id === "headcount");
    expect(headcount?.value).toBe(PARITY_HEADCOUNT.toLocaleString());
  });

  it("cites a source for every fact and never uses the 2M applicants figure", () => {
    for (const fact of ENVIRONMENT_FACTS) {
      expect(fact.source.length, fact.id).toBeGreaterThan(10);
      expect(`${fact.value} ${fact.detail}`).not.toMatch(/2\s?M applicants/i);
    }
  });
});
