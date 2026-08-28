export type UnsafeAIPayloadCode =
  | "forbidden_key"
  | "raw_row_array"
  | "payload_too_deep"
  | "payload_too_complex";

export class UnsafeAIPayloadError extends Error {
  readonly code: UnsafeAIPayloadCode;
  readonly path: string;

  constructor(code: UnsafeAIPayloadCode, path: string, message: string) {
    super(message);
    this.name = "UnsafeAIPayloadError";
    this.code = code;
    this.path = path;
  }
}

const FORBIDDEN_KEYS = new Set([
  "rows",
  "rawrows",
  "explorationrows",
  "samplevalues",
  "rawdata",
  "rawrecords",
  "datarows",
]);

const SAFE_STRUCTURED_ARRAY_KEYS = new Set([
  "datasets",
  "profiles",
  "datasetprofiles",
  "columns",
  "knownmappings",
  "mappingproposals",
  "knownrelationships",
  "relationshipproposals",
  "metrics",
  "inclusions",
  "exclusions",
  "rules",
  "options",
  "steps",
  "aggregatedresults",
  "insights",
  "evidence",
  "suggestedfollowups",
  "slides",
  "items",
]);

const RAW_IDENTITY_KEYS = new Set([
  "employeeid",
  "employeeidentifier",
  "employeenumber",
  "workerid",
  "personid",
  "email",
  "emailaddress",
  "firstname",
  "lastname",
  "fullname",
  "employeename",
  "phone",
  "phonenumber",
  "address",
  "streetaddress",
  "socialsecuritynumber",
  "ssn",
  "dateofbirth",
  "dob",
  "managerid",
  "nationalid",
  "passportnumber",
  "mobile",
]);

const MAX_DEPTH = 14;
const MAX_VISITED_NODES = 25_000;

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function isScalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function rawIdentityPath(records: Record<string, unknown>[]): string | null {
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (RAW_IDENTITY_KEYS.has(normalizeKey(key))) return key;
    }
  }
  return null;
}

function looksLikeHomogeneousRows(records: Record<string, unknown>[]): boolean {
  if (records.length < 2) return false;

  const keySets = records.slice(0, 10).map((record) => Object.keys(record));
  const firstKeys = keySets[0] ?? [];
  const commonKeys = firstKeys.filter((key) =>
    keySets.every((keys) => keys.includes(key)),
  );
  if (commonKeys.length < 2) return false;

  return records.slice(0, 10).every((record) => {
    const values = Object.values(record);
    if (values.length === 0) return false;
    const scalarCount = values.filter(isScalar).length;
    return scalarCount / values.length >= 0.8;
  });
}

function isAggregateChartData(records: Record<string, unknown>[]): boolean {
  return records.every((record) => {
    const keys = Object.keys(record).map(normalizeKey);
    return (
      keys.length > 0 &&
      keys.every((key) => key === "label" || key === "value") &&
      keys.includes("label") &&
      keys.includes("value")
    );
  });
}

export function assertSafeAIPayload(payload: unknown): void {
  let visitedNodes = 0;

  function visit(value: unknown, path: string, keyForValue: string, depth: number): void {
    visitedNodes += 1;
    if (visitedNodes > MAX_VISITED_NODES) {
      throw new UnsafeAIPayloadError(
        "payload_too_complex",
        path,
        "AI payload contains too many nested values.",
      );
    }
    if (depth > MAX_DEPTH) {
      throw new UnsafeAIPayloadError(
        "payload_too_deep",
        path,
        "AI payload nesting is too deep.",
      );
    }

    if (Array.isArray(value)) {
      const records = value.filter(isPlainRecord);
      if (records.length === value.length && records.length > 0) {
        const identityKey = rawIdentityPath(records);
        if (identityKey) {
          throw new UnsafeAIPayloadError(
            "raw_row_array",
            `${path}[].${identityKey}`,
            "AI payload appears to contain employee-level records.",
          );
        }

        const normalizedParentKey = normalizeKey(keyForValue);
        const safeAggregateData =
          normalizedParentKey === "data" &&
          isAggregateChartData(records);
        const unsafeDataArray =
          normalizedParentKey === "data" &&
          !safeAggregateData;
        if (
          unsafeDataArray ||
          (!SAFE_STRUCTURED_ARRAY_KEYS.has(normalizedParentKey) &&
            !safeAggregateData &&
            looksLikeHomogeneousRows(records))
        ) {
          throw new UnsafeAIPayloadError(
            "raw_row_array",
            path,
            "AI payload appears to contain an array of raw records.",
          );
        }
      }

      value.forEach((item, index) =>
        visit(item, `${path}[${index}]`, keyForValue, depth + 1),
      );
      return;
    }

    if (!isPlainRecord(value)) return;

    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = normalizeKey(key);
      const childPath = path === "<root>" ? key : `${path}.${key}`;
      if (FORBIDDEN_KEYS.has(normalizedKey)) {
        throw new UnsafeAIPayloadError(
          "forbidden_key",
          childPath,
          `AI payload key "${key}" is not allowed.`,
        );
      }
      visit(child, childPath, key, depth + 1);
    }
  }

  visit(payload, "<root>", "", 0);
}
