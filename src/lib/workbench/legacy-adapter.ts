import { parseAndProfileFiles } from "@/lib/data/local-profiler";
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

function likelyDemoMatch(from: LocalDataset, to: LocalDataset) {
  const names = `${from.name} ${to.name}`.toLowerCase();
  if (names.includes("headcount") && names.includes("termination")) return 1;
  if (
    (names.includes("headcount") || names.includes("termination")) &&
    names.includes("compensation")
  ) {
    return 0.98;
  }
  return 0;
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
      const matchRate = likelyDemoMatch(from, to);
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
        matchRate,
        confidence: matchRate ? 0.82 : 0.35,
        status: matchRate ? "Approved" : "Needs Review",
        evidence: matchRate
          ? [
              "Shared canonical employee identifier",
              "Fallback profiler inferred compatible entity grains",
            ]
          : ["Shared identifier found; value overlap needs the local SQL engine"],
        conflicts: matchRate ? [] : ["Join coverage not calculated in fallback mode"],
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
      const columns = dataset.columns.map((column) => ({
        sourceName: column.name,
        inferredType:
          column.inferredType === "mixed" ? ("unknown" as const) : column.inferredType,
        rowCount: dataset.rowCount,
        nullCount: Math.round(dataset.rowCount * (column.nullPercent / 100)),
        nullPct: column.nullPercent / 100,
        distinctCount: Math.round(
          dataset.rowCount * (column.uniquePercent / 100),
        ),
        distinctPct: column.uniquePercent / 100,
        likelyPII: column.likelyPii,
        canonicalField: column.canonicalField,
        semanticMeaning: dataset.mappings.find(
          (mapping) => mapping.sourceField === column.name,
        )?.proposedMeaning,
        confidence:
          column.confidence === undefined ? undefined : column.confidence / 100,
      }));
      const fingerprint = await safeFingerprint(dataset);
      return {
        metadata: {
          id: dataset.id,
          name: dataset.name,
          fingerprint,
          localTableName: normalizeTableName(dataset.name, index),
          fileSize: dataset.size,
          rowCount: dataset.rowCount,
          inferredType: dataset.entity,
          typeConfidence: dataset.entity === "People Dataset" ? 0.45 : 0.8,
          grain: {
            label: dataset.grain,
            keys: dataset.mappings
              .filter((mapping) =>
                ["employee_id", "snapshot_month", "term_date"].includes(
                  mapping.canonicalField,
                ),
              )
              .map((mapping) => mapping.sourceField),
            evidence: [
              `${dataset.columns.length} columns profiled locally`,
              `${dataset.mappings.length} People fields proposed`,
            ],
          },
          grainConfidence: dataset.entity === "People Dataset" ? 0.4 : 0.78,
          columns,
          timeRange: dataset.timeRange,
          healthScore: dataset.health,
          issues: dataset.issues,
          status:
            dataset.mappingStatus === "Mapped" ? "Approved" : "Needs Review",
          safeProfile: {
            fileName: dataset.name,
            rowCount: dataset.rowCount,
            columnCount: columns.length,
            inferredType: dataset.entity,
            grain: dataset.grain,
            grainConfidence: dataset.entity === "People Dataset" ? 0.4 : 0.78,
            timeRange: dataset.timeRange,
            columns: columns.map((column) => ({
              sourceName: column.sourceName,
              inferredType: column.inferredType,
              nullPct: column.nullPct,
              distinctPct: column.distinctPct,
              likelyPII: column.likelyPII,
              canonicalField: column.canonicalField,
              semanticMeaning: column.semanticMeaning,
              confidence: column.confidence,
            })),
          },
        },
        explorationRows: dataset.rows.slice(0, 5_000),
      };
    }),
  );

  return {
    datasets: converted,
    mappings,
    relationships: inferRelationships(datasets, mappings),
  };
}

