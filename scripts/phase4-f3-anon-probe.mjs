import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const envPath = path.resolve(".env.production.local");
const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 1) continue;
  let value = trimmed.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[trimmed.slice(0, eq)] = value;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const host = hostOf(supabaseUrl);
const ref = host?.split(".")[0] ?? null;
const stagingRef = "kgxbomcmgkwlmzyevqjw";
const peopleRef = "zapmigfrtnwnkmezjefx";
const prodRef = "fyvivwgyisrtmehzjqlv";

const tables = [
  "people_mart_workforce_overview",
  "people_snap_worker_month",
  "people_dim_worker",
  "people_serving_run",
  "people_serving_snapshot",
  "people_agent_trace",
  "people_ai_usage",
  "people_workspaces",
  "people_datasets",
  "people_metric_definition",
  "workspaces",
  "datasets",
  "panorama_daily",
  "metric_definitions",
];

const rows = [];
if (!supabaseUrl || !anon || anon === "[SENSITIVE]") {
  rows.push({ error: "anon_or_url_missing_from_env_pull" });
} else {
  for (const table of tables) {
    const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${table}?select=*&limit=1`;
    const response = await fetch(url, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        Accept: "application/json",
      },
    });
    const text = await response.text();
    rows.push({
      table,
      status: response.status,
      leaked_rows: response.ok && text.trim().startsWith("["),
      pgrst: /PGRST\d+/.test(text) ? (text.match(/PGRST\d+/) || [null])[0] : null,
      empty_array: text.trim() === "[]",
    });
  }
}

const out = {
  supabase_host: host,
  project_ref: ref,
  is_staging_ref: ref === stagingRef,
  is_people_ref: ref === peopleRef,
  is_quantreview_prod_ref: ref === prodRef,
  anon_key_present: Boolean(anon) && anon !== "[SENSITIVE]",
  deepseek_model_pulled: env.DEEPSEEK_MODEL && env.DEEPSEEK_MODEL !== "[SENSITIVE]",
  deepseek_base_pulled: env.DEEPSEEK_BASE_URL && env.DEEPSEEK_BASE_URL !== "[SENSITIVE]",
  deepseek_key_pulled: env.DEEPSEEK_API_KEY && env.DEEPSEEK_API_KEY !== "[SENSITIVE]",
  cron_secret_pulled: env.CRON_SECRET && env.CRON_SECRET !== "[SENSITIVE]",
  rest: rows,
};

writeFileSync("docs/phase4/phase4_f3_anon_probe.json", `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({
  supabase_host: out.supabase_host,
  project_ref: out.project_ref,
  is_staging_ref: out.is_staging_ref,
  rest: out.rest.map((row) => ({ table: row.table, status: row.status, leaked_rows: row.leaked_rows })),
}, null, 2));
