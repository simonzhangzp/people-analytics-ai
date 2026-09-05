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
