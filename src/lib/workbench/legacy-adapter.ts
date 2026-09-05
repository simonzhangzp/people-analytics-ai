import { parseAndProfileFiles } from "@/lib/data/local-profiler";
import {
  buildTableContract,
  inferTableGrain,
  resolveWorkbenchCanonicalField,
} from "@/lib/semantics";
import { omitPrivateExplorationColumns } from "@/lib/local-data/privacy";
import type { LocalDataset } from "@/types/local-data";
import type {
  DatasetRelationship,
  FieldMapping,
  LocalWorkbenchDataset,
} from "@/types/workbench";

function normalizeTableName(value: string, index: number) {
  const base = value
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return `wb_${base || "dataset"}_${index + 1}`;
}

async function safeFingerprint(dataset: LocalDataset) {
  const safeStructure = JSON.stringify({
    name: dataset.name,
    rowCount: dataset.rowCount,
    columns: dataset.columns.map((column) => ({
      name: column.name,
      type: column.inferredType,
      nullPercent: column.nullPercent,
      uniquePercent: column.uniquePercent,
      canonicalField: column.canonicalField,
    })),
  });
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(safeStructure),
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return `local-${dataset.id}-${dataset.rowCount}`;
}

function convertMappings(dataset: LocalDataset): FieldMapping[] {
  return dataset.mappings.map((mapping) => ({
    id: `${dataset.id}-${mapping.id}`,
    datasetId: dataset.id,
    sourceColumn: mapping.sourceField,
    semanticMeaning: mapping.proposedMeaning,
    canonicalField: mapping.canonicalField,
    confidence: mapping.confidence / 100,
    status: mapping.status === "Confirmed" ? "Approved" : "Needs Review",
  }));
}

function inferRelationships(
  datasets: LocalDataset[],
  mappings: FieldMapping[],
): DatasetRelationship[] {
  const relationships: DatasetRelationship[] = [];
  for (let leftIndex = 0; leftIndex < datasets.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < datasets.length;
      rightIndex += 1
    ) {
      const from = datasets[leftIndex];
      const to = datasets[rightIndex];
      const fromEmployee = mappings.find(
        (item) =>
          item.datasetId === from.id && item.canonicalField === "employee_id",
      );
      const toEmployee = mappings.find(
        (item) =>
          item.datasetId === to.id && item.canonicalField === "employee_id",
      );
      if (!fromEmployee || !toEmployee) continue;
      relationships.push({
        id: `relationship-${from.id}-${to.id}`,
        fromDatasetId: from.id,
        fromField: fromEmployee.sourceColumn,
        toDatasetId: to.id,
        toField: toEmployee.sourceColumn,
        cardinality:
          from.grain.includes("Month") || to.grain.includes("Month")
            ? "1:N"
            : "1:1",
        matchRate: 0,
        confidence: 0.25,
        status: "Needs Review",
        evidence: [
          "Shared canonical employee identifier; value overlap was not measured.",
        ],
        conflicts: [
          "Compatibility mode cannot approve joins. Reattach in a browser with DuckDB-Wasm.",
        ],
      });
    }
  }
  return relationships;
}

export async function ingestWithLegacyProfiler(files: File[]) {
  const datasets = await parseAndProfileFiles(files);
  const mappings = datasets.flatMap(convertMappings);
  const converted: LocalWorkbenchDataset[] = await Promise.all(
    datasets.map(async (dataset, index) => {
      const columns = dataset.columns.map((column, sourceIndex) => {
        const mapping = resolveWorkbenchCanonicalField(column.name);
        const inferredType =
          column.inferredType === "mixed"
            ? ("unknown" as const)
            : column.inferredType;
        return {
          sourceName: column.name,
          sourceIndex,
          inferredType,
          rowCount: dataset.rowCount,
          nullCount: Math.round(dataset.rowCount * (column.nullPercent / 100)),
          nullPct: column.nullPercent,
          distinctCount: Math.round(
            dataset.rowCount * (column.uniquePercent / 100),
          ),
          distinctPct: column.uniquePercent,
          likelyPII: column.likelyPii || Boolean(mapping?.likelyPii),
          sensitive: mapping?.sensitive,
          canonicalField: column.canonicalField ?? mapping?.canonicalField,
          semanticRole:
            mapping?.semanticRole ??
            (column.likelyPii
              ? ("pii" as const)
              : inferredType === "date"
                ? ("event_date" as const)
                : inferredType === "number"
                  ? ("measure" as const)
                  : undefined),
          semanticMeaning:
            dataset.mappings.find(
              (item) => item.sourceField === column.name,
            )?.proposedMeaning ?? mapping?.semanticMeaning,
          confidence: column.confidence,
        };
      });
      const fingerprint = await safeFingerprint(dataset);
      const inference = inferTableGrain({ columns });
      const tableContract = {
        ...buildTableContract({
          datasetId: dataset.id,
          columns,
          inference,
        }),
        status: "Needs Review" as const,
        evidence: [
          ...inference.evidence,
          "Compatibility-parser contracts are unverified until DuckDB-Wasm profiles the source.",
        ],
      };
      return {
        metadata: {
          id: dataset.id,
          name: dataset.name,
          fingerprint,
          localTableName: normalizeTableName(dataset.name, index),
          fileSize: dataset.size,
          rowCount: dataset.rowCount,
          inferredType: inference.inferredType,
          typeConfidence: inference.typeConfidence,
          grain: inference.grain,
          grainConfidence: inference.grainConfidence,
          columns,
          timeRange: dataset.timeRange,
          healthScore: dataset.health,
          issues: dataset.issues,
          status: "Needs Review",
          tableContract,
          safeProfile: {
            fileName: dataset.name,
            rowCount: dataset.rowCount,
            columnCount: columns.length,
            inferredType: inference.inferredType,
            grain: inference.grain.label,
            grainConfidence: inference.grainConfidence / 100,
            timeRange: dataset.timeRange,
            columns: columns.map((column) => ({
              sourceName: column.sourceName,
              inferredType: column.inferredType,
              nullPct: column.nullPct,
              distinctPct: column.distinctPct,
              likelyPII: column.likelyPII,
              sensitive: column.sensitive,
              canonicalField: column.canonicalField,
              semanticRole: column.semanticRole,
              semanticMeaning: column.semanticMeaning,
              confidence:
                column.confidence === undefined
                  ? undefined
                  : column.confidence / 100,
            })),
          },
        },
        explorationRows: dataset.rows
          .slice(0, 5_000)
          .map((row) => omitPrivateExplorationColumns(row, columns)),
      };
    }),
  );

  return {
    datasets: converted,
    mappings,
    relationships: inferRelationships(datasets, mappings),
  };
}

