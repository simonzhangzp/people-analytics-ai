import {
  compileMetricRules,
  escapeSqlIdentifier,
  type CompiledSqlFragment,
  type SqlParameter,
} from "@/lib/metrics/sql-compiler";
import { VOLUNTARY_ATTRITION_METRIC } from "@/lib/metrics/library";
import type {
  HeadcountBasis,
  RetirementClassification,
} from "@/lib/metrics/patches";
import type {
  ConfidenceLevel,
  MetricDefinition,
  MetricRule,
} from "@/types/workbench";

export interface AttritionPeriod {
  id: string;
  label: string;
  start?: string;
  end?: string;
}

export interface AttritionPeriods {
  comparison: AttritionPeriod;
  current: AttritionPeriod;
}

export interface AttritionRow {
  employeeId: string | number;
  period: string;
  department?: string | null;
  tenureBand?: string | null;
  level?: string | number | null;
  compensationPositioning?: number | null;
  managerId?: string | number | null;
  activeAtStart?: boolean | null;
  activeAtEnd?: boolean | null;
  exitEvent?: boolean | null;
  voluntaryExit?: boolean | null;
  terminationType?: string | null;
  /**
   * Optional positive analytic weight. Raw employee rows normally omit it;
   * synthetic or pre-aggregated fixtures can use it deterministically.
   */
  weight?: number;
}

export type ResolvedRetirementClassification =
  | RetirementClassification
  | "unresolved";

export interface AttritionAnalysisInput {
  rows: readonly AttritionRow[];
  periods: AttritionPeriods;
  population: string;
  metricDefinition?: MetricDefinition;
  denominatorBasis?: HeadcountBasis;
  retirementClassification?: ResolvedRetirementClassification;
  populationFilter?: (row: AttritionRow) => boolean;
}

export interface PeriodAttritionMetrics {
  periodId: string;
  periodLabel: string;
  startingHeadcount: number;
  endingHeadcount: number;
  denominator: number;
  voluntaryExits: number;
  totalExits: number;
  voluntaryAttritionRate: number | null;
  totalAttritionRate: number | null;
}

export interface AttritionTrend {
  comparison: PeriodAttritionMetrics;
  current: PeriodAttritionMetrics;
  voluntaryChangePp: number | null;
  totalChangePp: number | null;
}

export interface SegmentContribution {
  segment: string;
  comparisonExits: number;
  currentExits: number;
  comparisonExitRate: number | null;
  currentExitRate: number | null;
  contributionPp: number | null;
  shareOfChangePct: number | null;
}

export interface CompensationBandResult {
  band: string;
  denominator: number;
  voluntaryExits: number;
  exitRate: number | null;
}

export interface CompensationAssociation {
  status: "observed" | "insufficient_data";
  bands: CompensationBandResult[];
  belowMarketExitRate: number | null;
  atOrAboveMarketExitRate: number | null;
  differencePp: number | null;
  observedAssociation: string;
  causal: false;
  confidence: ConfidenceLevel;
  limitation: string;
  missingPositioningRows: number;
}

export interface ManagerAnalysisAvailability {
  status: "available" | "blocked";
  requiredField: "managerId";
  coveredRows: number;
  missingRows: number;
  coveragePct: number;
  reason?: string;
}

export interface AttritionAnalysisResult {
  population: string;
  periods: AttritionPeriods;
  metricId: string;
  metricVersion: number;
  denominatorBasis: HeadcountBasis;
  retirementClassification: ResolvedRetirementClassification;
  trend: AttritionTrend;
  tenureContribution: SegmentContribution[];
  levelContribution: SegmentContribution[];
  compensationAssociation: CompensationAssociation;
  managerAnalysis: ManagerAnalysisAvailability;
  confidence: ConfidenceLevel;
  limitations: string[];
}

interface NormalizedRow {
  employeeId: string;
  period: string;
  department: string | null;
  tenureBand: string;
  level: string;
  compensationPositioning: number | null;
  managerId: string | null;
  activeAtStart: boolean;
  activeAtEnd: boolean;
  exitEvent: boolean;
  voluntaryExit: boolean | null;
  terminationType: string | null;
  weight: number;
}

const round = (value: number, precision = 2): number => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

function validWeight(value: number | undefined): number {
  const weight = value ?? 1;
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new Error("Attrition row weight must be a positive finite number.");
  }
  return weight;
}

