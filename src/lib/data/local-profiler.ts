import type { ParseError } from "papaparse";
import Papa from "papaparse";
import {
  canonicalPeopleFields,
  findCanonicalField,
  isLikelyPii,
} from "@/lib/data/canonical-schema";
import { readPeopleFileText } from "@/lib/data/file-encoding";
import {
  resolveTableHeaders,
  stripSectionHeaderLine,
  type HeaderLayout,
} from "@/lib/data/report-headers";
import type { FieldMapping } from "@/types/domain";
import type {
  CellValue,
  ColumnProfile,
  DataHealthIssue,
  DataRow,
  DatasetAggregates,
  LocalDataset,
  ReadinessAssessment,
} from "@/types/local-data";

const MAX_FILE_BYTES = 400 * 1024 * 1024;
const PROFILE_SAMPLE_SIZE = 6_000;

function cleanValue(value: unknown): CellValue {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function cleanRows(rows: Record<string, unknown>[]) {
  return rows
    .map((row) =>
      Object.fromEntries(
        Object.entries(row)
          .filter(([key]) => key !== "__parsed_extra")
          .map(([key, value]) => [key.replace(/^\uFEFF/, "").trim(), cleanValue(value)]),
      ),
    )
    .filter((row) => Object.values(row).some((value) => value !== null));
}

function asDate(value: CellValue | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(value: CellValue) {
  const date = asDate(value);
  if (date) return date.toISOString().slice(0, 7);
  if (typeof value === "string" && value.length >= 7) return value.slice(0, 7);
  return null;
}

function formatMonthLabel(month: string) {
  const [year, mon] = month.split("-");
  if (!year || !mon) return month;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(mon) - 1, 1)));
}

const MIX_FIELDS = [
  "country",
  "department",
  "region",
  "tenure_band",
  "job_title",
  "employment_category",
  "employment_status",
  "workforce_status",
] as const;

const LATEST_SEGMENT_FIELDS = [
  "country",
  "department",
  "region",
  "job_title",
  "workforce_status",
] as const;

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function fieldForCanonical(row: DataRow, canonicalField: string) {
  return Object.keys(row).find(
    (key) => findCanonicalField(key)?.canonicalField === canonicalField,
  );
}

function topSegments(map: Map<string, number>, limit = 8) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([segment, count]) => ({ segment, count }));
}

