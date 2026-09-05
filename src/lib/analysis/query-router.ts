import { isSafeAggregateDimension } from "@/lib/local-data/privacy";
import type { CapabilityReport } from "@/types/semantics";
import type {
  DataThreadTurn,
  LocalWorkbenchDataset,
  PeopleDomain,
  QueryDifficulty,
  ResolvedQueryIntent,
} from "@/types/workbench";

type SupportedDomain = Exclude<PeopleDomain, "other">;

const DOMAIN_HINTS: Record<SupportedDomain, RegExp> = {
  workforce: /headcount|workforce|staff|employee|员工|人数|人力|在职/i,
  retention: /attrition|turnover|retention|exit|termination|离职|流失|留任/i,
  recruiting: /recruit|hire|candidate|application|vacan|招聘|候选|录用/i,
  compensation: /pay|salary|compensation|wage|reward|薪酬|工资|薪资/i,
  performance: /performance|rating|review|appraisal|绩效|评级/i,
  absence: /absence|sickness|leave|absent|缺勤|病假|请假/i,
  engagement: /engagement|survey|pulse|sentiment|敬业|调查|满意/i,
  learning: /learning|training|course|skill|培训|学习|课程/i,
  mobility: /mobility|promotion|movement|transfer|晋升|流动|调动/i,
  diversity:
    /diversity|representation|gender|ethnic|equity|多元|性别|族裔|代表性/i,
};

const DIMENSION_HINTS: Record<string, RegExp> = {
  country: /\bcountr(?:y|ies)\b|国家|所在国/i,
  region: /\bregion\b|\bgeo\b|区域|大区/i,
  location: /\blocation\b|\boffice\b|\bsite\b|地点|办公地|城市/i,
  department: /\bdepartment\b|\bfunction\b|\borg(?:anization)?\b|部门|组织/i,
  job_role: /\bjob role\b|\brole\b|\bposition\b|岗位|职位/i,
  seniority_level: /\blevel\b|\bgrade\b|\bseniority\b|职级|级别/i,
  employee_type: /\bemployee type\b|\bworker type\b|员工类别|用工类型/i,
  employment_status: /\bstatus\b|在职状态|员工状态/i,
  education_level: /\beducation(?: level)?\b|学历|教育程度/i,
  academic_degree: /\bdegree\b|学位/i,
  school: /\bschool\b|\buniversity\b|学校|院校/i,
  major: /\bmajor\b|\bfield of study\b|专业/i,
  gender: /\bgender\b|\bsex\b|性别/i,
  nationality: /\bnationalit|\bcitizenship\b|国籍/i,
  ethnicity: /\bethnic|race\b|族裔|种族/i,
};

const DIAGNOSTIC_HINT =
  /\bwhy\b|\bdriver\b|\bdrivers\b|\bexplain\b|\bcontribut|\bincreas|\bdecreas|\bchange[sd]?\b|\bgrowth\b|\bwhere did\b|为什么|为何|原因|驱动|增长|下降|变化|来自/i;
const SEMANTIC_HINT =
  /voluntary attrition|involuntary attrition|turnover rate|retention rate|time to fill|quality of hire|pay gap|absence rate|engagement score|自愿离职|流失率|留任率|招聘周期|薪酬差距|缺勤率|敬业度/i;
const PROFILE_HINT =
  /different cut|different breakdown|breakdown|composition|profile|typical|主要cut|主要切分|\bcuts\b|典型|画像|构成|不同切分|各维度/i;
const TREND_HINT = /\btrend\b|over time|month|quarter|year|趋势|随时间|按月|按季|按年/i;
const LEADERSHIP_HINT =
  /\bleadership\b|\bleaders?\b|管理层|领导层|管理干部|领导班子/i;
const TOP_N_HINT = /(?:\btop\s+|前\s*)(\d+)/i;
const PEOPLE_EXPLORE_FIELDS = [
  "location",
  "job_role",
  "department",
  "seniority_level",
  "cost_center",
  "region",
  "tenure_band",
] as const;

function queryDifficulty(question: string): QueryDifficulty {
  if (DIAGNOSTIC_HINT.test(question)) return "diagnostic";
  if (SEMANTIC_HINT.test(question)) return "semantic";
  return "simple";
}

function hintedDomain(
  question: string,
  previous?: ResolvedQueryIntent,
): SupportedDomain {
  const match = (
    Object.entries(DOMAIN_HINTS) as Array<[SupportedDomain, RegExp]>
  ).find(([, pattern]) => pattern.test(question));
  return match?.[0] ?? previous?.domain ?? "workforce";
}

