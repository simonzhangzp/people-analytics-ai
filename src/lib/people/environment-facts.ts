/**
 * Synthetic GlobalTech · data-v1 environment facts for the homepage overview.
 *
 * Every number below is copied from committed project documentation for the frozen
 * data-v1 snapshot. Do not invent values for visual effect. Sources are cited per row.
 * Certified Headcount, certified metric count and quality-test count are loaded live
 * from serving (see platform-facts.ts) and asserted against PARITY_HEADCOUNT.
 */

import { CERTIFIED_AS_OF, PARITY_HEADCOUNT } from "./parity-home";

export const DATA_WINDOW_START = "2021-09-01";
export const DATA_WINDOW_END = CERTIFIED_AS_OF;

export const SYNTHETIC_DISCLAIMER =
  "Synthetic GlobalTech — not a real company. No customer or employer data.";

export type EnvironmentFact = {
  id: string;
  value: string;
  label: string;
  detail: string;
  /** Where the number comes from. Shown on hover / in the drawer, never as marketing copy. */
  source: string;
  group: "scale" | "shape" | "domains";
};

export const ENVIRONMENT_FACTS: EnvironmentFact[] = [
  {
    id: "headcount",
    value: PARITY_HEADCOUNT.toLocaleString(),
    label: "Certified Headcount",
    detail: `As of ${CERTIFIED_AS_OF}. AMER 22,588 · EMEA 12,913 · APAC 14,322.`,
    source: "docs/PEOPLE_REHEARSAL_1P00.md · people_get_metric_for(headcount)",
    group: "scale",
  },
  {
    id: "window",
    value: "5 yrs",
    label: "Workforce history",
    detail: `${DATA_WINDOW_START} → ${DATA_WINDOW_END}, month-end grain, 59 roll-forward months.`,
    source: "docs/PEOPLE_REHEARSAL_1P00.md",
    group: "scale",
  },
  {
    id: "cumulative",
    value: "~80K",
    label: "Cumulative workers",
    detail: "Worker spells across five years; ~50K active at period end; rehire ~2%.",
    source: "docs/PEOPLE_DATA_ARCHITECTURE.md §人口 · docs/PEOPLE_DATASET_PAGE_COPY.md",
    group: "scale",
  },
  {
    id: "hires",
    value: "10,489",
    label: "Trailing-12m hires",
    detail: "Certified external hires via T1 in the last 12 months (~874 per month).",
    source: "docs/PEOPLE_DATA_V1.md · D4 recruiter_load",
    group: "scale",
  },
  {
    id: "openings",
    value: "55,351",
    label: "Historical openings",
    detail: "Requisitions over five years; cancel rate 9.8%; time-to-fill p50 32 days.",
    source: "docs/PEOPLE_REHEARSAL_1P00.md · 招聘完整性",
    group: "scale",
  },
  {
    id: "training",
    value: "990K",
    label: "Training participation rows",
    detail: "Trailing-12m training_hours_per_worker 20.4 (calibration band 8–60).",
    source: "docs/PEOPLE_DATA_V1.md · D4/D6",
    group: "scale",
  },
  {
    id: "org",
    value: "25 / 150",
    label: "Departments / teams",
    detail: "Simulator baseline org shape; ~120 O*NET-derived designations.",
    source: "data-platform/simulator/scenario/baseline.yaml",
    group: "shape",
  },
  {
    id: "geo",
    value: "3 · 10 · 30",
    label: "Regions · countries · cities",
    detail: "AMER, EMEA, APAC. Location is a certified breakdown dimension.",
    source: "data-platform/simulator/scenario/baseline.yaml",
    group: "shape",
  },
  {
    id: "depth",
    value: "8",
    label: "Max reporting depth",
    detail: "Certified BFS from a single CEO root; 0 orphan managers; span mean 8.5; 11.8% managers.",
    source: "docs/PEOPLE_DATA_V1.md · D5 树完整性",
    group: "shape",
  },
];

/** People data domains present in data-v1 marts. Order is presentation order. */
export const ENVIRONMENT_DOMAINS = [
  "Workforce",
  "Recruiting",
  "Compensation",
  "Performance",
  "Learning",
  "Skills",
  "Engagement",
] as const;
