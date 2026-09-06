export const DEFAULT_IDENTITY = "demo-external-viewer";

export const DEMO_IDENTITIES = [
  {
    identity_id: "demo-external-viewer",
    label: "Site visitor",
    identity_label: "site visitor",
    role: "external_viewer",
  },
  {
    identity_id: "demo-leader-engineering",
    label: "Engineering leader",
    identity_label: "Engineering leader",
    role: "leader",
  },
  {
    identity_id: "demo-hrbp",
    label: "HRBP",
    identity_label: "HRBP",
    role: "hrbp",
  },
  {
    identity_id: "demo-people-analyst",
    label: "People analyst",
    identity_label: "People analyst",
    role: "people_analyst",
  },
] as const;

export type DemoIdentityId = (typeof DEMO_IDENTITIES)[number]["identity_id"];

export function identityLabel(identityId: string): string {
  return (
    DEMO_IDENTITIES.find((row) => row.identity_id === identityId)?.identity_label ?? "site visitor"
  );
}

/** Engineering-bound demo identities. Visitor and analyst have no org floor. */
export function boundJobFamily(identityId: string): "Engineering" | null {
  if (identityId === "demo-leader-engineering" || identityId === "demo-hrbp") return "Engineering";
  return null;
}

/** Leader cannot read company-level confidential; HRBP can (cross-department benchmarking). */
export function deniesCompanyConfidential(identityId: string): boolean {
  return identityId === "demo-leader-engineering";
}

/** Identity-level suppression floor. Distinct from YAML metric_min_cell. */
export function identityMinCell(identityId: string): number {
  switch (identityId) {
    case "demo-leader-engineering":
      return 20;
    case "demo-hrbp":
      return 10;
    case "demo-people-analyst":
      return 5;
    default:
      return 50;
  }
}

export function minCellFields(metricMin: number, identityMin: number) {
  const effective = Math.max(metricMin, identityMin);
  return {
    metric_min_cell: metricMin,
    identity_min_cell: identityMin,
    effective_min_cell: effective,
    min_cell_source: (identityMin >= metricMin ? "identity" : "metric") as "identity" | "metric",
  };
}

export function identityShowsCompaRatio(identityId: string): boolean {
  return identityId !== "demo-external-viewer";
}

const OTHER_LABELS: Array<{ id: string; label: string; pattern: RegExp }> = DEMO_IDENTITIES.map(
  (row) => ({
    id: row.identity_id,
    label: row.identity_label,
    pattern: new RegExp(row.identity_label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  }),
);

/** User-visible compose text must not name a different demo identity. */
export function foreignIdentityMentions(text: string, identityId: string): string[] {
  const own = identityLabel(identityId);
  const hits: string[] = [];
  for (const row of OTHER_LABELS) {
    if (row.id === identityId) continue;
    if (row.pattern.test(text)) hits.push(row.label);
  }
  if (own !== "site visitor" && /\bvisitors?\b/i.test(text)) hits.push("visitor");
  if (own !== "People analyst" && /\banalyst\b/i.test(text) && !/people analytics/i.test(text)) {
    hits.push("analyst");
  }
  if (own !== "HRBP" && /\bhrbp\b/i.test(text)) hits.push("hrbp");
  if (own !== "Engineering leader" && /\bleader\b/i.test(text)) hits.push("leader");
  return [...new Set(hits)];
}
