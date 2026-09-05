/** Certified metric catalog overlay. people_metric stores YAML numerator/denominator; this fills formula_sql and business copy. */

export type MetricCatalogRow = {
  metric_id: string;
  sensitivity: "internal" | "confidential" | "restricted";
  allow_company_level: boolean;
  kind: "count" | "rate" | "ratio" | "hours" | "days" | "score";
  business_definition: string;
  formula: string;
  formula_sql: string;
  denominator_required: boolean;
};

export const METRIC_CATALOG: Record<string, MetricCatalogRow> = {
  headcount: {
    metric_id: "headcount",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "count",
    business_definition:
      "Certified workers as of month-end. Employment type and status follow BR-WF certified rules.",
    formula: "count of certified worker-month rows as-of",
    formula_sql:
      "select count(*) from people_snap_worker_month where month_end = as_of and is_certified and (job_fam is null or job_family = job_fam)",
    denominator_required: false,
  },
  average_headcount: {
    metric_id: "average_headcount",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "count",
    business_definition: "Mean of month-end certified headcount over the trailing 12 months.",
    formula: "avg(month-end certified headcount)",
    formula_sql:
      "select avg(hc) from (select count(*) as hc from people_snap_worker_month where is_certified and month_end <= as_of and month_end > win_start group by month_end) t",
    denominator_required: false,
  },
  hires: {
    metric_id: "hires",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "count",
    business_definition: "Certified external hires (via_t1, not rehires) in the window.",
    formula: "count(hired_in_month ∧ via_t1 ∧ not is_rehire)",
    formula_sql:
      "select count(*) from people_snap_worker_month where hired_in_month and is_certified and via_t1 and coalesce(is_rehire,false)=false and month_end <= as_of and month_end > win_start",
    denominator_required: false,
  },
  rehires: {
    metric_id: "rehires",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "count",
    business_definition: "Certified rehires in the window.",
    formula: "count(hired_in_month ∧ is_rehire)",
    formula_sql:
      "select count(*) from people_snap_worker_month where hired_in_month and is_certified and is_rehire and month_end <= as_of and month_end > win_start",
    denominator_required: false,
  },
  voluntary_attrition_rate: {
    metric_id: "voluntary_attrition_rate",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "rate",
    business_definition:
      "Voluntary terminations in the trailing 12 months divided by average certified headcount. Month grain is a secondary annualized view.",
    formula: "voluntary_terms / average certified headcount",
    formula_sql:
      "select count(*) filter (where terminated_in_month and termination_category = 'voluntary') * 1.0 / nullif(avg_hc, 0) from people_snap_worker_month where month_end <= as_of and month_end > win_start and (job_fam is null or job_family = job_fam)",
    denominator_required: true,
  },
  involuntary_attrition_rate: {
    metric_id: "involuntary_attrition_rate",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "rate",
    business_definition: "Involuntary terminations in the trailing 12 months divided by average certified headcount.",
    formula: "involuntary_terms / average certified headcount",
    formula_sql:
      "select count(*) filter (where terminated_in_month and termination_category = 'involuntary') * 1.0 / nullif(avg_hc, 0) from people_snap_worker_month where month_end <= as_of and month_end > win_start",
    denominator_required: true,
  },
  regrettable_attrition_rate: {
    metric_id: "regrettable_attrition_rate",
    sensitivity: "confidential",
    allow_company_level: false,
    kind: "rate",
    business_definition: "Regrettable terminations in the trailing 12 months divided by average certified headcount.",
    formula: "regrettable_terms / average certified headcount",
    formula_sql:
      "select count(*) filter (where is_regrettable) * 1.0 / nullif(avg_hc, 0) from people_snap_worker_month where month_end <= as_of and month_end > win_start",
    denominator_required: true,
  },
  promotion_rate: {
    metric_id: "promotion_rate",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "rate",
    business_definition: "Certified promotions in the trailing 12 months divided by average certified headcount.",
    formula: "promotions / average certified headcount",
    formula_sql:
      "select count(*) filter (where promoted_in_month and is_certified) * 1.0 / nullif(avg_hc, 0) from people_snap_worker_month where month_end <= as_of and month_end > win_start",
    denominator_required: true,
  },
  internal_mobility_rate: {
    metric_id: "internal_mobility_rate",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "rate",
    business_definition: "Certified transfers in the trailing 12 months divided by average certified headcount.",
    formula: "transfers / average certified headcount",
    formula_sql:
      "select count(*) filter (where transferred_in_month and is_certified) * 1.0 / nullif(avg_hc, 0) from people_snap_worker_month where month_end <= as_of and month_end > win_start",
    denominator_required: true,
  },
  span_of_control: {
    metric_id: "span_of_control",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "ratio",
    business_definition: "Average direct-report count among certified managers as-of.",
    formula: "avg(direct_report_count) among certified managers",
    formula_sql:
      "select avg(direct_report_count) from people_snap_worker_month where month_end = as_of and is_manager and is_certified",
    denominator_required: true,
  },
  manager_turnover_rate: {
    metric_id: "manager_turnover_rate",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "rate",
    business_definition: "Manager terminations in the trailing 12 months divided by mean certified manager headcount.",
    formula: "manager_terms / mean certified managers",
    formula_sql:
      "select manager_terms * 1.0 / nullif(avg_manager_hc, 0)  -- see people_v2.people_get_metric manager_turnover_rate branch",
    denominator_required: true,
  },
  compa_ratio_median: {
    metric_id: "compa_ratio_median",
    sensitivity: "confidential",
    allow_company_level: false,
    kind: "ratio",
    business_definition:
      "Median of base pay divided by grade-band midpoint among certified workers with a current assignment as-of month-end.",
    formula: "percentile_cont(0.5) of (base / band_mid)",
    formula_sql:
      "select percentile_cont(0.5) within group (order by c.base * 1.0 / nullif(b.band_mid, 0)) from people_snap_worker_month s join people_hist_worker_attr h on h.worker_id = s.worker_id and h.valid_from <= s.month_end and (h.valid_to is null or h.valid_to > s.month_end) join people_fact_comp_assignment_restricted c on c.worker_id = s.worker_id and c.from_date <= s.month_end and (c.to_date is null or c.to_date >= s.month_end) join people_ref_comp_band b on b.grade_id = h.grade_id where s.month_end = as_of and s.is_certified",
    denominator_required: true,
  },
  engagement_score: {
    metric_id: "engagement_score",
    sensitivity: "confidential",
    allow_company_level: false,
    kind: "score",
    business_definition: "Mean survey score_mean on the certified engagement instrument.",
    formula: "avg(score_mean)",
    formula_sql: "select round(avg(score_mean)::numeric, 12) from people_fact_survey_score_restricted",
    denominator_required: false,
  },
  training_hours: {
    metric_id: "training_hours",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "hours",
    business_definition: "Trailing-12m training hours per average certified worker.",
    formula: "sum(training_hours) / average certified headcount",
    formula_sql:
      "select (select coalesce(sum(training_hours),0) from people_mart_learning_monthly where month_start <= as_of and month_start > win_start) * 1.0 / nullif(avg_hc, 0)",
    denominator_required: true,
  },
  skill_coverage: {
    metric_id: "skill_coverage",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "rate",
    business_definition: "Mean job-family skill coverage ratio as-of.",
    formula: "avg(coverage_ratio)",
    formula_sql:
      "select avg(coverage_ratio) from people_mart_skill_coverage_monthly where month_end = as_of",
    denominator_required: true,
  },
  quality_of_hire: {
    metric_id: "quality_of_hire",
    sensitivity: "confidential",
    allow_company_level: false,
    kind: "rate",
    business_definition:
      "Share of via_t1 hires in the closed 12-month retention window who remain certified and have first appraisal ≥ 3.5.",
    formula: "count(still_certified ∧ score≥3.5) / via_t1 hires in (as_of-24m, as_of-12m]",
    formula_sql:
      "select count(*) filter (where s.is_certified and a.final_score >= 3.5) * 1.0 / nullif(count(*), 0) from people_snap_worker_month s left join lateral (select final_score from people_fact_appraisal p where p.worker_id = s.worker_id order by p.submitted_at limit 1) a on true where s.month_end = as_of and s.via_t1 and s.hire_date <= (as_of - interval '12 months') and s.hire_date > (as_of - interval '24 months')",
    denominator_required: true,
  },
  time_to_fill: {
    metric_id: "time_to_fill",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "days",
    business_definition: "Median days from requisition open to close among hires in the window.",
    formula: "median(closed_at - opened_at) where close_reason = hired",
    formula_sql:
      "select percentile_cont(0.5) within group (order by (cast(closed_at as date) - cast(opened_at as date))) from people_dim_requisition where close_reason = 'hired' and closed_at is not null and cast(closed_at as date) <= as_of and cast(closed_at as date) > win_start",
    denominator_required: false,
  },
  time_in_stage: {
    metric_id: "time_in_stage",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "hours",
    business_definition: "Median hours spent in application stages in the window.",
    formula: "median hours (exited_at - entered_at) by canonical_stage",
    formula_sql:
      "select percentile_cont(0.5) within group (order by extract(epoch from (coalesce(exited_at, entered_at) - entered_at)) / 3600.0) from people_evt_application_stage where entered_at is not null and cast(entered_at as date) <= as_of and cast(entered_at as date) > win_start",
    denominator_required: false,
  },
  applications_per_opening: {
    metric_id: "applications_per_opening",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "ratio",
    business_definition: "Applications in the window divided by requisitions opened in the same window.",
    formula: "applications / openings",
    formula_sql:
      "select (select count(*) from people_fact_application where cast(applied_at as date) <= as_of and cast(applied_at as date) > win_start) * 1.0 / nullif((select count(*) from people_dim_requisition where cast(opened_at as date) <= as_of and cast(opened_at as date) > win_start), 0)",
    denominator_required: true,
  },
  offer_acceptance: {
    metric_id: "offer_acceptance",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "rate",
    business_definition: "Accepted offers divided by accepted plus rejected offers in the window.",
    formula: "accepted / (accepted + rejected)",
    formula_sql:
      "select count(*) filter (where status = 'accepted') * 1.0 / nullif(count(*) filter (where status in ('accepted','rejected')), 0) from people_fact_offer where coalesce(cast(resolved_at as date), cast(created_at as date)) <= as_of and coalesce(cast(resolved_at as date), cast(created_at as date)) > win_start",
    denominator_required: true,
  },
  recruiter_load: {
    metric_id: "recruiter_load",
    sensitivity: "internal",
    allow_company_level: true,
    kind: "ratio",
    business_definition: "Average open requisitions per recruiter as-of.",
    formula: "avg(open_requisitions)",
    formula_sql: "select avg(open_requisitions) from people_snap_recruiter_month where month_end = as_of",
    denominator_required: true,
  },
};

const ALIASES: Record<string, string> = {
  training_hours_per_worker: "training_hours",
  time_to_fill_days: "time_to_fill",
  time_in_stage_hours: "time_in_stage",
  offer_acceptance_rate: "offer_acceptance",
  manager_turnover: "manager_turnover_rate",
  manager_turnover_rate: "manager_turnover_rate",
};

export function catalogRow(metricId: string): MetricCatalogRow | undefined {
  return METRIC_CATALOG[metricId] ?? METRIC_CATALOG[ALIASES[metricId] ?? ""];
}

export function metricMinCell(metricId: string): number {
  const id = catalogRow(metricId)?.metric_id ?? metricId;
  if (id === "compa_ratio_median" || id === "quality_of_hire") return 10;
  if (id === "recruiter_load") return 3;
  return 5;
}

export function catalogDenominator(metricId: string): string | null {
  const row = catalogRow(metricId);
  if (!row?.denominator_required) return null;
  const idx = row.formula.indexOf(" / ");
  return idx >= 0 ? row.formula.slice(idx + 3) : "see formula";
}