function columnNumberFromLetters(letters: string): number {
  return letters
    .toUpperCase()
    .split("")
    .reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
}

function explicitColumnIndex(question: string): number | undefined {
  const match =
    question.match(/(?:use|using|用)\s*(?:column\s*)?([a-z]{1,3})\s*(?:column|列)?/i) ??
    question.match(/(?:column\s*)?([a-z]{1,3})\s*(?:column|列)/i);
  if (!match?.[1]) return undefined;
  const number = columnNumberFromLetters(match[1]);
  return number > 0 ? number - 1 : undefined;
}

function fieldForIndex(dataset: LocalWorkbenchDataset, index: number | undefined) {
  if (index === undefined) return undefined;
  return (
    dataset.metadata.columns.find((column) => column.sourceIndex === index) ??
    dataset.metadata.columns[index]
  );
}

function canonicalField(
  dataset: LocalWorkbenchDataset,
  names: readonly string[],
) {
  return names
    .map((name) =>
      dataset.metadata.columns.find((column) => column.canonicalField === name),
    )
    .find(Boolean);
}

function requestedDimensions(
  question: string,
  dataset: LocalWorkbenchDataset,
) {
  const requestedCanonical = Object.entries(DIMENSION_HINTS)
    .filter(([, pattern]) => pattern.test(question))
    .map(([field]) => field);
  const directSourceMatches = dataset.metadata.columns.filter((column) => {
    const source = column.sourceName.trim().toLocaleLowerCase();
    return source.length >= 2 && question.toLocaleLowerCase().includes(source);
  });
  const canonicalMatches = requestedCanonical.flatMap((field) => {
    const column = canonicalField(dataset, [field]);
    return column ? [column] : [];
  });
  return [...new Set([...canonicalMatches, ...directSourceMatches])]
    .filter(
      (column) =>
        isSafeAggregateDimension(column) &&
        !["employee_count", "record_count", "movement_count"].includes(
          column.canonicalField ?? "",
        ),
    )
    .map((column) => column.sourceName);
}

const EDUCATION_VALUE_HINTS = [
  "博士",
  "硕士",
  "研究生",
  "本科",
  "学士",
  "大专",
  "专科",
  "高中",
  "中专",
] as const;

function mentionedValues(question: string, candidates: readonly string[]) {
  const normalizedQuestion = question.normalize("NFKC").toLocaleLowerCase();
  return [...new Set(candidates)].filter((value) => {
    const normalized = value.normalize("NFKC").toLocaleLowerCase();
    return normalized.length >= 2 && normalizedQuestion.includes(normalized);
  });
}

function requestedDimensionFilters(
  question: string,
  dataset: LocalWorkbenchDataset,
  dimensions: readonly string[],
) {
  const normalizedQuestion = question.normalize("NFKC").toLocaleLowerCase();
  return dimensions.flatMap((field) => {
    const column = dataset.metadata.columns.find(
      (candidate) => candidate.sourceName === field,
    );
    const values = [
      ...new Set(
        dataset.explorationRows.flatMap((row) => {
          const value = row[field];
          return value === null || value === undefined
            ? []
            : [String(value).trim()];
        }),
      ),
    ].filter(Boolean);
    const matched = values.filter((value) => {
      const normalizedValue = value.normalize("NFKC").toLocaleLowerCase();
      if (
        normalizedValue.length >= 2 &&
        normalizedQuestion.includes(normalizedValue)
      ) {
        return true;
      }
      if (
        column?.canonicalField === "education_level" ||
        column?.canonicalField === "academic_degree"
      ) {
        return EDUCATION_VALUE_HINTS.some(
          (hint) =>
            normalizedQuestion.includes(hint) &&
            normalizedValue.includes(hint),
        );
      }
      return false;
    });
    const requestedEducationHint =
      column?.canonicalField === "education_level" ||
      column?.canonicalField === "academic_degree"
        ? EDUCATION_VALUE_HINTS.find((hint) =>
            normalizedQuestion.includes(hint),
          )
        : undefined;
    const requestedValues =
      matched.length > 0
        ? matched.slice(0, 10)
        : requestedEducationHint
          ? [requestedEducationHint]
          : [];
    return requestedValues.length > 0
      ? [{ field, values: requestedValues }]
      : [];
  });
}