function parseCsvText(text: string): Promise<{
  rows: DataRow[];
  totalRows: number;
  uniqueEmployees: number;
  monthlyHeadcount: Map<string, number>;
  statusCounts: Map<string, number>;
  mixMaps: Map<string, Map<string, number>>;
  latestMonth: string | null;
  latestMonthSegmentField?: string;
  latestMonthSegments: Map<string, number>;
  hireYears: Map<string, string>;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
}> {
  return new Promise((resolve, reject) => {
    const sample: DataRow[] = [];
    const employeeIds = new Set<string>();
    const monthlyHeadcount = new Map<string, number>();
    const statusCounts = new Map<string, number>();
    const mixMaps = new Map<string, Map<string, number>>();
    const latestMonthSegments = new Map<string, number>();
    const hireYears = new Map<string, string>();
    let totalRows = 0;
    let employeeField: string | undefined;
    let monthField: string | undefined;
    let statusField: string | undefined;
    let hireField: string | undefined;
    let latestMonthSegmentField: string | undefined;
    let latestMonth: string | null = null;
    let dateRangeStart: string | null = null;
    let dateRangeEnd: string | null = null;
    const mixSources = new Map<string, string>();

    const noteDate = (value: CellValue) => {
      const month = monthKey(value);
      if (!month) return;
      if (!dateRangeStart || month < dateRangeStart) dateRangeStart = month;
      if (!dateRangeEnd || month > dateRangeEnd) dateRangeEnd = month;
    };

    Papa.parse<Record<string, unknown>>(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: "greedy",
      step: (result, parser) => {
        const fatal = result.errors.find(
          (error: ParseError) => error.type === "Quotes" || error.type === "Delimiter",
        );
        if (fatal) {
          parser.abort();
          reject(new Error(fatal.message));
          return;
        }
        const [row] = cleanRows([result.data]);
        if (!row) return;
        totalRows += 1;
        if (!employeeField && !monthField && mixSources.size === 0) {
          employeeField = fieldForCanonical(row, "employee_id");
          monthField = fieldForCanonical(row, "snapshot_month");
          statusField = fieldForCanonical(row, "workforce_status");
          hireField = fieldForCanonical(row, "hire_date");
          for (const canonical of MIX_FIELDS) {
            const source = fieldForCanonical(row, canonical);
            if (source) {
              mixSources.set(canonical, source);
              mixMaps.set(canonical, new Map());
            }
          }
          latestMonthSegmentField = LATEST_SEGMENT_FIELDS.find((field) =>
            mixSources.has(field),
          );
        }
        if (employeeField && row[employeeField] !== null) {
          employeeIds.add(String(row[employeeField]));
        }
        if (monthField) {
          const month = monthKey(row[monthField]);
          if (month) {
            incrementCount(monthlyHeadcount, month);
            noteDate(row[monthField]);
            if (!latestMonth || month > latestMonth) {
              latestMonth = month;
              latestMonthSegments.clear();
            }
            if (
              month === latestMonth &&
              latestMonthSegmentField &&
              mixSources.has(latestMonthSegmentField)
            ) {
              const source = mixSources.get(latestMonthSegmentField);
              if (source && row[source] !== null) {
                incrementCount(latestMonthSegments, String(row[source]));
              }
            }
          }
        }
        if (statusField && row[statusField] !== null) {
          incrementCount(statusCounts, String(row[statusField]));
        }
        if (hireField && row[hireField] !== null) {
          noteDate(row[hireField]);
          if (employeeField && row[employeeField] !== null) {
            const year = monthKey(row[hireField])?.slice(0, 4);
            if (year) hireYears.set(String(row[employeeField]), year);
          }
        }
        for (const [canonical, source] of mixSources) {
          const mixMap = mixMaps.get(canonical);
          if (mixMap && row[source] !== null) {
            incrementCount(mixMap, String(row[source]));
          }
        }
        if (sample.length < PROFILE_SAMPLE_SIZE) {
          sample.push(row);
        }
      },
      complete: () => {
        resolve({
          rows: redactPiiRows(sample),
          totalRows,
          uniqueEmployees: employeeIds.size,
          monthlyHeadcount,
          statusCounts,
          mixMaps,
          latestMonth,
          latestMonthSegmentField,
          latestMonthSegments,
          hireYears,
          dateRangeStart,
          dateRangeEnd,
        });
      },
      error: (error: Error) => reject(error),
    });
  });
}

function piiHeaders(headers: string[]) {
  return headers.filter((key) => {
    const match = findCanonicalField(key);
    return Boolean(match?.likelyPii || match?.sensitive || isLikelyPii(key));
  });
}

function redactPiiRow(row: DataRow, keys?: string[]): DataRow {
  const piiKeys = keys ?? piiHeaders(Object.keys(row));
  if (piiKeys.length === 0) return row;
  const next = { ...row };
  for (const key of piiKeys) {
    if (next[key] !== null && next[key] !== undefined) {
      next[key] = "[redacted]";
    }
  }
  return next;
}

function redactPiiRows(rows: DataRow[]) {
  if (rows.length === 0) return rows;
  const keys = piiHeaders(Object.keys(rows[0]));
  return rows.map((row) => redactPiiRow(row, keys));
}

async function readExcelTable(file: File) {
  const { readSheet } = await import("read-excel-file/browser");
  return readSheet(await file.arrayBuffer());
}

async function parseExcel(file: File): Promise<{
  rows: DataRow[];
  headerLayout: HeaderLayout;
}> {
  const table = await readExcelTable(file);
  if (table.length < 2) return { rows: [], headerLayout: "single" };

  const { headers, dataStart, headerLayout } = resolveTableHeaders(table);
  const rows = table.slice(dataStart).map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [header, cleanValue(values[index])]),
    ),
  );

  return {
    headerLayout,
    rows: rows.filter((row) => Object.values(row).some((value) => value !== null)),
  };
}

