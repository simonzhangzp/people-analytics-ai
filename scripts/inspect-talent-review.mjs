import { readFileSync } from "node:fs";
import readXlsxFile, { readSheet } from "read-excel-file/node";

const path = "d:/Work Material/Red Hat/RH_PM_Talent_Review_Report_040419_FY19.xlsx";
const bytes = readFileSync(path);

function isPiiHeader(header) {
  const hay = header.toLowerCase();
  return /name|email|mail|phone|ssn|address|manager/.test(hay);
}

function typeOf(value) {
  if (value instanceof Date) return "date";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value == null || value === "") return "empty";
  return "string";
}

const sheets = await readXlsxFile(bytes);
console.log("sheetCount", sheets.length);
for (const [index, sheet] of sheets.entries()) {
  const name = sheet.name ?? `Sheet${index + 1}`;
  const data = sheet.data ?? sheet;
  const rows = Array.isArray(data) ? data : [];
  console.log("\n===", name, "rows", rows.length, "===");
  if (rows.length === 0) continue;
  const headers = (rows[0] ?? []).map((value, col) => String(value ?? "").trim() || `Column_${col + 1}`);
  console.log("headers", headers);
  const body = rows.slice(1);
  for (const [col, header] of headers.entries()) {
    const values = body.map((row) => row?.[col]);
    const types = new Map();
    let filled = 0;
    const uniques = new Set();
    for (const value of values) {
      const t = typeOf(value);
      types.set(t, (types.get(t) ?? 0) + 1);
      if (t !== "empty") {
        filled += 1;
        uniques.add(String(value));
      }
    }
    const sample = isPiiHeader(header)
      ? "[redacted]"
      : values.find((value) => value != null && value !== "") ?? null;
    console.log({
      header,
      filled,
      fillPct: body.length ? Math.round((filled / body.length) * 100) : 0,
      unique: uniques.size,
      types: Object.fromEntries(types),
      sample: sample instanceof Date ? sample.toISOString() : sample,
    });
  }
}
