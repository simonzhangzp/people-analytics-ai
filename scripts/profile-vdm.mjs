import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { decodePeopleFileBytes } from "../src/lib/data/file-encoding.ts";

const path = process.argv[2];
if (!path) {
  throw new Error("Usage: node scripts/profile-vdm.mjs <csv>");
}

const started = Date.now();
const bytes = readFileSync(path);
const { encoding, text } = decodePeopleFileBytes(bytes);
const header = text.split(/\r?\n/, 1)[0];
let rows = 0;
const employees = new Set();
const months = new Map();
const flags = new Map();

Papa.parse(text, {
  header: true,
  skipEmptyLines: "greedy",
  step: (result) => {
    const row = result.data;
    if (!row || typeof row !== "object") return;
    const values = Object.values(row);
    if (values.every((value) => value === "" || value == null)) return;
    rows += 1;
    const employee = row.employee_number;
    const month = String(row.record_month ?? "").slice(0, 7);
    const flag = row.data_flag;
    if (employee != null && employee !== "") employees.add(String(employee));
    if (month) months.set(month, (months.get(month) ?? 0) + 1);
    if (flag) flags.set(String(flag), (flags.get(flag) ?? 0) + 1);
  },
});

const monthEntries = [...months.entries()].sort(([a], [b]) => a.localeCompare(b));
console.log(
  JSON.stringify(
    {
      file: path.split(/[\\/]/).pop(),
      encoding,
      decodedChars: text.length,
      header,
      rows,
      uniqueEmployees: employees.size,
      months: months.size,
      minMonth: monthEntries[0]?.[0] ?? null,
      maxMonth: monthEntries.at(-1)?.[0] ?? null,
      lastMonths: monthEntries.slice(-3),
      flags: Object.fromEntries(flags),
      elapsedMs: Date.now() - started,
    },
    null,
    2,
  ),
);