function inferType(
  values: CellValue[],
  expectedType?: string,
): ColumnProfile["inferredType"] {
  if (expectedType === "date") return "date";
  if (expectedType === "number") return "number";
  if (expectedType === "boolean") return "boolean";

  const types = new Set(
    values
      .filter((value) => value !== null)
      .map((value) => {
        if (typeof value === "number") return "number";
        if (typeof value === "boolean") return "boolean";
        if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return "date";
        return "string";
      }),
  );

  if (types.size === 0) return "string";
  if (types.size === 1) return [...types][0] as ColumnProfile["inferredType"];
  return "mixed";
}

function buildMappings(headers: string[]): FieldMapping[] {
  return headers.flatMap((sourceField) => {
    const match = findCanonicalField(sourceField);
    if (!match) return [];
    return [
      {
        id: `${sourceField}-${match.canonicalField}`,
        sourceField,
        proposedMeaning: match.label,
        canonicalField: match.canonicalField,
        confidence: match.confidence,
        status: match.confidence >= 90 ? "Confirmed" : "Review",
      },
    ];
  });
}

function buildColumnProfiles(rows: DataRow[], headers: string[]): ColumnProfile[] {
  const sample = rows.slice(0, PROFILE_SAMPLE_SIZE);

  return headers.map((name) => {
    const mapping = findCanonicalField(name);
    const values = sample.map((row) => row[name] ?? null);
    const populated = values.filter((value) => value !== null);
    const unique = new Set(populated.map((value) => String(value))).size;

    return {
      name,
      inferredType: inferType(values, mapping?.expectedType),
      nullPercent: Math.round(((values.length - populated.length) / Math.max(values.length, 1)) * 1000) / 10,
      uniquePercent:
        Math.round((unique / Math.max(populated.length, 1)) * 1000) / 10,
      canonicalField: mapping?.canonicalField,
      confidence: mapping?.confidence,
      likelyPii: mapping?.likelyPii || isLikelyPii(name),
    };
  });
}

function sourceFor(mappings: FieldMapping[], canonicalField: string) {
  return mappings.find((mapping) => mapping.canonicalField === canonicalField)?.sourceField;
}

function hasCanonical(mappings: FieldMapping[], canonicalField: string) {
  return mappings.some((mapping) => mapping.canonicalField === canonicalField);
}

function inferEntity(mappings: FieldMapping[]) {
  if (
    hasCanonical(mappings, "candidate_id") &&
    hasCanonical(mappings, "requisition_id") &&
    hasCanonical(mappings, "application_date")
  ) {
    return {
      entity: "Candidate Application",
      grain: "Candidate × Requisition",
      required: ["candidate_id", "requisition_id", "application_date"],
    };
  }

  if (hasCanonical(mappings, "employee_id") && hasCanonical(mappings, "snapshot_month")) {
    return {
      entity: "Employee Snapshot",
      grain: "Employee × Month",
      required: ["employee_id", "snapshot_month"],
    };
  }

  if (hasCanonical(mappings, "employee_id") && hasCanonical(mappings, "attrition")) {
    return {
      entity: "Employee Outcome",
      grain: "Employee",
      required: ["employee_id", "attrition"],
    };
  }

  if (
    hasCanonical(mappings, "employee_id") &&
    (hasCanonical(mappings, "talent_review_status") ||
      hasCanonical(mappings, "overall_performance") ||
      hasCanonical(mappings, "placement_code") ||
      hasCanonical(mappings, "appraisal_status"))
  ) {
    return {
      entity: "Talent Review Extract",
      grain: "Employee",
      required: ["employee_id"],
    };
  }

  if (hasCanonical(mappings, "employee_id") && hasCanonical(mappings, "hire_date")) {
    return {
      entity: "Employee Hire Extract",
      grain: "Employee",
      required: ["employee_id", "hire_date"],
    };
  }

  if (
    hasCanonical(mappings, "employee_id") &&
    (hasCanonical(mappings, "department") ||
      hasCanonical(mappings, "region") ||
      hasCanonical(mappings, "tenure_band"))
  ) {
    return {
      entity: "Employee Roster",
      grain: "Employee",
      required: ["employee_id"],
    };
  }

  if (hasCanonical(mappings, "requisition_id")) {
    return {
      entity: "Requisition",
      grain: "Requisition",
      required: ["requisition_id"],
    };
  }

  return {
    entity: "People Dataset",
    grain: "Unknown — review required",
    required: [],
  };
}

