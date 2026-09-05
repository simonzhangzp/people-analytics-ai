export function headcountLineageSteps(rows: Record<string, unknown>[]) {
  const named = (id: string) => rows.find((row) => String(row.lineage_id) === id);
  const employee = named("employee_to_hist");
  const extract = named("extract_to_change");
  return [
    {
      label: "Workforce file from HRIS",
      table: String(employee?.from_object ?? "frappe_hr.Employee"),
    },
    {
      label: "Month-end worker history",
      table: String(employee?.to_object ?? "people_hist_worker_attr"),
    },
    {
      label: "Workforce change events",
      table: String(extract?.to_object ?? "people_evt_worker_change"),
    },
    { label: "Certified Headcount", table: "people_get_metric_for(headcount)" },
  ];
}
