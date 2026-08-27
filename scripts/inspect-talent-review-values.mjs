import { readFileSync } from "node:fs";
import readXlsxFile from "read-excel-file/node";

const path = "d:/Work Material/Red Hat/RH_PM_Talent_Review_Report_040419_FY19.xlsx";
const sheets = await readXlsxFile(readFileSync(path));
const rows = sheets[0].data ?? sheets[0];
const fieldNames = rows[1];
const body = rows.slice(2);
const wanted = [
  "Employee Type",
  "Assignment Status",
  "CLT",
  "Overall Performance",
  "Placement Code",
  "Retention",
  "Talent Review",
  "Appraisal Summary",
  "Objectives Summary",
  "Competency Summary",
];

for (const name of wanted) {
  const index = fieldNames.findIndex((value) => String(value).trim() === name);
  const counts = new Map();
  for (const row of body) {
    const raw = row?.[index];
    const key = raw == null || raw === "" ? "(blank)" : String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log("\n", name, "col", index, "n", body.length);
  for (const [key, count] of top) console.log(" ", count, key);
}
