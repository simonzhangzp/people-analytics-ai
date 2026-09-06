import { boundJobFamily, deniesCompanyConfidential, identityMinCell } from "./demo-identities";

export const AUTHZ_SCOPES = ["own_org", "other_org", "company_level"] as const;
export const AUTHZ_CLASSES = ["non_confidential", "confidential"] as const;

export type AuthzScope = (typeof AUTHZ_SCOPES)[number];
export type AuthzClass = (typeof AUTHZ_CLASSES)[number];
export type AuthzReason = "org_scope" | "company_scope_confidential" | "sensitivity" | "min_cell" | null;

export function authzJobFamily(scope: AuthzScope): string | null {
  if (scope === "own_org") return "Engineering";
  if (scope === "other_org") return "Sales";
  return null;
}

export function authzMetricId(sensitivityClass: AuthzClass): string {
  return sensitivityClass === "confidential" ? "compa_ratio_median" : "headcount";
}

export function expectedAuthz(
  identityId: string,
  scope: AuthzScope,
  sensitivityClass: AuthzClass,
): { denied: boolean; reason: AuthzReason } {
  const confidential = sensitivityClass === "confidential";
  if (identityId === "demo-external-viewer" && confidential) {
    return { denied: true, reason: "sensitivity" };
  }
  const bound = boundJobFamily(identityId);
  if (bound && confidential && scope === "other_org") {
    return { denied: true, reason: "org_scope" };
  }
  if (deniesCompanyConfidential(identityId) && confidential && scope === "company_level") {
    return { denied: true, reason: "company_scope_confidential" };
  }
  return { denied: false, reason: null };
}

export function authzCellsForIdentity(identityId: string) {
  return AUTHZ_SCOPES.flatMap((scope) =>
    AUTHZ_CLASSES.map((sensitivityClass) => {
      const expected = expectedAuthz(identityId, scope, sensitivityClass);
      return {
        identity_id: identityId,
        scope,
        sensitivity_class: sensitivityClass,
        metric_id: authzMetricId(sensitivityClass),
        job_family: authzJobFamily(scope),
        expected_denied: expected.denied,
        expected_reason: expected.reason,
        identity_min_cell: identityMinCell(identityId),
      };
    }),
  );
}
