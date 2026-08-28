import type {
  ColumnProfile,
  GrainDefinition,
} from "@/types/workbench";

export interface DatasetFingerprintStructure {
  schemaVersion: 1;
  rowCount: number;
  inferredType: string;
  grain: Pick<GrainDefinition, "label" | "keys">;
  columns: Array<
    Pick<
      ColumnProfile,
      | "sourceName"
      | "inferredType"
      | "nullCount"
      | "distinctCount"
      | "likelyPII"
      | "canonicalField"
    >
  >;
}

export function buildDatasetFingerprintStructure(input: {
  rowCount: number;
  inferredType: string;
  grain: GrainDefinition;
  columns: ColumnProfile[];
}): DatasetFingerprintStructure {
  return {
    schemaVersion: 1,
    rowCount: input.rowCount,
    inferredType: input.inferredType,
    grain: {
      label: input.grain.label,
      keys: [...input.grain.keys],
    },
    columns: input.columns.map((column) => ({
      sourceName: column.sourceName,
      inferredType: column.inferredType,
      nullCount: column.nullCount,
      distinctCount: column.distinctCount,
      likelyPII: column.likelyPII,
      canonicalField: column.canonicalField,
    })),
  };
}

export function serializeFingerprintStructure(
  structure: DatasetFingerprintStructure,
) {
  return JSON.stringify(structure);
}

export async function fingerprintDatasetStructure(
  structure: DatasetFingerprintStructure,
) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable in this browser.");
  }

  const bytes = new TextEncoder().encode(
    serializeFingerprintStructure(structure),
  );
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