function profileDimensions(dataset: LocalWorkbenchDataset) {
  const preferred = [
    "gender",
    "nationality",
    "country",
    "region",
    "department",
    "location",
    "job_role",
    "seniority_level",
    "employee_type",
    "employment_status",
    "education_level",
    "academic_degree",
    "school",
    "major",
  ];
  const seen = new Set<string>();
  return dataset.metadata.columns
    .filter(
      (column) =>
        isSafeAggregateDimension(column) &&
        column.inferredType === "string" &&
        column.distinctCount >= 2 &&
        column.distinctCount <= 50 &&
        column.nullPct < 50,
    )
    .sort((left, right) => {
      const leftPriority = preferred.indexOf(left.canonicalField ?? "");
      const rightPriority = preferred.indexOf(right.canonicalField ?? "");
      return (
        (leftPriority < 0 ? preferred.length : leftPriority) -
          (rightPriority < 0 ? preferred.length : rightPriority) ||
        left.distinctCount - right.distinctCount
      );
    })
    .filter((column) => {
      const key = column.canonicalField ?? column.sourceName;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((column) => column.sourceName);
}

function exploreDimensions(dataset: LocalWorkbenchDataset) {
  const seen = new Set<string>();
  return PEOPLE_EXPLORE_FIELDS.flatMap((field) => {
    const column = canonicalField(dataset, [field]);
    if (!column || seen.has(column.sourceName)) return [];
    seen.add(column.sourceName);
    return [column.sourceName];
  }).slice(0, 3);
}

function datasetScore(
  dataset: LocalWorkbenchDataset,
  domain: SupportedDomain,
  explicitIndex: number | undefined,
) {
  const fields = new Set(
    dataset.metadata.columns.flatMap((column) =>
      column.canonicalField ? [column.canonicalField] : [],
    ),
  );
  return (
    (dataset.metadata.tableContract?.domains.includes(domain) ? 30 : 0) +
    (domain === "workforce" && fields.has("employee_count") ? 24 : 0) +
    (domain === "workforce" && fields.has("employee_id") ? 20 : 0) +
    (fieldForIndex(dataset, explicitIndex) ? 35 : 0) +
    (dataset.metadata.tableContract?.confidence ?? 0) * 10
  );
}

function latestIntent(thread: readonly DataThreadTurn[]) {
  return [...thread].reverse().find((turn) => turn.intent)?.intent;
}

function requestedSeriesValues(question: string) {
  const quoted = [...question.matchAll(/["“']([^"”']+)["”']/g)].map(
    (match) => match[1]?.trim(),
  );
  if (quoted.length >= 2) return quoted.filter(Boolean) as string[];
  const versus = question.match(
    /(?:of\s+)?([\p{L}\p{N}_-]+)\s+(?:vs\.?|versus|and|与|和)\s+([\p{L}\p{N}_-]+)/iu,
  );
  return versus
    ? [versus[1], versus[2]].filter(
        (value): value is string => Boolean(value?.trim()),
      )
    : [];
}

function requestedLimit(question: string) {
  const match = question.match(TOP_N_HINT);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 50) : undefined;
}

function populationHint(
  question: string,
  previous?: ResolvedQueryIntent,
): ResolvedQueryIntent["populationHint"] {
  if (LEADERSHIP_HINT.test(question)) return "leadership";
  return previous?.populationHint ?? "all";
}

export function resolveQueryIntent(input: {
  question: string;
  datasets: readonly LocalWorkbenchDataset[];
  capabilities: readonly CapabilityReport[];
  thread?: readonly DataThreadTurn[];
  parentTurnId?: string;
}): ResolvedQueryIntent | undefined {
  const question = input.question.trim();
  if (!question || input.datasets.length === 0) return undefined;
  const previous =
    (input.parentTurnId
      ? (input.thread ?? []).find((turn) => turn.id === input.parentTurnId)
          ?.intent
      : undefined) ?? latestIntent(input.thread ?? []);
  const difficulty = queryDifficulty(question);
  const domain = hintedDomain(question, previous);
  const explicitIndex = explicitColumnIndex(question);
  const compatibleIds = new Set(
    input.capabilities.find((item) => item.domain === domain)?.datasetIds ?? [],
  );
  const dataset = [...input.datasets].sort(
    (left, right) =>
      datasetScore(right, domain, explicitIndex) +
        (compatibleIds.has(right.metadata.id) ? 12 : 0) -
      datasetScore(left, domain, explicitIndex) -
      (compatibleIds.has(left.metadata.id) ? 12 : 0),
  )[0];
  if (!dataset) return undefined;

  const explicitMeasure = fieldForIndex(dataset, explicitIndex);
  const aggregateMeasure = canonicalField(dataset, ["employee_count"]);
  const identity = canonicalField(dataset, ["employee_id"]);
  const inheritedMeasure =
    previous?.datasetId === dataset.metadata.id && previous.measureField
      ? dataset.metadata.columns.find(
          (column) => column.sourceName === previous.measureField,
        )
      : undefined;
  const measure =
    explicitMeasure ??
    (domain === "workforce" ? aggregateMeasure ?? identity : undefined) ??
    inheritedMeasure;
  const aggregation =
    measure?.canonicalField === "employee_count"
      ? "sum"
      : measure
        ? "count_distinct"
        : "count";
  const requested = requestedDimensions(question, dataset);
  const wantsProfile = PROFILE_HINT.test(question);
  const limit = requestedLimit(question);
  const wantsTrend = TREND_HINT.test(question) && !limit;
  const population = populationHint(question, previous);
  const availableProfiles = wantsProfile ? profileDimensions(dataset) : [];
  const profiles = wantsProfile
    ? availableProfiles
        .filter((name) => !requested.includes(name))
        .slice(0, Math.max(0, 5 - requested.length))
    : previous?.datasetId === dataset.metadata.id
      ? previous.profileDimensions
      : [];
  const inheritedDimensions =
    requested.length === 0 &&
    previous?.datasetId === dataset.metadata.id &&
    !wantsProfile
      ? previous.dimensions
      : [];
  const dimensions = [...new Set([...requested, ...inheritedDimensions])];
  const snapshotField = canonicalField(dataset, ["snapshot_month"]);
  const aggregatePeriod = aggregateMeasure
    ? canonicalField(dataset, ["report_period"])
    : undefined;
  const contractSnapshot =
    dataset.metadata.tableContract?.time?.role === "as_of_date"
      ? dataset.metadata.tableContract.time.sourceName
      : undefined;
  const timeField =
    snapshotField?.sourceName ??
    aggregatePeriod?.sourceName ??
    contractSnapshot;
  const timeStrategy =
    wantsTrend || (difficulty === "diagnostic" && !limit)
      ? "all"
      : "latest";
  const countryField = canonicalField(dataset, ["country"])?.sourceName;
  const seriesPool = [
    ...(previous?.seriesValues ?? []),
    ...dataset.explorationRows.flatMap((row) => {
      if (!countryField) return [];
      const value = row[countryField];
      return value === null || value === undefined ? [] : [String(value)];
    }),
  ];
  const requestedSeries = requestedSeriesValues(question);
  const mentionedSeries =
    requestedSeries.length > 0
      ? requestedSeries
      : mentionedValues(question, seriesPool);
  const dimensionFilters = [
    ...requestedDimensionFilters(question, dataset, dimensions),
    ...(mentionedSeries.length === 1 &&
    countryField &&
    (dimensions.includes(countryField) || Boolean(previous?.seriesValues.length))
      ? [{ field: countryField, values: mentionedSeries }]
      : []),
  ];
  const assumptions = [
    measure
      ? aggregation === "sum"
        ? `Headcount is summed from ${measure.sourceName}.`
        : `${measure.sourceName} is used as the observed person key.`
      : "Each populated row is counted once.",
    ...(timeField && timeStrategy === "latest"
      ? [`The latest populated ${timeField} snapshot is used.`]
      : []),
    ...(population === "leadership"
      ? ["The answer is limited to observed leadership values."]
      : []),
    ...(limit ? [`Only the top ${limit} groups are shown.`] : []),
    ...dimensionFilters.map(
      (filter) =>
        `${filter.field} is filtered to ${filter.values.join(", ")}.`,
    ),
  ];

  return {
    id: `intent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    difficulty,
    domain,
    metricKey:
      domain === "workforce"
        ? "headcount"
        : input.capabilities.find((item) => item.domain === domain)?.metricKey ??
          previous?.metricKey ??
          domain,
    datasetId: dataset.metadata.id,
    aggregation,
    measureField: measure?.sourceName,
    dimensions,
    profileDimensions: profiles,
    exploreDimensions:
      difficulty === "diagnostic" ? exploreDimensions(dataset) : [],
    dimensionFilters,
    seriesValues:
      mentionedSeries.length > 0
        ? mentionedSeries
        : previous?.seriesValues ?? [],
    timeField,
    timeStrategy,
    limit,
    populationHint: population,
    inheritedFromTurnId: previous
      ? input.parentTurnId ?? (input.thread ?? []).at(-1)?.id
      : undefined,
    assumptions,
    confidence: measure ? "High" : "Medium",
  };
}

export function isDirectlyExecutableIntent(intent: ResolvedQueryIntent) {
  return (
    intent.domain === "workforce" &&
    intent.difficulty !== "semantic" &&
    (Boolean(intent.measureField) || intent.aggregation === "count")
  );
}
