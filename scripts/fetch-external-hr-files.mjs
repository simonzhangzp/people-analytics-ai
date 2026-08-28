import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "tests", "external-data", "manifest.json");
const args = new Set(process.argv.slice(2));
const refresh = args.has("--refresh");
const verifyOnly = args.has("--verify-only");
const updateHashes = args.has("--update-hashes");
const MAX_DOWNLOAD_BYTES = 150 * 1024 * 1024;

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const cacheDirectory = path.join(root, manifest.cacheDirectory);
const resultsPath = path.join(
  root,
  "tests",
  "external-data",
  "results.local.json",
);
await mkdir(cacheDirectory, { recursive: true });

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateSignature(entry, bytes) {
  const zip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;
  if (entry.format === "xlsx" && !zip) {
    throw new Error(`${entry.id}: expected XLSX/ZIP bytes`);
  }
  if (entry.format === "csv" && zip) {
    throw new Error(`${entry.id}: expected CSV text but received ZIP bytes`);
  }
  if (entry.format === "csv" && bytes.includes(0)) {
    throw new Error(`${entry.id}: CSV contains null bytes`);
  }
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent": "PeopleAnalyticsAI external-schema validation/1.0",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_DOWNLOAD_BYTES) {
        throw new Error(
          `download is ${contentLength} bytes; limit is ${MAX_DOWNLOAD_BYTES}`,
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0) throw new Error("download is empty");
      if (bytes.length > MAX_DOWNLOAD_BYTES) {
        throw new Error(
          `download is ${bytes.length} bytes; limit is ${MAX_DOWNLOAD_BYTES}`,
        );
      }
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      }
    }
  }
  throw lastError;
}

function extractArchiveMember(entry, archiveBytes) {
  const files = unzipSync(archiveBytes);
  const requested = entry.archiveMember.toLocaleLowerCase();
  const match = Object.entries(files).find(([name]) => {
    const normalized = name.replaceAll("\\", "/").toLocaleLowerCase();
    return normalized === requested || normalized.endsWith(`/${requested}`);
  });
  if (!match) {
    throw new Error(
      `${entry.id}: archive member ${entry.archiveMember} was not found; members: ${Object.keys(
        files,
      )
        .slice(0, 10)
        .join(", ")}`,
    );
  }
  return match[1];
}

async function cachedBytes(entry) {
  const destination = path.join(cacheDirectory, entry.fileName);
  if (!refresh) {
    try {
      return {
        destination,
        bytes: new Uint8Array(await readFile(destination)),
        source: "cache",
      };
    } catch {
      if (verifyOnly) {
        throw new Error(
          `${entry.id}: cache is missing; run npm run external:fetch first`,
        );
      }
    }
  }
  if (verifyOnly) {
    throw new Error(`${entry.id}: refresh and verify-only cannot be combined`);
  }
  const downloaded = await fetchWithRetry(entry.url);
  const bytes = entry.archiveMember
    ? extractArchiveMember(entry, downloaded)
    : downloaded;
  validateSignature(entry, bytes);
  const temporary = `${destination}.partial`;
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  return { destination, bytes, source: "network" };
}

async function processEntry(entry) {
  const { destination, bytes, source } = await cachedBytes(entry);
  validateSignature(entry, bytes);
  const digest = sha256(bytes);
  if (entry.sha256 && digest !== entry.sha256) {
    throw new Error(
      `${entry.id}: SHA-256 mismatch; expected ${entry.sha256}, received ${digest}`,
    );
  }
  const fileStat = await stat(destination);
  return {
    id: entry.id,
    fileName: entry.fileName,
    domain: entry.domain,
    source,
    bytes: fileStat.size,
    sha256: digest,
    path: path.relative(root, destination).replaceAll("\\", "/"),
  };
}

const results = [];
for (const entry of manifest.files) {
  const result = await processEntry(entry);
  results.push(result);
  console.log(
    `${result.id}: ${result.source} ${result.bytes} bytes sha256=${result.sha256}`,
  );
}

if (updateHashes) {
  const hashes = new Map(results.map((result) => [result.id, result.sha256]));
  for (const entry of manifest.files) entry.sha256 = hashes.get(entry.id);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

await writeFile(
  resultsPath,
  `${JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      files: results,
    },
    null,
    2,
  )}\n`,
);
console.log(`Verified ${results.length} external HR files.`);
