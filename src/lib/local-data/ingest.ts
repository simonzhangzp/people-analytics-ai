"use client";

import "client-only";

import type {
  AsyncDuckDB,
  AsyncDuckDBConnection,
} from "@duckdb/duckdb-wasm";
import {
  detectFileEncoding,
  readPeopleFileText,
} from "@/lib/data/file-encoding";
import {
  resolveTableHeaders,
  stripSectionHeaderLine,
} from "@/lib/data/report-headers";
import type { DataRow } from "@/types/local-data";
import type {
  ColumnProfile,
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
import {
  omitPrivateExplorationColumns,
  publicExplorationColumnNames,
} from "./privacy";
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
  quoteLiteral,
} from "./sql";

const MAX_LOCAL_FILE_BYTES = 400 * 1024 * 1024;
export const MAX_WORKBENCH_FILES = 10;
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

export async function validateWorkbenchFile(file: File) {
  if (file.size > MAX_LOCAL_FILE_BYTES) {
    throw new Error(`${file.name} exceeds the 400 MB local-processing limit.`);
  }
  const extension = fileExtension(file.name);
  if (extension === "xls") {
    throw new Error(
      `${file.name} uses the legacy .xls format. Save it as .xlsx or CSV before attaching it.`,
    );
  }
  if (extension !== "csv" && extension !== "xlsx") {
    throw new Error(`${file.name} is not a supported CSV or XLSX file.`);
  }

  const bytes = new Uint8Array(
    await file.slice(0, Math.min(file.size, 4_096)).arrayBuffer(),
  );
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;
  if (extension === "xlsx") {
    if (!isZip) {
      throw new Error(
        `${file.name} has an .xlsx extension but no XLSX/ZIP signature.`,
      );
    }
    return extension;
  }
  if (isZip) {
    throw new Error(
      `${file.name} has a CSV extension but contains an XLSX/ZIP signature.`,
    );
  }
  const utf16Bom =
    bytes.length >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) ||
      (bytes[0] === 0xfe && bytes[1] === 0xff));
  if (!utf16Bom && bytes.some((byte) => byte === 0)) {
    throw new Error(`${file.name} does not appear to be a text CSV file.`);
  }
  return extension;
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

function normalizeWorkbookColumnTypes(
  headers: readonly string[],
  rows: DataRow[],
) {
  const mixedColumns = new Set(
    headers.filter((header) => {
      const valueTypes = new Set(
        rows.flatMap((row) => {
          const value = row[header];
          return value === null || value === undefined ? [] : [typeof value];
        }),
      );
      return valueTypes.size > 1;
    }),
  );
  if (mixedColumns.size === 0) return rows;
  return rows.map((row) =>
    Object.fromEntries(
      headers.map((header) => {
        const value = row[header];
        return [
          header,
          mixedColumns.has(header) && value !== null && value !== undefined
            ? String(value)
            : value,
        ];
      }),
    ),
  );
}

async function workbookSheetsAsJson(file: File) {
  const { default: readWorkbook } = await import("read-excel-file/browser");
  const workbook = await readWorkbook(await file.arrayBuffer());
  const validSheets = workbook.flatMap(({ sheet, data: table }) => {
    const { headers, dataStart } = resolveTableHeaders(table);
    if (headers.length === 0) return [];
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
    if (rows.length === 0) return [];
    return [
      {
        sheet,
        columnOrder: headers,
        json: JSON.stringify(normalizeWorkbookColumnTypes(headers, rows)),
      },
    ];
  });
  if (validSheets.length === 0) {
    throw new Error(`${file.name} does not contain a non-empty worksheet.`);
  }
  return validSheets;
}

