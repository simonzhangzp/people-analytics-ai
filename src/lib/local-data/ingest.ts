"use client";

import "client-only";

import type {
  AsyncDuckDB,
  AsyncDuckDBConnection,
} from "@duckdb/duckdb-wasm";
import { readPeopleFileText } from "@/lib/data/file-encoding";
import {
  resolveTableHeaders,
  stripSectionHeaderLine,
} from "@/lib/data/report-headers";
import type { DataRow } from "@/types/local-data";
import type {
  DatasetRelationship,
  LocalWorkbenchDataset,
} from "@/types/workbench";
import {
  executeDuckDB,
  getLocalDuckDB,
  queryDuckDB,
  withDuckDBConnection,
} from "./duckdb-client";
import { inferDatasetRelationships } from "./infer-relationships";
import { profileDuckDBTable } from "./profile-table";
import {
  buildSafeWorkbenchPayload,
  LOCAL_PROCESSING_NOTICE,
  type SafeWorkbenchPayload,
} from "./safe-profile";
import {
  buildExplorationQuery,
  EXPLORATION_ROW_LIMIT,
  quoteIdentifier,
} from "./sql";

const MAX_LOCAL_FILE_BYTES = 400 * 1024 * 1024;
let tableSequence = 0;

export interface LocalDataEngineResult {
  processingMode: "local-only";
  privacyNotice: string;
  explorationRowLimit: typeof EXPLORATION_ROW_LIMIT;
  datasets: LocalWorkbenchDataset[];
  relationships: DatasetRelationship[];
  safePayload: SafeWorkbenchPayload;
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase();
}

function localToken() {
  tableSequence += 1;
  const uuid = globalThis.crypto?.randomUUID?.().replaceAll("-", "");
  return uuid?.slice(0, 16) ?? `${Date.now().toString(36)}${tableSequence}`;
}

function localTableName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const slug =
    baseName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "dataset";
  return `people_${slug}_${localToken()}`;
}

function cleanWorkbookCell(value: unknown): DataRow[string] {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value === "string" ? value.trim() : value;
  }
  return String(value);
}

async function workbookAsJson(file: File) {
  const { readSheet } = await import("read-excel-file/browser");
  const table = await readSheet(await file.arrayBuffer());
  const { headers, dataStart } = resolveTableHeaders(table);
  if (headers.length === 0) {
    throw new Error(`${file.name} does not contain a worksheet header.`);
  }

  const rows = table
    .slice(dataStart)
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [
          header,
          cleanWorkbookCell(values[index]),
        ]),
      ),
    )
    .filter((row) => Object.values(row).some((value) => value !== null));
  if (rows.length === 0) {
    throw new Error(`${file.name} does not contain any data rows.`);
  }
  return JSON.stringify(rows);
}

async function registerSource(
  database: AsyncDuckDB,
  connection: AsyncDuckDBConnection,
  file: File,
  tableName: string,
) {
  const extension = fileExtension(file.name);
  const token = localToken();

  if (extension === "csv") {
    const { text } = await readPeopleFileText(file);
    const prepared = stripSectionHeaderLine(text);
    const virtualFileName = `local_upload_${token}.csv`;
    await database.registerFileText(virtualFileName, prepared.text);
    try {
      await connection.insertCSVFromPath(virtualFileName, {
        name: tableName,
        create: true,
        header: true,
        detect: true,
      });
    } finally {
      await database.dropFile(virtualFileName);
    }
    return;
  }

  if (extension === "xlsx") {
    const normalizedJson = await workbookAsJson(file);
    const virtualFileName = `local_upload_${token}.json`;
    await database.registerFileText(virtualFileName, normalizedJson);
    try {
      await connection.insertJSONFromPath(virtualFileName, {
        name: tableName,
        create: true,
      });
    } finally {
      await database.dropFile(virtualFileName);
    }
    return;
  }

  throw new Error(`${file.name} is not a supported CSV or XLSX file.`);
}

async function ingestFileWithConnection(
  database: AsyncDuckDB,
  connection: AsyncDuckDBConnection,
  file: File,
): Promise<LocalWorkbenchDataset> {
  if (file.size > MAX_LOCAL_FILE_BYTES) {
    throw new Error(`${file.name} exceeds the 400 MB local-processing limit.`);
  }

  const tableName = localTableName(file.name);
  try {
    await registerSource(database, connection, file, tableName);
    const metadata = await profileDuckDBTable(
      connection,
      tableName,
      file,
    );
    const explorationRows = await queryDuckDB(
      buildExplorationQuery(tableName),
      connection,
    );
    return { metadata, explorationRows };
  } catch (error) {
    await executeDuckDB(
      `DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`,
      connection,
    );
    throw error;
  }
}

export async function getExplorationRows(
  tableName: string,
  requestedLimit = EXPLORATION_ROW_LIMIT,
) {
  return queryDuckDB(buildExplorationQuery(tableName, requestedLimit));
}

export async function ingestPeopleFile(
  file: File,
): Promise<LocalWorkbenchDataset> {
  const database = await getLocalDuckDB();
  return withDuckDBConnection((connection) =>
    ingestFileWithConnection(database, connection, file),
  );
}

export async function ingestPeopleFiles(
  files: File[],
): Promise<LocalDataEngineResult> {
  if (files.length === 0) {
    throw new Error("Select at least one CSV or XLSX file.");
  }

  const database = await getLocalDuckDB();
  return withDuckDBConnection(async (connection) => {
    const datasets: LocalWorkbenchDataset[] = [];
    try {
      for (const file of files) {
        datasets.push(
          await ingestFileWithConnection(database, connection, file),
        );
      }
      const relationships = await inferDatasetRelationships(
        connection,
        datasets.map((dataset) => dataset.metadata),
      );
      return {
        processingMode: "local-only",
        privacyNotice: LOCAL_PROCESSING_NOTICE,
        explorationRowLimit: EXPLORATION_ROW_LIMIT,
        datasets,
        relationships,
        safePayload: buildSafeWorkbenchPayload(datasets, relationships),
      };
    } catch (error) {
      for (const dataset of datasets) {
        await executeDuckDB(
          `DROP TABLE IF EXISTS ${quoteIdentifier(
            dataset.metadata.localTableName,
          )}`,
          connection,
        );
      }
      throw error;
    }
  });
}

export async function dropLocalDataset(tableName: string) {
  await executeDuckDB(
    `DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`,
  );
}
