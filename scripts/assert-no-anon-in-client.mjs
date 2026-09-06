import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const STATIC = path.join(ROOT, ".next", "static");
const FORBIDDEN = [/SUPABASE_ANON/i, /supabase\.co/i, /NEXT_PUBLIC_SUPABASE/i];

function walk(dir, files = []) {
  if (!statSync(dir, { throwIfNoEntry: false })) return files;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

if (!statSync(STATIC, { throwIfNoEntry: false })) {
  console.error("assert-no-anon-in-client: missing .next/static");
  process.exit(1);
}

const hits = [];
for (const file of walk(STATIC)) {
  if (!/\.(js|css|map)$/i.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const re of FORBIDDEN) {
    if (re.test(text)) {
      hits.push(`${path.relative(ROOT, file)} :: ${re}`);
    }
  }
}

const out = {
  scanned: STATIC,
  hits,
  ok: hits.length === 0,
};
console.log(JSON.stringify(out, null, 2));
if (hits.length) process.exit(1);