function normalizedTermination(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isRetirement(value: string | null | undefined): boolean {
  const termination = normalizedTermination(value);
  return termination === "retirement" || termination.startsWith("retir");
}

function isVoluntaryType(value: string | null | undefined): boolean {
  const termination = normalizedTermination(value);
  if (termination.startsWith("involuntary")) return false;
  return (
    termination === "voluntary" ||
    termination.startsWith("voluntary ") ||
    termination === "resignation" ||
    termination.startsWith("resign") ||
    termination === "quit"
  );
}

function hasExitEvent(row: AttritionRow): boolean {
  if (row.exitEvent !== null && row.exitEvent !== undefined) {
    return row.exitEvent;
  }
  return normalizedTermination(row.terminationType).length > 0;
}

function normalizeRows(
  input: AttritionAnalysisInput,
): NormalizedRow[] {
  const relevantPeriods = new Set([
    input.periods.comparison.id,
    input.periods.current.id,
  ]);
  const rows = input.rows.filter(
    (row) =>
      relevantPeriods.has(row.period) &&
      (input.populationFilter ? input.populationFilter(row) : true),
  );
  const byPeriod = new Map<string, Map<string, NormalizedRow>>();

  for (const row of rows) {
    const periodRows = byPeriod.get(row.period) ?? new Map<string, NormalizedRow>();
    byPeriod.set(row.period, periodRows);
    const employeeId = String(row.employeeId);
    const exitEvent = hasExitEvent(row);
    const activeAtStart = row.activeAtStart ?? true;
    const normalized: NormalizedRow = {
      employeeId,
      period: row.period,
      department: row.department ?? null,
      tenureBand: String(row.tenureBand ?? "Unknown"),
      level: String(row.level ?? "Unknown"),
      compensationPositioning:
        typeof row.compensationPositioning === "number" &&
        Number.isFinite(row.compensationPositioning)
          ? row.compensationPositioning
          : null,
      managerId:
        row.managerId === null || row.managerId === undefined
          ? null
          : String(row.managerId),
      activeAtStart,
      activeAtEnd: row.activeAtEnd ?? (activeAtStart && !exitEvent),
      exitEvent,
      voluntaryExit:
        row.voluntaryExit === null || row.voluntaryExit === undefined
          ? null
          : row.voluntaryExit,
      terminationType: row.terminationType ?? null,
      weight: validWeight(row.weight),
    };
    const existing = periodRows.get(employeeId);

    if (!existing) {
      periodRows.set(employeeId, normalized);
      continue;
    }

    existing.activeAtStart ||= normalized.activeAtStart;
    existing.activeAtEnd ||= normalized.activeAtEnd;
    existing.exitEvent ||= normalized.exitEvent;
    existing.voluntaryExit =
      existing.voluntaryExit === true || normalized.voluntaryExit === true
        ? true
        : existing.voluntaryExit ?? normalized.voluntaryExit;
    existing.terminationType =
      normalized.terminationType ?? existing.terminationType;
    existing.department = existing.department ?? normalized.department;
    if (existing.tenureBand === "Unknown") {
      existing.tenureBand = normalized.tenureBand;
    }
    if (existing.level === "Unknown") {
      existing.level = normalized.level;
    }
    existing.compensationPositioning =
      existing.compensationPositioning ?? normalized.compensationPositioning;
    existing.managerId = existing.managerId ?? normalized.managerId;
    existing.weight = Math.max(existing.weight, normalized.weight);
  }

  return [...byPeriod.values()].flatMap((periodRows) => [
    ...periodRows.values(),
  ]);
}

export function inferHeadcountBasis(
  definition: MetricDefinition,
): HeadcountBasis {
  const timeBasis = definition.timeBasis?.toLowerCase() ?? "";
  if (timeBasis.includes("beginning")) return "beginning";
  if (
    definition.denominator?.kind === "count" &&
    definition.denominator.rules?.some(
      (rule) => rule.field === "active_at_period_start",
    )
  ) {
    return "beginning";
  }
  return "average";
}

export function inferRetirementClassification(
  definition: MetricDefinition,
): ResolvedRetirementClassification {
  const rules =
    definition.numerator?.kind === "count"
      ? definition.numerator.rules ?? []
      : definition.inclusions;
  const includesRetirement = rules.some(
    (rule) =>
      rule.field === "termination_type" &&
      (Array.isArray(rule.value)
        ? rule.value.some((value) => isRetirement(String(value)))
        : isRetirement(String(rule.value ?? ""))),
  );
  if (includesRetirement) return "voluntary";

  const retirementRule = definition.exclusions.find(
    (rule) =>
      rule.field === "termination_type" &&
      (isRetirement(String(rule.value ?? "")) ||
        rule.label.toLowerCase().includes("retirement")),
  );
  if (!retirementRule) return "unresolved";
  const label = retirementRule.label.toLowerCase();
  if (label.includes("involuntary")) return "involuntary";
  if (label.includes("approved policy") || label.includes("classified attrition")) {
    return "excluded";
  }
  return "unresolved";
}

function countsAsVoluntary(
  row: NormalizedRow,
  retirement: ResolvedRetirementClassification,
): boolean {
  if (!row.exitEvent) return false;
  if (isRetirement(row.terminationType)) {
    return retirement === "voluntary";
  }
  return row.voluntaryExit ?? isVoluntaryType(row.terminationType);
}

function countsAsTotalExit(
  row: NormalizedRow,
  retirement: ResolvedRetirementClassification,
): boolean {
  if (!row.exitEvent) return false;
  return !(retirement === "excluded" && isRetirement(row.terminationType));
}

function denominator(
  rows: readonly NormalizedRow[],
  basis: HeadcountBasis,
): { starting: number; ending: number; value: number } {
  const starting = rows.reduce(
    (sum, row) => sum + (row.activeAtStart ? row.weight : 0),
    0,
  );
  const ending = rows.reduce(
    (sum, row) => sum + (row.activeAtEnd ? row.weight : 0),
    0,
  );
  return {
    starting: round(starting),
    ending: round(ending),
    value: round(basis === "beginning" ? starting : (starting + ending) / 2),
  };
}

function rate(numerator: number, denominatorValue: number): number | null {
  return denominatorValue > 0 ? round((numerator / denominatorValue) * 100) : null;
}

function difference(
  current: number | null,
  comparison: number | null,
): number | null {
  return current === null || comparison === null
    ? null
    : round(current - comparison);
}

function periodMetrics(
  rows: readonly NormalizedRow[],
  period: AttritionPeriod,
  basis: HeadcountBasis,
  retirement: ResolvedRetirementClassification,
): PeriodAttritionMetrics {
  const periodRows = rows.filter((row) => row.period === period.id);
  const headcount = denominator(periodRows, basis);
  const voluntaryExits = round(
    periodRows.reduce(
      (sum, row) =>
        sum + (countsAsVoluntary(row, retirement) ? row.weight : 0),
      0,
    ),
  );
  const totalExits = round(
    periodRows.reduce(
      (sum, row) =>
        sum + (countsAsTotalExit(row, retirement) ? row.weight : 0),
      0,
    ),
  );

  return {
    periodId: period.id,
    periodLabel: period.label,
    startingHeadcount: headcount.starting,
    endingHeadcount: headcount.ending,
    denominator: headcount.value,
    voluntaryExits,
    totalExits,
    voluntaryAttritionRate: rate(voluntaryExits, headcount.value),
    totalAttritionRate: rate(totalExits, headcount.value),
  };
}

function contributionBy(
  rows: readonly NormalizedRow[],
  periods: AttritionPeriods,
  basis: HeadcountBasis,
  retirement: ResolvedRetirementClassification,
  overallChangePp: number | null,
  segmentFor: (row: NormalizedRow) => string,
): SegmentContribution[] {
  const segments = new Set(rows.map(segmentFor));
  const results = [...segments].map((segment): SegmentContribution => {
    const comparisonRows = rows.filter(
      (row) =>
        row.period === periods.comparison.id && segmentFor(row) === segment,
    );
    const currentRows = rows.filter(
      (row) => row.period === periods.current.id && segmentFor(row) === segment,
    );
    const comparisonDenominator = denominator(comparisonRows, basis).value;
    const currentDenominator = denominator(currentRows, basis).value;
    const comparisonExits = round(
      comparisonRows.reduce(
        (sum, row) =>
          sum + (countsAsVoluntary(row, retirement) ? row.weight : 0),
        0,
      ),
    );
    const currentExits = round(
      currentRows.reduce(
        (sum, row) =>
          sum + (countsAsVoluntary(row, retirement) ? row.weight : 0),
        0,
      ),
    );
    const overallComparisonDenominator = denominator(
      rows.filter((row) => row.period === periods.comparison.id),
      basis,
    ).value;
    const overallCurrentDenominator = denominator(
      rows.filter((row) => row.period === periods.current.id),
      basis,
    ).value;
    const comparisonContribution =
      overallComparisonDenominator > 0
        ? (comparisonExits / overallComparisonDenominator) * 100
        : null;
    const currentContribution =
      overallCurrentDenominator > 0
        ? (currentExits / overallCurrentDenominator) * 100
        : null;
    const contributionPp =
      comparisonContribution === null || currentContribution === null
        ? null
        : round(currentContribution - comparisonContribution);
    const shareOfChangePct =
      contributionPp === null ||
      overallChangePp === null ||
      overallChangePp === 0
        ? null
        : round((contributionPp / overallChangePp) * 100, 0);

    return {
      segment,
      comparisonExits,
      currentExits,
      comparisonExitRate: rate(comparisonExits, comparisonDenominator),
      currentExitRate: rate(currentExits, currentDenominator),
      contributionPp,
      shareOfChangePct,
    };
  });

  return results.sort((left, right) => {
    const contributionOrder =
      Math.abs(right.contributionPp ?? 0) - Math.abs(left.contributionPp ?? 0);
    return contributionOrder || left.segment.localeCompare(right.segment);
  });
}

function compensationBand(value: number): string {
  if (value < 0.9) return "<0.90";
  if (value < 1) return "0.90–0.99";
  if (value < 1.1) return "1.00–1.09";
  return "≥1.10";
}

function associationConfidence(
  belowDenominator: number,
  aboveDenominator: number,
  coveragePct: number,
): ConfidenceLevel {
  if (belowDenominator >= 100 && aboveDenominator >= 100 && coveragePct >= 90) {
    return "High";
  }
  if (belowDenominator >= 30 && aboveDenominator >= 30 && coveragePct >= 70) {
    return "Medium";
  }
  return "Low";
}

function compensationAssociation(
  rows: readonly NormalizedRow[],
  currentPeriodId: string,
  basis: HeadcountBasis,
  retirement: ResolvedRetirementClassification,
): CompensationAssociation {
  const currentRows = rows.filter((row) => row.period === currentPeriodId);
  const rowsWithPositioning = currentRows.filter(
    (row) => row.compensationPositioning !== null,
  );
  const missingPositioningRows = round(
    currentRows.reduce(
      (sum, row) =>
        sum + (row.compensationPositioning === null ? row.weight : 0),
      0,
    ),
  );
  const bands = ["<0.90", "0.90–0.99", "1.00–1.09", "≥1.10"].flatMap(
    (band): CompensationBandResult[] => {
      const bandRows = rowsWithPositioning.filter(
        (row) => compensationBand(row.compensationPositioning!) === band,
      );
      if (!bandRows.length) return [];
      const bandDenominator = denominator(bandRows, basis).value;
      const voluntaryExits = round(
        bandRows.reduce(
          (sum, row) =>
            sum + (countsAsVoluntary(row, retirement) ? row.weight : 0),
          0,
        ),
      );
      return [
        {
          band,
          denominator: bandDenominator,
          voluntaryExits,
          exitRate: rate(voluntaryExits, bandDenominator),
        },
      ];
    },
  );
  const belowRows = rowsWithPositioning.filter(
    (row) => row.compensationPositioning! < 1,
  );
  const aboveRows = rowsWithPositioning.filter(
    (row) => row.compensationPositioning! >= 1,
  );
  const belowDenominator = denominator(belowRows, basis).value;
  const aboveDenominator = denominator(aboveRows, basis).value;
  const belowExits = belowRows.reduce(
    (sum, row) =>
      sum + (countsAsVoluntary(row, retirement) ? row.weight : 0),
    0,
  );
  const aboveExits = aboveRows.reduce(
    (sum, row) =>
      sum + (countsAsVoluntary(row, retirement) ? row.weight : 0),
    0,
  );
  const belowMarketExitRate = rate(belowExits, belowDenominator);
  const atOrAboveMarketExitRate = rate(aboveExits, aboveDenominator);
  const differencePp = difference(
    belowMarketExitRate,
    atOrAboveMarketExitRate,
  );
  const observed =
    belowMarketExitRate !== null && atOrAboveMarketExitRate !== null;
  const totalWeight = currentRows.reduce((sum, row) => sum + row.weight, 0);
  const coveredWeight = rowsWithPositioning.reduce(
    (sum, row) => sum + row.weight,
    0,
  );
  const coveragePct = totalWeight > 0 ? (coveredWeight / totalWeight) * 100 : 0;
  const direction =
    differencePp === null
      ? ""
      : differencePp >= 0
        ? `${Math.abs(differencePp)} pp higher`
        : `${Math.abs(differencePp)} pp lower`;

  return {
    status: observed ? "observed" : "insufficient_data",
    bands,
    belowMarketExitRate,
    atOrAboveMarketExitRate,
    differencePp,
    observedAssociation: observed
      ? `Below-market compensation positioning had an observed voluntary exit rate of ${belowMarketExitRate}% versus ${atOrAboveMarketExitRate}% at or above market (${direction}). This is an observed association, not causation.`
      : "Compensation positioning does not cover both below-market and at-or-above-market groups, so an observed association cannot be estimated.",
    causal: false,
    confidence: associationConfidence(
      belowDenominator,
      aboveDenominator,
      coveragePct,
    ),
    limitation:
      "This descriptive comparison is an observed association, not evidence that compensation positioning caused exits; role, location, tenure, and selection effects may confound it.",
    missingPositioningRows,
  };
}

function managerAvailability(
  rows: readonly NormalizedRow[],
  currentPeriodId: string,
): ManagerAnalysisAvailability {
  const currentRows = rows.filter(
    (row) => row.period === currentPeriodId && row.activeAtStart,
  );
  const coveredRows = round(
    currentRows.reduce(
      (sum, row) => sum + (row.managerId === null ? 0 : row.weight),
      0,
    ),
  );
  const missingRows = round(
    currentRows.reduce(
      (sum, row) => sum + (row.managerId === null ? row.weight : 0),
      0,
    ),
  );
  const total = coveredRows + missingRows;
  const coveragePct = total > 0 ? round((coveredRows / total) * 100) : 0;

  if (coveredRows === 0) {
    return {
      status: "blocked",
      requiredField: "managerId",
      coveredRows,
      missingRows,
      coveragePct,
      reason:
        "Manager analysis is blocked because managerId is missing for the current-period population.",
    };
  }

  return {
    status: "available",
    requiredField: "managerId",
    coveredRows,
    missingRows,
    coveragePct,
    reason:
      missingRows > 0
        ? `Manager analysis is available with ${coveragePct}% manager coverage; missing assignments must remain a limitation.`
        : undefined,
  };
}

function overallConfidence(
  trend: AttritionTrend,
  manager: ManagerAnalysisAvailability,
): ConfidenceLevel {
  const minimumDenominator = Math.min(
    trend.comparison.denominator,
    trend.current.denominator,
  );
  if (minimumDenominator >= 200 && manager.status === "available") return "High";
  if (minimumDenominator >= 50) return "Medium";
  return "Low";
}

export function executeAttritionAnalysis(
  input: AttritionAnalysisInput,
): AttritionAnalysisResult {
  const definition = input.metricDefinition ?? VOLUNTARY_ATTRITION_METRIC;
  const basis = input.denominatorBasis ?? inferHeadcountBasis(definition);
  const retirement =
    input.retirementClassification ??
    inferRetirementClassification(definition);
  const rows = normalizeRows(input);
  const comparison = periodMetrics(
    rows,
    input.periods.comparison,
    basis,
    retirement,
  );
  const current = periodMetrics(
    rows,
    input.periods.current,
    basis,
    retirement,
  );
  const trend: AttritionTrend = {
    comparison,
    current,
    voluntaryChangePp: difference(
      current.voluntaryAttritionRate,
      comparison.voluntaryAttritionRate,
    ),
    totalChangePp: difference(
      current.totalAttritionRate,
      comparison.totalAttritionRate,
    ),
  };
  const manager = managerAvailability(rows, input.periods.current.id);
  const compensation = compensationAssociation(
    rows,
    input.periods.current.id,
    basis,
    retirement,
  );
  const limitations = [
    retirement === "unresolved"
      ? "Retirement classification is unresolved; retirement is excluded from voluntary attrition but retained in total attrition."
      : `Retirement is classified as ${retirement} under the applied metric definition.`,
    compensation.limitation,
  ];
  if (manager.status === "blocked") {
    limitations.push(manager.reason!);
  } else if (manager.missingRows > 0 && manager.reason) {
    limitations.push(manager.reason);
  }

  return {
    population: input.population,
    periods: input.periods,
    metricId: definition.id,
    metricVersion: definition.version,
    denominatorBasis: basis,
    retirementClassification: retirement,
    trend,
    tenureContribution: contributionBy(
      rows,
      input.periods,
      basis,
      retirement,
      trend.voluntaryChangePp,
      (row) => row.tenureBand,
    ),
    levelContribution: contributionBy(
      rows,
      input.periods,
      basis,
      retirement,
      trend.voluntaryChangePp,
      (row) => row.level,
    ),
    compensationAssociation: compensation,
    managerAnalysis: manager,
    confidence: overallConfidence(trend, manager),
    limitations,
  };
}

export interface AttritionSourceColumns {
  employeeId: string;
  period: string;
  department?: string;
  tenureBand?: string;
  level?: string;
  compensationPositioning?: string;
  managerId?: string;
  activeAtStart?: string;
  activeAtEnd?: string;
  exitEvent?: string;
  voluntaryExit?: string;
  terminationType?: string;
  weight?: string;
}

export interface AttritionRowSource {
  tableName: string;
  columns: AttritionSourceColumns;
  rules?: readonly MetricRule[];
}

export interface CompiledAttritionRowQuery extends CompiledSqlFragment {
  kind: "compiled_attrition_rows";
}

const OPTIONAL_PROJECTIONS: Array<
  [keyof Omit<AttritionSourceColumns, "employeeId" | "period">, keyof AttritionRow]
> = [
  ["department", "department"],
  ["tenureBand", "tenureBand"],
  ["level", "level"],
  ["compensationPositioning", "compensationPositioning"],
  ["managerId", "managerId"],
  ["activeAtStart", "activeAtStart"],
  ["activeAtEnd", "activeAtEnd"],
  ["exitEvent", "exitEvent"],
  ["voluntaryExit", "voluntaryExit"],
  ["terminationType", "terminationType"],
  ["weight", "weight"],
];

function projection(column: string | undefined, alias: string): string {
  return `${column ? escapeSqlIdentifier(column) : "NULL"} AS ${escapeSqlIdentifier(
    alias,
  )}`;
}

export function compileAttritionRowQuery(
  source: AttritionRowSource,
): CompiledAttritionRowQuery {
  const rules = compileMetricRules(source.rules ?? []);
  const projections = [
    projection(source.columns.employeeId, "employeeId"),
    projection(source.columns.period, "period"),
    ...OPTIONAL_PROJECTIONS.map(([columnKey, alias]) =>
      projection(source.columns[columnKey], alias),
    ),
  ];

  return {
    kind: "compiled_attrition_rows",
    sql: [
      `SELECT ${projections.join(", ")}`,
      `FROM ${escapeSqlIdentifier(source.tableName)}`,
      source.rules?.length ? `WHERE ${rules.sql}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    parameters: rules.parameters,
  };
}

export interface AttritionQueryAdapter {
  query<T>(
    sql: string,
    parameters: readonly SqlParameter[],
  ): Promise<readonly T[]>;
}

export type AdapterAttritionInput = Omit<AttritionAnalysisInput, "rows">;

export async function executeAttritionAnalysisWithAdapter(
  adapter: AttritionQueryAdapter,
  source: AttritionRowSource,
  input: AdapterAttritionInput,
): Promise<AttritionAnalysisResult> {
  const periodRule: MetricRule = {
    field: source.columns.period,
    operator: "in",
    value: [input.periods.comparison.id, input.periods.current.id],
    label: "Requested comparison and current analysis periods",
  };
  const query = compileAttritionRowQuery({
    ...source,
    rules: [...(source.rules ?? []), periodRule],
  });
  const rows = await adapter.query<AttritionRow>(query.sql, query.parameters);
  return executeAttritionAnalysis({ ...input, rows });
}
