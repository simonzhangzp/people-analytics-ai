import {
  findCanonicalField,
  isLikelyPii,
  normalizeHeader,
  semanticRoleForCanonicalField,
} from "@/lib/data/canonical-schema";
import type { ColumnDataType } from "@/types/workbench";
import type { SemanticRole } from "@/types/semantics";

export type SemanticExpectedType =
  | "id"
  | "string"
  | "number"
  | "boolean"
  | "date";

export interface WorkbenchCanonicalMatch {
  canonicalField: string;
  semanticMeaning: string;
  expectedType: SemanticExpectedType;
  confidence: number;
  likelyPii: boolean;
  sensitive: boolean;
  semanticRole: SemanticRole;
}

interface ExtensionFieldDefinition {
  label: string;
  aliases: string[];
  type: SemanticExpectedType;
  pii?: boolean;
  sensitive?: boolean;
}

const workbenchExtensionFields: Record<string, ExtensionFieldDefinition> = {
  compensation_amount: {
    label: "Compensation Amount",
    aliases: [
      "compensation_amount",
      "base_salary",
      "annual_salary",
      "salary",
      "base_pay",
      "annual_base_pay",
      "total_compensation",
      "comp_amount",
      "base_ann",
    ],
    type: "number",
    pii: true,
  },
  compensation_effective_date: {
    label: "Compensation Effective Date",
    aliases: [
      "compensation_effective_date",
      "salary_effective_date",
      "pay_effective_date",
      "effective_date",
      "comp_effective_dt",
      "eff_dt",
    ],
    type: "date",
  },
  compensation_snapshot_date: {
    label: "Compensation Snapshot Date",
    aliases: [
      "compensation_snapshot_date",
      "salary_snapshot_date",
      "pay_snapshot_date",
      "snapshot_date",
      "as_of_date",
      "reporting_date",
    ],
    type: "date",
  },
  compensation_currency: {
    label: "Compensation Currency",
    aliases: [
      "compensation_currency",
      "salary_currency",
      "pay_currency",
      "currency",
      "currency_code",
    ],
    type: "string",
  },
  compensation_frequency: {
    label: "Compensation Frequency",
    aliases: [
      "compensation_frequency",
      "salary_frequency",
      "pay_frequency",
      "pay_basis",
    ],
    type: "string",
  },
};

function compact(value: string) {
  return normalizeHeader(value).replaceAll("_", "");
}

export function resolveWorkbenchCanonicalField(
  sourceField: string,
): WorkbenchCanonicalMatch | null {
  const existing = findCanonicalField(sourceField);
  if (existing) {
    return {
      canonicalField: existing.canonicalField,
      semanticMeaning: existing.label,
      expectedType: existing.expectedType as SemanticExpectedType,
      confidence: existing.confidence,
      likelyPii: existing.likelyPii || isLikelyPii(sourceField),
      sensitive: existing.sensitive,
      semanticRole:
        existing.semanticRole ??
        semanticRoleForCanonicalField(existing.canonicalField) ??
        "category",
    };
  }

  const normalized = normalizeHeader(sourceField);
  const compactSource = compact(sourceField);
  for (const [canonicalField, definition] of Object.entries(
    workbenchExtensionFields,
  )) {
    const aliases = [canonicalField, ...definition.aliases];
    const exact = aliases.some((alias) => normalizeHeader(alias) === normalized);
    if (exact) {
      return {
        canonicalField,
        semanticMeaning: definition.label,
        expectedType: definition.type,
        confidence: normalizeHeader(canonicalField) === normalized ? 99 : 95,
        likelyPii: Boolean(definition.pii) || isLikelyPii(sourceField),
        sensitive: Boolean(definition.sensitive),
        semanticRole:
          semanticRoleForCanonicalField(canonicalField) ?? "category",
      };
    }

    if (aliases.some((alias) => compact(alias) === compactSource)) {
      return {
        canonicalField,
        semanticMeaning: definition.label,
        expectedType: definition.type,
        confidence: 92,
        likelyPii: Boolean(definition.pii) || isLikelyPii(sourceField),
        sensitive: Boolean(definition.sensitive),
        semanticRole:
          semanticRoleForCanonicalField(canonicalField) ?? "category",
      };
    }
  }

  return null;
}

export function expectedColumnType(
  expectedType: SemanticExpectedType,
): ColumnDataType {
  if (expectedType === "id") return "string";
  return expectedType;
}

export function isWorkbenchLikelyPii(sourceField: string) {
  return (
    resolveWorkbenchCanonicalField(sourceField)?.likelyPii ||
    isLikelyPii(sourceField)
  );
}

export function isIdentifierCanonicalField(canonicalField?: string) {
  return Boolean(
    canonicalField &&
      (canonicalField === "employee_id" ||
        canonicalField === "candidate_id" ||
        canonicalField === "application_id" ||
        canonicalField === "requisition_id" ||
        canonicalField.endsWith("_id")),
  );
}
