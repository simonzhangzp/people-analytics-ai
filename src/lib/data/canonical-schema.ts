export interface CanonicalFieldDefinition {
  label: string;
  aliases: string[];
  type: "id" | "string" | "number" | "boolean" | "date";
  pii?: boolean;
}

export const canonicalPeopleFields: Record<string, CanonicalFieldDefinition> = {
  requisition_id: {
    label: "Requisition ID",
    aliases: ["requisition_id", "req_id", "req_num", "job_req_id", "job_requisition_id"],
    type: "id",
  },
  requisition_open_date: {
    label: "Requisition Open Date",
    aliases: [
      "requisition_open_date",
      "req_open_date",
      "req_open_dt",
      "opened_at",
      "requisition_approved_at",
      "approval_date",
      "posted_at",
    ],
    type: "date",
  },
  candidate_id: {
    label: "Candidate ID",
    aliases: ["candidate_id", "cand_id", "cand_num", "applicant_id"],
    type: "id",
  },
  application_id: {
    label: "Application ID",
    aliases: ["application_id", "app_id", "candidate_application_id"],
    type: "id",
  },
  application_date: {
    label: "Application Date",
    aliases: ["application_date", "applied_at", "applied_date", "application_dt"],
    type: "date",
  },
  reviewed_at: {
    label: "Application Reviewed At",
    aliases: ["reviewed_at", "screened_at", "screen_date", "stage_phone_screen_date"],
    type: "date",
  },
  interviewed_at: {
    label: "Interviewed At",
    aliases: [
      "interviewed_at",
      "interview_date",
      "stage_onsite_date",
      "final_interview_at",
    ],
    type: "date",
  },
  offer_extended_at: {
    label: "Offer Extended At",
    aliases: ["offer_extended_at", "offer_date", "stage_offer_date", "offer_created_at"],
    type: "date",
  },
  offer_accepted_at: {
    label: "Offer Accepted At",
    aliases: ["offer_accepted_at", "accepted_offer_date", "offer_accept_date"],
    type: "date",
  },
  hire_date: {
    label: "Hire / Start Date",
    aliases: [
      "hire_date",
      "start_date",
      "employee_start_date",
      "latest_hire_dt",
      "latest_hire_date",
      "orig_hire_dt",
    ],
    type: "date",
  },
  snapshot_month: {
    label: "Snapshot Month",
    aliases: [
      "snapshot_month",
      "record_month",
      "as_of_month",
      "calendar_month",
      "month_end",
      "snap_dt",
    ],
    type: "date",
  },
  workforce_status: {
    label: "Workforce Status Flag",
    aliases: ["data_flag", "workforce_status", "hc_flag", "headcount_flag"],
    type: "string",
  },
  country: {
    label: "Country",
    aliases: ["country", "country_cd", "country_name"],
    type: "string",
  },
  region: {
    label: "Region",
    aliases: ["region", "geo", "theater"],
    type: "string",
  },
  tenure_band: {
    label: "Tenure Band",
    aliases: ["tenure_band", "tenure_group", "los_band"],
    type: "string",
  },
  manager_flag: {
    label: "Manager Flag",
    aliases: ["manager_flag", "is_manager", "mgr_flag"],
    type: "boolean",
  },
  employment_category: {
    label: "Employment Category",
    aliases: ["emp_ctgry_cd", "employment_category", "employee_category"],
    type: "string",
  },
  employment_status: {
    label: "Employment Status",
    aliases: ["employment_status", "emp_status", "worker_type", "assignment_status"],
    type: "string",
  },
  email: {
    label: "Email",
    aliases: ["email", "email_address", "work_email"],
    type: "string",
    pii: true,
  },
  manager_name: {
    label: "Manager Name",
    aliases: ["level3_full_name", "manager_name", "supervisor_name"],
    type: "string",
    pii: true,
  },
  reviewed: {
    label: "Reviewed Flag",
    aliases: ["reviewed", "is_reviewed"],
    type: "boolean",
  },
  interviewed: {
    label: "Interviewed Flag",
    aliases: ["interviewed", "is_interviewed"],
    type: "boolean",
  },
  offer_extended: {
    label: "Offer Extended Flag",
    aliases: ["offer_extended", "is_offer_extended"],
    type: "boolean",
  },
  offer_accepted: {
    label: "Offer Accepted Flag",
    aliases: ["offer_accepted", "is_offer_accepted"],
    type: "boolean",
  },
  hired: {
    label: "Hired Flag",
    aliases: ["hired", "is_hired", "hiring_decision"],
    type: "boolean",
  },
  source: {
    label: "Candidate Source",
    aliases: ["source", "source_name", "candidate_source", "application_source"],
    type: "string",
  },
  job_title: {
    label: "Job Title",
    aliases: [
      "job_title",
      "job",
      "position",
      "position_applied",
      "role_title",
      "tech_designation",
    ],
    type: "string",
  },
  department: {
    label: "Department",
    aliases: [
      "department",
      "org",
      "business_unit",
      "org_unit",
      "function",
      "cc_dept_by_cc",
      "cost_center_dept",
      "org_nm",
    ],
    type: "string",
  },
  location: {
    label: "Location",
    aliases: ["location", "job_location", "office_location", "geography"],
    type: "string",
  },
  seniority_level: {
    label: "Seniority Level",
    aliases: ["seniority_level", "job_level", "level", "grade", "job_lvl"],
    type: "string",
  },
  target_hires: {
    label: "Target Hires",
    aliases: ["target_hires", "planned_hires", "openings"],
    type: "number",
  },
  employee_id: {
    label: "Employee ID",
    aliases: [
      "employee_id",
      "employee_number",
      "employeenumber",
      "pers_num",
      "person_id",
      "worker_id",
    ],
    type: "id",
    pii: true,
  },
  attrition: {
    label: "Attrition",
    aliases: ["attrition", "terminated", "termination_flag"],
    type: "boolean",
  },
  performance_rating: {
    label: "Performance Rating",
    aliases: ["performance_rating", "performancerating", "performance_score"],
    type: "number",
  },
  job_role: {
    label: "Job Role",
    aliases: ["job_role", "jobrole"],
    type: "string",
  },
  years_at_company: {
    label: "Years at Company",
    aliases: ["years_at_company", "yearsatcompany", "tenure_years"],
    type: "number",
  },
  employee_type: {
    label: "Employee Type",
    aliases: ["employee_type", "person_type", "worker_category"],
    type: "string",
  },
  term_date: {
    label: "Termination Date",
    aliases: ["term_date", "termination_date", "term_dt", "termination_dt"],
    type: "date",
  },
  termination_reason: {
    label: "Termination Reason",
    aliases: ["termination_reason", "term_reason", "term_rsn", "exit_reason"],
    type: "string",
  },
  exit_classification: {
    label: "Exit Classification",
    aliases: ["exit_classification", "termination_type", "exit_type", "voluntary_flag"],
    type: "string",
  },
  compensation_effective_date: {
    label: "Compensation Effective Date",
    aliases: ["compensation_effective_date", "effective_date", "eff_dt"],
    type: "date",
  },
  annual_base_salary: {
    label: "Annual Base Salary",
    aliases: ["annual_base_salary"],
    type: "number",
    pii: true,
  },
  salary_midpoint: {
    label: "Salary Range Midpoint",
    aliases: ["salary_midpoint", "range_midpoint", "grade_midpoint"],
    type: "number",
  },
  compa_ratio: {
    label: "Compa Ratio",
    aliases: ["compa_ratio", "compa_ratio_value", "salary_positioning"],
    type: "number",
  },
  manager_id: {
    label: "Manager ID",
    aliases: ["manager_id", "supervisor_id", "line_manager_id"],
    type: "id",
  },
  leadership_area: {
    label: "Leadership Area",
    aliases: ["clt", "country_leadership_team", "leadership_area"],
    type: "string",
  },
  overall_performance: {
    label: "Overall Performance",
    aliases: ["overall_performance", "performance_label", "pm_rating"],
    type: "string",
  },
  placement_code: {
    label: "Placement Code",
    aliases: ["placement_code", "talent_placement", "nine_box", "9_box"],
    type: "string",
  },
  retention_risk: {
    label: "Retention",
    aliases: ["retention", "retention_risk", "retention_rating"],
    type: "string",
  },
  talent_review_status: {
    label: "Talent Review Status",
    aliases: ["talent_review", "talent_review_status", "review_status"],
    type: "string",
  },
  appraisal_status: {
    label: "Appraisal Status",
    aliases: ["appraisal_summary", "appraisal_status", "pm_appraisal_status"],
    type: "string",
  },
  objectives_summary: {
    label: "Objectives Summary",
    aliases: ["objectives_summary", "goals_summary"],
    type: "string",
  },
  competency_summary: {
    label: "Competency Summary",
    aliases: ["competency_summary", "competencies_summary"],
    type: "string",
  },
  appraisal_completed_date: {
    label: "Appraisal Completed Date",
    aliases: ["completed_date", "appraisal_completed_date", "pm_completed_date"],
    type: "date",
  },
  appraisal_id: {
    label: "Appraisal ID",
    aliases: ["appraisal_id", "pm_appraisal_id"],
    type: "id",
  },
  talent_review_comments: {
    label: "Talent Review Comments",
    aliases: ["talent_review_comments", "review_comments"],
    type: "string",
    pii: true,
  },
  main_appraiser: {
    label: "Main Appraiser",
    aliases: ["main_appraiser", "appraiser"],
    type: "string",
    pii: true,
  },
  compass_owner: {
    label: "Compass Owner",
    aliases: ["current_compass_owner", "compass_owner"],
    type: "string",
    pii: true,
  },
};

