import type {
  MetricAmbiguity,
  MetricDefinition,
  MetricExpression,
  MetricPatch,
  MetricPatchItem,
  MetricRule,
} from "@/types/workbench";
import {
  AVERAGE_HEADCOUNT_EXPRESSION,
  BEGINNING_HEADCOUNT_EXPRESSION,
  VOLUNTARY_ATTRITION_METRIC,
} from "./library";

export type HeadcountBasis = "average" | "beginning";
export type RetirementClassification = "voluntary" | "involuntary" | "excluded";

type PatchableField = MetricPatchItem["field"];
type PatchChanges = Partial<
  Pick<
    MetricDefinition,
    | "numerator"
    | "denominator"
    | "formula"
    | "inclusions"
    | "exclusions"
    | "timeBasis"
    | "startEvent"
    | "endEvent"
  >
>;

const FIELD_LABELS: Record<PatchableField, string> = {
  numerator: "Numerator",
  denominator: "Denominator",
  formula: "Formula",
  inclusions: "Inclusions",
  exclusions: "Exclusions",
  timeBasis: "Time basis",
  startEvent: "Start event",
  endEvent: "End event",
};

const PATCHABLE_FIELDS: PatchableField[] = [
  "numerator",
  "denominator",
  "formula",
  "inclusions",
  "exclusions",
  "timeBasis",
  "startEvent",
  "endEvent",
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function displayValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createMetricPatch(
  currentDefinition: MetricDefinition,
  changes: PatchChanges,
  summary: string,
): MetricPatch {
  const nextDefinition: MetricDefinition = {
    ...clone(currentDefinition),
    ...clone(changes),
    status: "Needs Review",
    version: currentDefinition.version,
  };
  delete nextDefinition.approvedAt;

  const items = PATCHABLE_FIELDS.flatMap((field): MetricPatchItem[] => {
    if (!(field in changes)) return [];
    const beforeValue = currentDefinition[field];
    const afterValue = nextDefinition[field];
    if (sameValue(beforeValue, afterValue)) return [];
    return [
      {
        field,
        label: FIELD_LABELS[field],
        before: displayValue(beforeValue),
        after: displayValue(afterValue) ?? "",
      },
    ];
  });

  if (items.length === 0) {
    throw new Error("Metric patch must contain at least one structural change.");
  }

  return {
    metricId: currentDefinition.id,
    summary,
    items,
    nextDefinition,
    status: "Ready to apply",
  };
}

function replaceRatioDenominator(
  formula: MetricExpression,
  denominator: MetricExpression,
): MetricExpression {
  if (formula.kind !== "ratio") {
    throw new Error("Headcount basis can only be changed for a ratio metric.");
  }
  return {
    ...clone(formula),
    denominator: clone(denominator),
  };
}

export function createHeadcountBasisPatch(
  definition: MetricDefinition,
  basis: HeadcountBasis,
): MetricPatch {
  const denominator =
    basis === "beginning"
      ? BEGINNING_HEADCOUNT_EXPRESSION
      : AVERAGE_HEADCOUNT_EXPRESSION;
  const timeBasis =
    basis === "beginning"
      ? "Beginning headcount at the start of the measurement period"
      : "Average headcount across approved observations in the period";

  return createMetricPatch(
    definition,
    {
      denominator: clone(denominator),
      formula: replaceRatioDenominator(definition.formula, denominator),
      timeBasis,
    },
    `Use ${basis} headcount as the attrition denominator`,
  );
}

function voluntaryRules(
  definition: MetricDefinition,
  classification: RetirementClassification,
): MetricRule[] {
  const existing =
    definition.numerator?.kind === "count"
      ? definition.numerator.rules ?? []
      : definition.inclusions;
  const withoutTerminationType = existing.filter(
    (item) => item.field !== "termination_type",
  );
  const values =
    classification === "voluntary"
      ? ["Voluntary", "Resignation", "Retirement"]
      : ["Voluntary", "Resignation"];

  return [
    ...clone(withoutTerminationType),
    {
      field: "termination_type",
      operator: "in",
      value: values,
      label:
        classification === "voluntary"
          ? "Approved voluntary separation types, including retirement"
          : "Approved voluntary separation types; retirement is not voluntary",
    },
  ];
}

function retirementExclusion(
  classification: RetirementClassification,
): MetricRule[] {
  if (classification === "voluntary") return [];
  return [
    {
      field: "termination_type",
      operator: "equals",
      value: "Retirement",
      label:
        classification === "involuntary"
          ? "Retirement is classified as involuntary and excluded from voluntary attrition"
          : "Retirement is excluded from voluntary attrition by approved policy",
    },
  ];
}

export function createRetirementClassificationPatch(
  definition: MetricDefinition,
  classification: RetirementClassification,
): MetricPatch {
  if (definition.key !== "voluntary_attrition") {
    throw new Error(
      "Retirement classification patch requires the Voluntary Attrition metric.",
    );
  }
  if (definition.numerator?.kind !== "count" || definition.formula.kind !== "ratio") {
    throw new Error("Voluntary Attrition must have a count numerator and ratio formula.");
  }

  const rules = voluntaryRules(definition, classification);
  const numerator: MetricExpression = {
    ...clone(definition.numerator),
    rules,
  };

  return createMetricPatch(
    definition,
    {
      numerator,
      formula: {
        ...clone(definition.formula),
        numerator,
      },
      inclusions: rules,
      exclusions: retirementExclusion(classification),
    },
    `Classify retirement as ${classification} for Voluntary Attrition`,
  );
}

export function createRetirementAmbiguity(
  metric: MetricDefinition = VOLUNTARY_ATTRITION_METRIC,
): MetricAmbiguity {
  return {
    id: `${metric.id}-retirement-classification`,
    metricId: metric.id,
    question: "How should retirement be classified for attrition reporting?",
    whyItMatters:
      "Including retirement as voluntary changes the numerator; excluding it changes both voluntary and, under local policy, potentially total attrition.",
    options: [
      {
        id: "voluntary",
        label: "Include retirement as voluntary",
        value: "voluntary",
      },
      {
        id: "involuntary",
        label: "Classify retirement as involuntary",
        value: "involuntary",
      },
      {
        id: "excluded",
        label: "Exclude retirement from classified attrition",
        value: "excluded",
      },
    ],
    status: "Open",
  };
}

export function applyMetricPatch(
  patch: MetricPatch,
  approvedAt: string | Date = new Date(),
): MetricPatch {
  if (patch.status !== "Ready to apply") {
    throw new Error(`Only a ready metric patch can be applied; received ${patch.status}.`);
  }

  const timestamp =
    approvedAt instanceof Date ? approvedAt.toISOString() : new Date(approvedAt).toISOString();

  return {
    ...clone(patch),
    status: "Applied",
    nextDefinition: {
      ...clone(patch.nextDefinition),
      version: patch.nextDefinition.version + 1,
      status: "Approved",
      approvedAt: timestamp,
    },
  };
}

export function applyMetricDefinitionPatch(
  patch: MetricPatch,
  approvedAt?: string | Date,
): MetricDefinition {
  return applyMetricPatch(patch, approvedAt).nextDefinition;
}
