const PREVIOUS_SNAPSHOT = "2025-07-01";
const CURRENT_SNAPSHOT = "2026-01-01";
const PREVIOUS_TERM_DATE = "2025-10-15";
const CURRENT_TERM_DATE = "2026-04-15";

export const DEMO_QUESTION = "Why has Engineering voluntary attrition increased?";

type CsvValue = string | number | boolean;
type CsvRow = Record<string, CsvValue>;

function csvCell(value: CsvValue) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: CsvRow[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(",")),
  ].join("\n");
}

function profileForIndex(index: number, period: "previous" | "current") {
  const tenureBand =
    index < 700 ? "0–2 years" : index < 1_400 ? "2–4 years" : "5+ years";
  const level = index % 5 < 3 ? "L5–L6" : index % 5 === 3 ? "L4" : "L7+";
  const location = index % 3 === 0 ? "Austin" : index % 3 === 1 ? "Raleigh" : "Remote";
  const idBase = period === "previous" ? 0 : 2_000;
  return {
    id: `E${String(idBase + index + 1).padStart(5, "0")}`,
    tenureBand,
    level,
    location,
  };
}

function buildHeadcountRows() {
  const rows: CsvRow[] = [];
  for (const period of ["previous", "current"] as const) {
    const snapshot = period === "previous" ? PREVIOUS_SNAPSHOT : CURRENT_SNAPSHOT;
    for (let index = 0; index < 2_000; index += 1) {
      const profile = profileForIndex(index, period);
      rows.push({
        pers_num: profile.id,
        snap_dt: snapshot,
        org_nm: "Engineering",
        job_lvl: profile.level,
        tenure_band: profile.tenureBand,
        location: profile.location,
        employment_status: "Active",
      });
    }
  }
  return rows;
}

function buildTerminationRows() {
  const rows: CsvRow[] = [];
  const addPeriod = (
    period: "previous" | "current",
    voluntaryCount: number,
    midTenureVoluntary: number,
  ) => {
    const date = period === "previous" ? PREVIOUS_TERM_DATE : CURRENT_TERM_DATE;
    let midTenureAdded = 0;
    let otherAdded = 0;
    let added = 0;
    for (let index = 0; index < 2_000 && added < voluntaryCount; index += 1) {
      const profile = profileForIndex(index, period);
      const isMidTenure = profile.tenureBand === "2–4 years";
      if (isMidTenure && midTenureAdded >= midTenureVoluntary) continue;
      if (!isMidTenure && otherAdded >= voluntaryCount - midTenureVoluntary) continue;
      rows.push({
        pers_num: profile.id,
        term_dt: date,
        term_rsn: "Voluntary resignation",
        exit_classification: "Voluntary",
        org_nm: "Engineering",
        job_lvl:
          period === "current" && rows.length % 5 !== 0 ? "L5–L6" : profile.level,
        tenure_band: profile.tenureBand,
        location: profile.location,
        period,
      });
      if (isMidTenure) midTenureAdded += 1;
      else otherAdded += 1;
      added += 1;
    }

    const retirementCount = period === "previous" ? 12 : 18;
    for (let index = 0; index < retirementCount; index += 1) {
      const profile = profileForIndex(1_500 + index, period);
      rows.push({
        pers_num: profile.id,
        term_dt: date,
        term_rsn: "Retirement",
        exit_classification: "Retirement",
        org_nm: "Engineering",
        job_lvl: profile.level,
        tenure_band: profile.tenureBand,
        location: profile.location,
        period,
      });
    }
  };

  // 184 / 2,000 = 9.2%; 274 / 2,000 = 13.7%; 61 of the 90
  // incremental exits are in the 2–4 year cohort (67.8%, shown as 68%).
  addPeriod("previous", 184, 59);
  addPeriod("current", 274, 120);

  for (let index = 0; index < 28; index += 1) {
    const profile = profileForIndex(1_700 + index, "current");
    rows.push({
      pers_num: profile.id,
      term_dt: CURRENT_TERM_DATE,
      term_rsn: "Position eliminated",
      exit_classification: "Involuntary",
      org_nm: "Engineering",
      job_lvl: profile.level,
      tenure_band: profile.tenureBand,
      location: profile.location,
      period: "current",
    });
  }
  return rows;
}

function buildCompensationRows() {
  const currentVoluntaryIds = new Set(
    buildTerminationRows()
      .filter(
        (row) =>
          row.period === "current" &&
          (row.exit_classification === "Voluntary" ||
            row.exit_classification === "Retirement"),
      )
      .map((row) => String(row.pers_num)),
  );

  const rows: CsvRow[] = [];
  for (let index = 0; index < 2_000; index += 1) {
    const profile = profileForIndex(index, "current");
    const exited = currentVoluntaryIds.has(profile.id);
    const midpoint = profile.level === "L5–L6" ? 150_000 : 132_000;
    const lowerPositioning =
      exited && profile.tenureBand === "2–4 years"
        ? index % 5 !== 0
        : index % 10 === 0;
    const compaRatio = lowerPositioning ? 0.88 + (index % 5) * 0.01 : 0.98 + (index % 7) * 0.01;
    rows.push({
      worker_id: profile.id,
      eff_dt: CURRENT_SNAPSHOT,
      org_nm: "Engineering",
      job_lvl: profile.level,
      tenure_band: profile.tenureBand,
      base_ann: Math.round(midpoint * compaRatio),
      range_midpoint: midpoint,
      compa_ratio: Number(compaRatio.toFixed(2)),
    });
  }
  return rows;
}

export function createWorkbenchDemoFiles() {
  const files = [
    {
      name: "monthly_headcount.csv",
      rows: buildHeadcountRows(),
    },
    {
      name: "terminations.csv",
      rows: buildTerminationRows(),
    },
    {
      name: "compensation.csv",
      rows: buildCompensationRows(),
    },
  ];
  return files.map(
    ({ name, rows }) =>
      new File([toCsv(rows)], name, {
        type: "text/csv;charset=utf-8",
        lastModified: Date.UTC(2026, 7, 27),
      }),
  );
}

export async function loadWorkbenchDemoFiles() {
  const assets = [
    {
      url: "/demo/monthly_headcount.xlsx",
      name: "monthly_headcount.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    { url: "/demo/terminations.csv", name: "terminations.csv", type: "text/csv" },
    {
      url: "/demo/compensation.xlsx",
      name: "compensation.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  ];

  try {
    return await Promise.all(
      assets.map(async (asset) => {
        const response = await fetch(asset.url);
        if (!response.ok) throw new Error(`Could not load ${asset.name}`);
        return new File([await response.blob()], asset.name, {
          type: asset.type,
          lastModified: Date.UTC(2026, 7, 27),
        });
      }),
    );
  } catch {
    // Static hosting or offline development can still demonstrate the vertical
    // slice with the equivalent browser-generated CSV fixtures.
    return createWorkbenchDemoFiles();
  }
}