interface RegisteredSource {
  tableName: string;
  displayName: string;
  sheetName?: string;
  columnOrder?: string[];
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
    const prefixBytes = new Uint8Array(
      await file.slice(0, Math.min(file.size, 65_536)).arrayBuffer(),
    );
    const binaryFastPath =
      detectFileEncoding(prefixBytes) === "utf-8" &&
      !/^.*section\s*\d+.*(?:\r?\n)/i.test(
        new TextDecoder("utf-8").decode(prefixBytes),
      );
    if (binaryFastPath) {
      const virtualFileName = `local_upload_${token}.csv`;
      await database.registerFileBuffer(
        virtualFileName,
        new Uint8Array(await file.arrayBuffer()),
      );
      try {
        await connection.query(
          `CREATE TABLE ${quoteIdentifier(tableName)} AS
          SELECT *
          FROM read_csv_auto('${virtualFileName}', header = true, sample_size = 20480)`,
        );
      } finally {
        await database.dropFile(virtualFileName);
      }
      return [{ tableName, displayName: file.name }] satisfies RegisteredSource[];
    }
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
    return [{ tableName, displayName: file.name }] satisfies RegisteredSource[];
  }

  if (extension === "xlsx") {
    const sheets = await workbookSheetsAsJson(file);
    const registered: RegisteredSource[] = [];
    for (const [index, sheet] of sheets.entries()) {
      const sheetTableName =
        index === 0
          ? tableName
          : localTableName(
              `${file.name.replace(/\.[^.]+$/, "")}_${sheet.sheet}`,
            );
      const virtualFileName = `local_upload_${token}_${index + 1}.json`;
      await database.registerFileText(virtualFileName, sheet.json);
      try {
        try {
          await connection.query(
            `CREATE TABLE ${quoteIdentifier(sheetTableName)} AS
            SELECT *
            FROM read_json_auto(${quoteLiteral(virtualFileName)}, format = 'array')`,
          );
        } catch {
          await connection.insertJSONFromPath(virtualFileName, {
            name: sheetTableName,
            create: true,
          });
        }
        registered.push({
          tableName: sheetTableName,
          displayName: `${file.name} · ${sheet.sheet}`,
          sheetName: sheet.sheet,
          columnOrder: sheet.columnOrder,
        });
      } finally {
        await database.dropFile(virtualFileName);
      }
    }
    return registered;
  }

  throw new Error(`${file.name} is not a supported CSV or XLSX file.`);
}

async function ingestFileWithConnection(
  database: AsyncDuckDB,
  connection: AsyncDuckDBConnection,
  file: File,
): Promise<LocalWorkbenchDataset[]> {
  await validateWorkbenchFile(file);
  const tableName = localTableName(file.name);
  const registered: RegisteredSource[] = [];
  try {
    registered.push(
      ...(await registerSource(database, connection, file, tableName)),
    );
    const datasets: LocalWorkbenchDataset[] = [];
    for (const source of registered) {
      const metadata = await profileDuckDBTable(
        connection,
        source.tableName,
        {
          name: source.displayName,
          size: file.size,
        },
        { sourceColumnOrder: source.columnOrder },
      );
      metadata.sourceFileName = file.name;
      metadata.sheetName = source.sheetName;
      const publicColumns = publicExplorationColumnNames(metadata.columns);
      const explorationRows =
        publicColumns.length === 0
          ? []
          : (
              await queryDuckDB(
                buildExplorationQuery(source.tableName, publicColumns),
                connection,
              )
            ).map((row) =>
              omitPrivateExplorationColumns(row, metadata.columns),
            );
      datasets.push({ metadata, explorationRows });
    }
    return datasets;
  } catch (error) {
    for (const source of registered.length
      ? registered
      : [{ tableName, displayName: file.name }]) {
      await executeDuckDB(
        `DROP TABLE IF EXISTS ${quoteIdentifier(source.tableName)}`,
        connection,
      );
    }
    throw error;
  }
}

export async function getExplorationRows(
  tableName: string,
  columns: readonly ColumnProfile[],
  requestedLimit = EXPLORATION_ROW_LIMIT,
) {
  const publicColumns = publicExplorationColumnNames(columns);
  if (publicColumns.length === 0) return [];
  return (
    await queryDuckDB(
      buildExplorationQuery(tableName, publicColumns, requestedLimit),
    )
  ).map((row) => omitPrivateExplorationColumns(row, columns));
}

export async function ingestPeopleFile(
  file: File,
): Promise<LocalWorkbenchDataset> {
  const database = await getLocalDuckDB();
  return withDuckDBConnection(async (connection) => {
    const datasets = await ingestFileWithConnection(
      database,
      connection,
      file,
    );
    return datasets[0];
  });
}

export async function ingestPeopleFiles(
  files: File[],
): Promise<LocalDataEngineResult> {
  if (files.length === 0) {
    throw new Error("Select at least one CSV or XLSX file.");
  }
  if (files.length > MAX_WORKBENCH_FILES) {
    throw new Error(
      `Attach no more than ${MAX_WORKBENCH_FILES} source files at once.`,
    );
  }

  const database = await getLocalDuckDB();
  return withDuckDBConnection(async (connection) => {
    const datasets: LocalWorkbenchDataset[] = [];
    try {
      for (const file of files) {
        datasets.push(
          ...(await ingestFileWithConnection(database, connection, file)),
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
