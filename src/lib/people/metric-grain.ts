/** Page-number grain. Definition popovers must use the same strings as the hero figure. */

export const RECRUITING_DQ_TESTS = new Set([
  "snap_recruiter_id_subseteq_dim_recruiter",
  "dim_recruiter_covers_opening_recruiters",
]);

export const HEADCOUNT_WINDOW = "month (as-of)";
export const VOL_T12M_WINDOW = "trailing-12m (annualized)";
export const VOL_MONTH_WINDOW = "month (annualized)";

export function grainFields(input: {
  metricId: string;
  scope: string;
  window: string;
  asOf: string;
  annualized: boolean;
}) {
  return {
    metric_id: input.metricId,
    scope: input.scope,
    window: input.window,
    as_of: input.asOf,
    asOf: input.asOf,
    annualized: input.annualized,
    time_logic: input.window,
  };
}