const directPiiTokens = [
  "name",
  "email",
  "phone",
  "address",
  "socialsecurity",
  "ssn",
  "governmentid",
  "dateofbirth",
  "birthdate",
];

export function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const compact = (value: string) => normalizeHeader(value).replaceAll("_", "");

export function findCanonicalField(sourceField: string) {
  const normalized = normalizeHeader(sourceField);
  const compactSource = compact(sourceField);

  for (const [canonicalField, definition] of Object.entries(canonicalPeopleFields)) {
    const aliases = [canonicalField, ...definition.aliases];
    const exact = aliases.some((alias) => normalizeHeader(alias) === normalized);
    if (exact) {
      return {
        canonicalField,
        label: definition.label,
        confidence: normalizeHeader(canonicalField) === normalized ? 99 : 95,
        likelyPii: Boolean(definition.pii),
        expectedType: definition.type,
      };
    }

    const compactMatch = aliases.some((alias) => compact(alias) === compactSource);
    if (compactMatch) {
      return {
        canonicalField,
        label: definition.label,
        confidence: 92,
        likelyPii: Boolean(definition.pii),
        expectedType: definition.type,
      };
    }
  }

  return null;
}

export function isLikelyPii(sourceField: string) {
  const value = compact(sourceField);
  return directPiiTokens.some((token) => value.includes(token));
}
