export const DEFAULT_IDENTITY = "demo-external-viewer";

export const DEMO_IDENTITIES = [
  { identity_id: "demo-external-viewer", label: "Site visitor", role: "external_viewer" },
  { identity_id: "demo-leader-engineering", label: "Engineering leader", role: "leader" },
  { identity_id: "demo-hrbp", label: "HRBP", role: "hrbp" },
  { identity_id: "demo-people-analyst", label: "People analyst", role: "people_analyst" },
] as const;

export type DemoIdentityId = (typeof DEMO_IDENTITIES)[number]["identity_id"];