function formatTimeRange(
  rows: DataRow[],
  mappings: FieldMapping[],
  aggregates?: DatasetAggregates,
) {
  if (aggregates?.dateRangeStart && aggregates.dateRangeEnd) {
    return `${formatMonthLabel(aggregates.dateRangeStart)}–${formatMonthLabel(aggregates.dateRangeEnd)}`;
  }
  if (aggregates?.monthlyHeadcount && aggregates.monthlyHeadcount.length > 0) {
    const first = aggregates.monthlyHeadcount[0].month;
    const last = aggregates.monthlyHeadcount[aggregates.monthlyHeadcount.length - 1].month;
    return `${formatMonthLabel(first)}–${formatMonthLabel(last)}`;
  }

  const dateSources = mappings
    .filter((mapping) => {
      const definition = canonicalPeopleFields[mapping.canonicalField];
      return definition?.type === "date";
    })
    .map((mapping) => mapping.sourceField);

  let minimum: Date | null = null;
  let maximum: Date | null = null;
  for (const row of rows) {
    for (const source of dateSources) {
      const date = asDate(row[source]);
      if (!date) continue;
      if (!minimum || date < minimum) minimum = date;
      if (!maximum || date > maximum) maximum = date;
    }
  }

  if (!minimum || !maximum) return "No usable date range";
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(minimum)}–${formatter.format(maximum)}`;
}

function inspectDataHealth(
  rows: DataRow[],
  mappings: FieldMapping[],
  entity: string,
  required: string[],
) {
  const issues: DataHealthIssue[] = [];
  let health = 100;

  const missingRequiredFields = required.filter(
    (canonicalField) => !hasCanonical(mappings, canonicalField),
  );
  if (missingRequiredFields.length > 0) {
    health -= missingRequiredFields.length * 18;
    issues.push({
      id: "missing-required-fields",
      severity: "High",
      title: "Required fields are missing",
      detail: missingRequiredFields.join(", "),
      impact: "The dataset cannot support its inferred entity grain reliably.",
      recommendation: "Map the source fields or add the missing columns.",
    });
  }

  for (const canonicalField of required) {
    const source = sourceFor(mappings, canonicalField);
    if (!source) continue;
    const missing = rows.filter((row) => row[source] === null).length;
    const missingRate = missing / Math.max(rows.length, 1);
    if (missingRate > 0.01) {
      health -= Math.min(15, Math.round(missingRate * 30));
      issues.push({
        id: `missing-${canonicalField}`,
        severity: missingRate > 0.1 ? "High" : "Medium",
        title: `${canonicalPeopleFields[canonicalField]?.label ?? canonicalField} has missing values`,
        detail: `${(missingRate * 100).toFixed(1)}% of rows are missing this required value.`,
        impact: "Affected rows are excluded from deterministic calculations.",
        recommendation: "Review source-system extraction and null handling.",
      });
    }
  }

  const keyFields =
    entity === "Candidate Application"
      ? ["candidate_id", "requisition_id"]
      : entity === "Employee Snapshot"
        ? ["employee_id", "snapshot_month"]
        : entity === "Employee Outcome" ||
            entity === "Employee Roster" ||
            entity === "Employee Hire Extract" ||
            entity === "Talent Review Extract"
          ? ["employee_id"]
          : [];
  const keySources = keyFields
    .map((field) => sourceFor(mappings, field))
    .filter((field): field is string => Boolean(field));
  if (keySources.length > 0) {
    const keys = rows.map((row) =>
      keySources.map((source) => String(row[source] ?? "")).join("::"),
    );
    const duplicateRate = 1 - new Set(keys).size / Math.max(keys.length, 1);
    if (duplicateRate > 0.001) {
      health -= Math.min(12, Math.round(duplicateRate * 40));
      issues.push({
        id: "duplicate-grain",
        severity: duplicateRate > 0.02 ? "High" : "Medium",
        title: "Likely duplicate rows at the inferred grain",
        detail: `${(duplicateRate * 100).toFixed(1)}% of inferred keys repeat.`,
        impact: "Counts and conversion rates may be overstated.",
        recommendation: "Confirm the grain and define a deterministic deduplication rule.",
      });
    }
  }

  if (entity === "Candidate Application") {
    if (!hasCanonical(mappings, "requisition_open_date")) {
      health -= 5;
      issues.push({
        id: "missing-requisition-open",
        severity: "High",
        title: "Time to Fill start event is unavailable",
        detail: "No requisition open or approval date was found.",
        impact: "The approved Time to Fill definition cannot be calculated.",
        recommendation:
          "Add a requisition extract containing requisition_id and requisition_open_date.",
      });
    }

    const orderedStages = [
      "application_date",
      "reviewed_at",
      "interviewed_at",
      "offer_extended_at",
      "hire_date",
    ];
    const stageSources = orderedStages
      .map((field) => sourceFor(mappings, field))
      .filter((field): field is string => Boolean(field));
    let invalidSequences = 0;
    for (const row of rows) {
      const dates = stageSources
        .map((source) => asDate(row[source]))
        .filter((date): date is Date => Boolean(date));
      if (dates.some((date, index) => index > 0 && date < dates[index - 1])) {
        invalidSequences += 1;
      }
    }
    const invalidRate = invalidSequences / Math.max(rows.length, 1);
    if (invalidRate > 0) {
      health -= Math.min(10, Math.ceil(invalidRate * 50));
      issues.push({
        id: "invalid-stage-order",
        severity: invalidRate > 0.02 ? "High" : "Medium",
        title: "Recruiting stage timestamps are out of order",
        detail: `${invalidSequences.toLocaleString()} rows contain a negative stage duration.`,
        impact: "Those intervals are excluded from stage-duration analysis.",
        recommendation: "Correct source timestamps or document the accepted limitation.",
      });
    }
  }

  if (entity === "Talent Review Extract") {
    const objectiveSource = sourceFor(mappings, "objectives_summary");
    const competencySource = sourceFor(mappings, "competency_summary");
    const appraisalSource = sourceFor(mappings, "appraisal_status");
    if (objectiveSource && competencySource && appraisalSource) {
      const allObjectivesIdle = rows.every((row) => {
        const value = String(row[objectiveSource] ?? "").toLowerCase();
        return value === "" || value.includes("not started");
      });
      const allCompetenciesIdle = rows.every((row) => {
        const value = String(row[competencySource] ?? "").toLowerCase();
        return value === "" || value.includes("not started");
      });
      const completed = rows.filter((row) =>
        /completed/i.test(String(row[appraisalSource] ?? "")),
      ).length;
      if (allObjectivesIdle && allCompetenciesIdle && completed > 0) {
        health -= 8;
        issues.push({
          id: "appraisal-objective-mismatch",
          severity: "Medium",
          title: "Appraisal status and objective summaries disagree",
          detail: `${completed.toLocaleString()} rows are marked appraisal completed while every objectives and competency summary is Not Started.`,
          impact: "Goal-level quality cannot be calculated from this extract.",
          recommendation:
            "Confirm whether the extract omitted objective text or the cycle did not collect objectives.",
        });
      }
    }
  }

  return {
    health: Math.max(0, Math.min(100, Math.round(health))),
    issues,
  };
}

export function profileRows(
  rows: DataRow[],
  file: Pick<File, "name" | "size">,
  sheetName?: string,
  extras?: {
    rowCount?: number;
    aggregates?: DatasetAggregates;
  },
): LocalDataset {
  if (rows.length === 0) {
    throw new Error(`${file.name} does not contain any data rows.`);
  }
  const headers = Object.keys(rows[0]);
  const mappings = buildMappings(headers);
  const inferred = inferEntity(mappings);
  const columns = buildColumnProfiles(rows, headers);
  const health = inspectDataHealth(
    rows,
    mappings,
    inferred.entity,
    inferred.required,
  );
  const rowCount = extras?.rowCount ?? rows.length;
  const sampled = Boolean(extras?.aggregates?.sampled || rowCount > rows.length);

  if (sampled) {
    health.issues.unshift({
      id: "sampled-local-profile",
      severity: "Low",
      title: "Large file was profiled from a local sample",
      detail: `Kept ${rows.length.toLocaleString()} rows in memory after counting ${rowCount.toLocaleString()} rows.`,
      impact: "Full-file counts still drive monthly headcount where available.",
      recommendation: "Add a smaller extract if you need every row inspectable.",
    });
  }

  return {
    id: `${file.name}-${file.size}-${rowCount}`,
    name: file.name,
    size: file.size,
    sheetName,
    entity: inferred.entity,
    grain: inferred.grain,
    rows,
    rowCount,
    columns,
    mappings,
    timeRange: formatTimeRange(rows, mappings, extras?.aggregates),
    health: health.health,
    mappingStatus:
      inferred.entity === "People Dataset"
        ? "Needs input"
        : mappings.some((mapping) => mapping.status === "Review")
          ? "Review"
          : "Mapped",
    issues: health.issues,
    aggregates: extras?.aggregates,
  };
}

export async function parseAndProfileFile(file: File) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} exceeds the 400 MB local-processing limit.`);
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    const { encoding, text: rawText } = await readPeopleFileText(file);
    const prepared = stripSectionHeaderLine(rawText);
    const parsed = await parseCsvText(prepared.text);
    if (parsed.totalRows === 0) {
      throw new Error(`${file.name} does not contain any data rows.`);
    }
    const hireYearCounts = new Map<string, number>();
    for (const year of parsed.hireYears.values()) {
      incrementCount(hireYearCounts, year);
    }

    return profileRows(parsed.rows, file, undefined, {
      rowCount: parsed.totalRows,
      aggregates: {
        sampled: parsed.rows.length < parsed.totalRows,
        sampleRows: parsed.rows.length,
        encoding,
        uniqueEmployees: parsed.uniqueEmployees,
        monthlyHeadcount: [...parsed.monthlyHeadcount.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, count]) => ({ month, count })),
        statusCounts: Object.fromEntries(parsed.statusCounts),
        latestMonth: parsed.latestMonth ?? undefined,
        latestMonthSegmentField: parsed.latestMonthSegmentField,
        latestMonthSegments: topSegments(parsed.latestMonthSegments),
        mixCounts: Object.fromEntries(
          [...parsed.mixMaps.entries()].map(([field, map]) => [field, topSegments(map)]),
        ),
        hireYearCounts: [...hireYearCounts.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([year, count]) => ({ year, count })),
        dateRangeStart: parsed.dateRangeStart ?? undefined,
        dateRangeEnd: parsed.dateRangeEnd ?? undefined,
        headerLayout: prepared.skippedSectionRow ? "section_then_fields" : "single",
      },
    });
  }

  if (extension === "xlsx") {
    const parsed = await parseExcel(file);
    const employeeField = parsed.rows[0]
      ? fieldForCanonical(parsed.rows[0], "employee_id")
      : undefined;
    const uniqueEmployees = employeeField
      ? new Set(
          parsed.rows
            .map((row) => row[employeeField])
            .filter((value) => value !== null)
            .map(String),
        ).size
      : 0;
    const dataset = profileRows(parsed.rows, file, undefined, {
      rowCount: parsed.rows.length,
      aggregates: {
        sampled: false,
        sampleRows: parsed.rows.length,
        uniqueEmployees,
        monthlyHeadcount: [],
        statusCounts: {},
        headerLayout: parsed.headerLayout,
      },
    });
    return {
      ...dataset,
      rows: redactPiiRows(dataset.rows),
    };
  }

  throw new Error(`${file.name} is not a supported CSV or Excel file.`);
}

