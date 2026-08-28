import type {
  DatasetMetadata,
  DatasetRelationship,
  LocalWorkbenchDataset,
  SafeDatasetProfile,
} from "@/types/workbench";

export const LOCAL_PROCESSING_NOTICE =
  "Files and exploration rows stay in this browser. Safe payloads contain structural metadata only.";

export interface SafeWorkbenchPayload {
  processingMode: "local-only";
  privacyNotice: string;
  datasets: SafeDatasetProfile[];
  relationships: DatasetRelationship[];
}

function confidenceScore(value: number | undefined) {
  if (value === undefined) return undefined;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

type SafeProfileSource = Pick<
  DatasetMetadata,
  | "name"
  | "rowCount"
  | "inferredType"
  | "grain"
  | "grainConfidence"
  | "timeRange"
  | "columns"
>;

export function buildSafeDatasetProfile(
  metadata: SafeProfileSource,
): SafeDatasetProfile {
  return {
    fileName: metadata.name,
    rowCount: metadata.rowCount,
    columnCount: metadata.columns.length,
    inferredType: metadata.inferredType,
    grain: metadata.grain.label,
    grainConfidence: confidenceScore(metadata.grainConfidence) ?? 0,
    timeRange: metadata.timeRange,
    columns: metadata.columns.map((column) => ({
      sourceName: column.sourceName,
      inferredType: column.inferredType,
      nullPct: column.nullPct,
      distinctPct: column.distinctPct,
      likelyPII: column.likelyPII,
      sensitive: column.sensitive,
      canonicalField: column.canonicalField,
      semanticRole: column.semanticRole,
      semanticMeaning: column.semanticMeaning,
      confidence: confidenceScore(column.confidence),
    })),
  };
}

export function buildSafeWorkbenchPayload(
  datasets: LocalWorkbenchDataset[],
  relationships: DatasetRelationship[],
): SafeWorkbenchPayload {
  return {
    processingMode: "local-only",
    privacyNotice: LOCAL_PROCESSING_NOTICE,
    datasets: datasets.map((dataset) => ({
      ...dataset.metadata.safeProfile,
      columns: dataset.metadata.safeProfile.columns.map((column) => ({
        ...column,
      })),
    })),
    relationships: relationships.map((relationship) => ({
      ...relationship,
      evidence: [...relationship.evidence],
      conflicts: [...relationship.conflicts],
    })),
  };
}
