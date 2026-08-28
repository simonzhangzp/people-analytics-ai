"use client";

import "client-only";

import type {
  AsyncDuckDB,
  AsyncDuckDBConnection,
} from "@duckdb/duckdb-wasm";
import type { DataRow } from "@/types/local-data";

let databasePromise: Promise<AsyncDuckDB> | null = null;

export class DuckDBInitializationError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      cause instanceof Error
        ? `DuckDB-Wasm could not initialize: ${cause.message}`
        : "DuckDB-Wasm could not initialize in this browser.",
    );
    this.name = "DuckDBInitializationError";
    this.cause = cause;
  }
}

export function isDuckDBInitializationError(
  error: unknown,
): error is DuckDBInitializationError {
  return (
    error instanceof DuckDBInitializationError ||
    (error instanceof Error && error.name === "DuckDBInitializationError")
  );
}

function requireBrowserRuntime() {
  if (
    typeof window === "undefined" ||
    typeof Worker === "undefined" ||
    typeof Blob === "undefined" ||
    typeof URL === "undefined"
  ) {
    throw new Error(
      "The local DuckDB engine is browser-only and cannot be initialized on the server.",
    );
  }
}

async function initializeDatabase() {
  requireBrowserRuntime();

  const duckdb = await import("@duckdb/duckdb-wasm");
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  if (!bundle.mainWorker) {
    throw new Error("No compatible DuckDB-Wasm worker bundle is available.");
  }

  const workerUrl = URL.createObjectURL(
    new Blob(
      [`importScripts(${JSON.stringify(bundle.mainWorker)});`],
      { type: "text/javascript" },
    ),
  );
  let worker: Worker | null = null;
  let database: AsyncDuckDB | null = null;

  try {
    worker = new Worker(workerUrl);
    database = new duckdb.AsyncDuckDB(
      new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING),
      worker,
    );
    await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return database;
  } catch (error) {
    if (database) {
      try {
        await database.terminate();
      } catch {
        // Keep the initialization error as the actionable failure.
      }
    } else {
      worker?.terminate();
    }
    throw error;
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}

export function getLocalDuckDB(): Promise<AsyncDuckDB> {
  if (!databasePromise) {
    databasePromise = initializeDatabase().catch((error) => {
      databasePromise = null;
      throw error instanceof DuckDBInitializationError
        ? error
        : new DuckDBInitializationError(error);
    });
  }
  return databasePromise;
}

export async function withDuckDBConnection<T>(
  operation: (connection: AsyncDuckDBConnection) => Promise<T>,
) {
  const database = await getLocalDuckDB();
  const connection = await database.connect();
  try {
    return await operation(connection);
  } finally {
    await connection.close();
  }
}

function normalizeQueryValue(value: unknown): DataRow[string] {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") {
    const numberValue = Number(value);
    return Number.isSafeInteger(numberValue) ? numberValue : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    "toJSON" in value &&
    typeof (value as { toJSON?: unknown }).toJSON === "function"
  ) {
    const jsonValue = (value as { toJSON(): unknown }).toJSON();
    if (
      jsonValue === null ||
      typeof jsonValue === "string" ||
      typeof jsonValue === "number" ||
      typeof jsonValue === "boolean"
    ) {
      return jsonValue;
    }
  }
  return String(value);
}

export async function queryDuckDB(
  sql: string,
  connection?: AsyncDuckDBConnection,
): Promise<DataRow[]> {
  const run = async (activeConnection: AsyncDuckDBConnection) => {
    const table = await activeConnection.query(sql);
    const fields = table.schema.fields.map((field) => field.name);
    return table.toArray().map((row) =>
      Object.fromEntries(
        fields.map((field) => [
          field,
          normalizeQueryValue(
            (row as unknown as Record<string, unknown>)[field],
          ),
        ]),
      ),
    );
  };

  return connection ? run(connection) : withDuckDBConnection(run);
}

export async function queryDuckDBPrepared(
  sql: string,
  params: readonly unknown[] = [],
  connection?: AsyncDuckDBConnection,
): Promise<DataRow[]> {
  const run = async (activeConnection: AsyncDuckDBConnection) => {
    const statement = await activeConnection.prepare(sql);
    try {
      const table = await statement.query(...params);
      const fields = table.schema.fields.map((field) => field.name);
      return table.toArray().map((row) =>
        Object.fromEntries(
          fields.map((field) => [
            field,
            normalizeQueryValue(
              (row as unknown as Record<string, unknown>)[field],
            ),
          ]),
        ),
      );
    } finally {
      await statement.close();
    }
  };
  return connection ? run(connection) : withDuckDBConnection(run);
}

export async function executeDuckDB(
  sql: string,
  connection?: AsyncDuckDBConnection,
) {
  if (connection) {
    await connection.query(sql);
    return;
  }
  await withDuckDBConnection(async (activeConnection) => {
    await activeConnection.query(sql);
  });
}

export async function terminateLocalDuckDB() {
  const activePromise = databasePromise;
  databasePromise = null;
  if (activePromise) {
    const database = await activePromise;
    await database.terminate();
  }
}