export async function parseAndProfileFiles(files: File[]) {
  if (files.length === 0) throw new Error("Select at least one CSV or Excel file.");
  return Promise.all(files.map((file) => parseAndProfileFile(file)));
}

export function assessReadiness(datasets: LocalDataset[]): ReadinessAssessment {
  if (datasets.length === 0) {
    return {
      overall: 0,
      scores: {},
      answerability: 0,
      canAnswer: [],
      cannotAnswer: ["No local datasets have been added."],
    };
  }

  const candidate = datasets.find((dataset) => dataset.entity === "Candidate Application");
  const snapshot = datasets.find((dataset) => dataset.entity === "Employee Snapshot");
  const roster = datasets.find((dataset) => dataset.entity === "Employee Roster");
  const hireExtract = datasets.find((dataset) => dataset.entity === "Employee Hire Extract");
  const talentReview = datasets.find((dataset) => dataset.entity === "Talent Review Extract");
  const employee = datasets.find((dataset) => dataset.entity === "Employee Outcome");
  const candidateMappings = candidate?.mappings ?? [];
  const has = (field: string) => hasCanonical(candidateMappings, field);
  const hasTimeToFill = has("requisition_open_date") && has("offer_accepted_at");
  const hasTimeToHire = has("application_date") && has("hire_date");
  const hasStages =
    has("reviewed_at") && has("interviewed_at") && has("offer_extended_at");
  const hasHeadcount = Boolean(snapshot || hireExtract || roster || talentReview);

  const completeness = Math.round(
    datasets.reduce((total, dataset) => total + dataset.health, 0) / datasets.length,
  );
  const consistency = Math.max(
    45,
    100 -
      datasets.reduce(
        (total, dataset) =>
          total +
          dataset.issues.filter((issue) => issue.id === "invalid-stage-order").length * 12,
        0,
      ),
  );
  const joinability =
    snapshot && roster ? 72 : candidate && employee ? 48 : candidate || snapshot ? 68 : 40;
  const timeCoverage =
    snapshot || (candidate && candidate.timeRange !== "No usable date range") ? 94 : 35;
  const metricReadiness = hasTimeToFill
    ? 96
    : hasTimeToHire
      ? hasStages
        ? 79
        : 68
      : snapshot
        ? 88
        : talentReview
          ? 74
          : hireExtract || roster
            ? 62
            : 25;
  const privacySafeguards = datasets.some((dataset) =>
    dataset.columns.some((column) => column.likelyPii),
  )
    ? 70
    : 96;

  const scores = {
    Completeness: completeness,
    Consistency: consistency,
    Joinability: joinability,
    "Time coverage": timeCoverage,
    "Metric readiness": metricReadiness,
    "Privacy safeguards": privacySafeguards,
  };
  const overall = Math.round(
    Object.values(scores).reduce((total, score) => total + score, 0) /
      Object.keys(scores).length,
  );

  const canAnswer = [
    hasTimeToHire ? "Time to Hire for completed hires" : null,
    hasStages ? "Median duration between recruiting stages" : null,
    candidate ? "Recruiting funnel conversion" : null,
    snapshot ? "Monthly headcount trend from employee snapshots" : null,
    hireExtract ? "Hire-date distribution for current employees" : null,
    roster ? "Workforce mix by department, region, or tenure" : null,
    talentReview ? "Talent review and appraisal completion on this extract" : null,
    has("department") || has("source")
      ? "Variation by department and candidate source"
      : null,
  ].filter((value): value is string => Boolean(value));

  const cannotAnswer = [
    !hasTimeToFill
      ? "Approved Time to Fill: requisition open and accepted-offer dates are incomplete"
      : null,
    !candidate && hasHeadcount
      ? "Recruiting stage bottlenecks: no application or requisition extract"
      : null,
    candidate && employee
      ? "Quality of Hire by source: no candidate-to-employee crosswalk"
      : snapshot && !roster
        ? "Workforce composition: snapshot files do not include department or tenure"
        : null,
    candidate && !has("hiring_manager_feedback_at")
      ? "Hiring-manager responsiveness"
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    overall,
    scores,
    answerability: hasTimeToFill
      ? 94
      : hasTimeToHire
        ? 76
        : snapshot
          ? 71
          : hasHeadcount
            ? 54
            : 32,
    canAnswer,
    cannotAnswer,
  };
}

export function canonicalSource(dataset: LocalDataset, canonicalField: string) {
  return sourceFor(dataset.mappings, canonicalField);
}
