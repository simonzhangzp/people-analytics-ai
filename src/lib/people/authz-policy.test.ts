import { describe, expect, it } from "vitest";
import { DEMO_IDENTITIES, minCellFields } from "./demo-identities";
import { authzCellsForIdentity, expectedAuthz } from "./authz-policy";

describe("authz policy", () => {
  it("allows leader Sales headcount and denies leader Sales / company confidential with distinct reasons", () => {
    expect(expectedAuthz("demo-leader-engineering", "other_org", "non_confidential")).toEqual({
      denied: false,
      reason: null,
    });
    expect(expectedAuthz("demo-leader-engineering", "other_org", "confidential")).toEqual({
      denied: true,
      reason: "org_scope",
    });
    expect(expectedAuthz("demo-leader-engineering", "company_level", "confidential")).toEqual({
      denied: true,
      reason: "company_scope_confidential",
    });
    expect(expectedAuthz("demo-external-viewer", "own_org", "confidential")).toEqual({
      denied: true,
      reason: "sensitivity",
    });
    expect(expectedAuthz("demo-hrbp", "other_org", "confidential")).toEqual({
      denied: true,
      reason: "org_scope",
    });
    expect(expectedAuthz("demo-hrbp", "company_level", "confidential")).toEqual({
      denied: false,
      reason: null,
    });
    expect(expectedAuthz("demo-people-analyst", "other_org", "confidential")).toEqual({
      denied: false,
      reason: null,
    });
  });

  it("emits 6 cells per identity", () => {
    for (const row of DEMO_IDENTITIES) {
      expect(authzCellsForIdentity(row.identity_id)).toHaveLength(6);
    }
  });

  it("takes max for effective_min_cell and labels the source", () => {
    expect(minCellFields(10, 20)).toEqual({
      metric_min_cell: 10,
      identity_min_cell: 20,
      effective_min_cell: 20,
      min_cell_source: "identity",
    });
    expect(minCellFields(10, 5)).toMatchObject({ effective_min_cell: 10, min_cell_source: "metric" });
  });
});
