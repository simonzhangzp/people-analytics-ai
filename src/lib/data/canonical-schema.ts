import type { SemanticRole } from "@/types/semantics";

export interface CanonicalFieldDefinition {
  label: string;
  aliases: string[];
  type: "id" | "string" | "number" | "boolean" | "date";
  pii?: boolean;
  sensitive?: boolean;
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
    pii: true,
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
      "tenure_date",
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
      "report_effective_date",
      "effective_as_of_date",
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
    aliases: [
      "country",
      "country_cd",
      "country_name",
      "country_nm",
      "国家",
      "所在国家",
    ],
    type: "string",
  },
  nationality: {
    label: "Nationality",
    aliases: ["nationality", "citizenship", "国籍"],
    type: "string",
    sensitive: true,
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
      "岗位",
      "管理职位",
      "专业职位",
    ],
    type: "string",
  },
  department: {
    label: "Department",
    aliases: [
      "department",
      "department_e",
      "department_f",
      "department_etext",
      "department_ftext",
      "org",
      "business_unit",
      "org_unit",
      "function",
      "cc_dept_by_cc",
      "cost_center_dept",
      "org_nm",
      "dept_finance",
      "finance_dept",
      "组织单元",
      "工作部门",
      "所属部门",
      "部门",
    ],
    type: "string",
  },
  location: {
    label: "Location",
    aliases: [
      "location",
      "job_location",
      "office_location",
      "geography",
      "location_people",
      "people_location",
      "工作地点",
      "办公地点",
      "城市",
    ],
    type: "string",
  },
  seniority_level: {
    label: "Seniority Level",
    aliases: [
      "seniority_level",
      "job_level",
      "level",
      "grade",
      "job_lvl",
      "管理级别",
      "管理职级",
      "专业职级",
      "专业子等",
    ],
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
      "emp_id",
      "staff_id",
    ],
    type: "id",
    pii: true,
  },
  employee_name: {
    label: "Employee Name",
    aliases: [
      "employee_name",
      "employee_full_name",
      "person_name",
      "英文名",
      "中文名",
      "英文名_中文名",
      "英文名(中文名)",
      "姓名",
      "员工姓名",
    ],
    type: "string",
    pii: true,
  },
  contact_handle: {
    label: "Personal Contact Handle",
    aliases: ["qq", "qq_number", "qq号码", "wechat", "微信号"],
    type: "string",
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
    aliases: [
      "job_role",
      "jobrole",
      "job_function",
      "function_name",
      "岗位属性",
      "发展通道",
    ],
    type: "string",
  },
  cost_center: {
    label: "Cost Center",
    aliases: ["cost_center", "costcentre", "cost_centre", "cc"],
    type: "string",
  },
  years_at_company: {
    label: "Years at Company",
    aliases: ["years_at_company", "yearsatcompany", "tenure_years", "tenure"],
    type: "number",
  },
  employee_type: {
    label: "Employee Type",
    aliases: [
      "employee_type",
      "person_type",
      "worker_category",
      "员工类别",
      "用工类型",
      "人员类别",
    ],
    type: "string",
  },
  term_date: {
    label: "Termination Date",
    aliases: [
      "term_date",
      "termination_date",
      "term_dt",
      "termination_dt",
      "action_date",
    ],
    type: "date",
  },
  termination_reason: {
    label: "Termination Reason",
    aliases: ["termination_reason", "term_reason", "term_rsn", "exit_reason"],
    type: "string",
  },
  exit_classification: {
    label: "Exit Classification",
    aliases: [
      "exit_classification",
      "termination_type",
      "exit_type",
      "voluntary_flag",
      "voluntary_involuntary",
    ],
    type: "string",
  },
  compensation_effective_date: {
    label: "Compensation Effective Date",
    aliases: ["compensation_effective_date", "effective_date", "eff_dt"],
    type: "date",
  },
  annual_base_salary: {
    label: "Annual Base Salary",
    aliases: [
      "annual_base_salary",
      "base_salary",
      "base_comp",
      "base_compensation",
      "monthly_income",
    ],
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
    pii: true,
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
  requisition_status: {
    label: "Requisition Status",
    aliases: ["requisition_status", "req_status", "advertisement_status", "job_status"],
    type: "string",
  },
  applications_count: {
    label: "Applications",
    aliases: [
      "applications",
      "application_count",
      "applications_count",
      "number_of_applications",
      "total_applications",
      "appl_sumbitted_sum",
      "qtr_appl_sumbitted_sum",
      "applications_submitted_sum",
    ],
    type: "number",
  },
  advertisements_count: {
    label: "Advertisements",
    aliases: [
      "advertisements",
      "advertisement_count",
      "staffing_advertisements",
      "number_of_advertisements",
      "postings",
    ],
    type: "number",
  },
  staffing_days: {
    label: "Staffing Duration",
    aliases: [
      "days_to_staff",
      "staffing_days",
      "time_to_fill",
      "average_days_to_staff",
      "median_days_to_fill",
    ],
    type: "number",
  },
  report_period: {
    label: "Report Period",
    aliases: [
      "period",
      "report_period",
      "reporting_period",
      "month",
      "year",
      "fiscal_year",
      "quarter",
      "wave",
    ],
    type: "string",
  },
  employee_count: {
    label: "Employee Count",
    aliases: [
      "employee_count",
      "employees",
      "headcount",
      "staff_count",
      "population_count",
      "number_of_employees",
    ],
    type: "number",
  },
  record_count: {
    label: "Reported Count",
    aliases: ["count", "record_count", "reported_count", "qtr_count"],
    type: "number",
  },
  salary_range_min: {
    label: "Salary Range Minimum",
    aliases: ["salary_range_min", "range_minimum", "salary_min", "minimum_salary"],
    type: "number",
  },
  salary_range_max: {
    label: "Salary Range Maximum",
    aliases: ["salary_range_max", "range_maximum", "salary_max", "maximum_salary"],
    type: "number",
  },
  pay_gap_mean_pct: {
    label: "Mean Hourly Pay Gap",
    aliases: ["diff_mean_hourly_percent", "mean_hourly_pay_gap", "mean_pay_gap_percent"],
    type: "number",
  },
  pay_gap_median_pct: {
    label: "Median Hourly Pay Gap",
    aliases: [
      "diff_median_hourly_percent",
      "median_hourly_pay_gap",
      "median_pay_gap_percent",
    ],
    type: "number",
  },
  gender: {
    label: "Gender",
    aliases: ["gender", "sex", "gender_identity", "性别"],
    type: "string",
    sensitive: true,
  },
  ethnicity: {
    label: "Ethnicity",
    aliases: ["ethnicity", "race", "ethnic_group", "racialized_group"],
    type: "string",
    sensitive: true,
  },
  education_level: {
    label: "Education Level",
    aliases: [
      "education_level",
      "highest_education",
      "highest_degree",
      "最高学历",
      "学历",
      "教育经历_学历",
    ],
    type: "string",
  },
  academic_degree: {
    label: "Academic Degree",
    aliases: ["academic_degree", "degree", "学位", "教育经历_学位"],
    type: "string",
  },
  school: {
    label: "School",
    aliases: [
      "school",
      "university",
      "alma_mater",
      "毕业院校",
      "教育经历_学校名称",
    ],
    type: "string",
  },
  major: {
    label: "Major",
    aliases: ["major", "specialization", "专业", "教育经历_专业"],
    type: "string",
  },
  demographic_category: {
    label: "Demographic Category",
    aliases: [
      "demographic_category",
      "designated_group",
      "employment_equity_group",
      "population_group",
      "self_identification_group",
      "ee_e",
      "ee_f",
      "ee_etext",
      "ee_ftext",
    ],
    type: "string",
    sensitive: true,
  },
  absence_date: {
    label: "Absence Date",
    aliases: ["absence_date", "absence_month", "sickness_date", "leave_date"],
    type: "date",
  },
  absence_hours: {
    label: "Absence Hours",
    aliases: ["absence_hours", "hours_absent", "sickness_hours", "lost_hours"],
    type: "number",
  },
  absence_rate: {
    label: "Absence Rate",
    aliases: [
      "absence_rate",
      "absence_fte_percent",
      "absence_fte",
      "sickness_absence_rate",
      "sickness_rate",
    ],
    type: "number",
  },
  survey_wave: {
    label: "Survey Wave",
    aliases: ["survey_wave", "engagement_wave", "survey_period", "pulse"],
    type: "string",
  },
  engagement_score: {
    label: "Engagement Score",
    aliases: [
      "engagement_score",
      "engagement_index",
      "survey_score",
      "favorable_score",
      "favourable_score",
    ],
    type: "number",
  },
  course_id: {
    label: "Course ID",
    aliases: ["course_id", "training_id", "learning_id", "module_id"],
    type: "id",
  },
  course_name: {
    label: "Course Name",
    aliases: ["course_name", "training_name", "learning_activity", "module_name", "course"],
    type: "string",
  },
  learning_completed_at: {
    label: "Learning Completion Date",
    aliases: [
      "learning_completed_at",
      "completion_date",
      "training_completion_date",
      "date_completed",
    ],
    type: "date",
  },
  learning_status: {
    label: "Learning Status",
    aliases: ["learning_status", "completion_status", "training_status", "course_status"],
    type: "string",
  },
  learning_score: {
    label: "Learning Score",
    aliases: ["learning_score", "training_score", "course_score", "assessment_score", "score"],
    type: "number",
  },
  pass_flag: {
    label: "Pass Flag",
    aliases: ["pass_flag", "passed", "is_passed", "result"],
    type: "boolean",
  },
  job_change_date: {
    label: "Job Change Date",
    aliases: [
      "job_change_date",
      "movement_date",
      "mobility_date",
      "promotion_effective_date",
      "effective_date_of_change",
    ],
    type: "date",
  },
  move_type: {
    label: "Movement Type",
    aliases: [
      "move_type",
      "movement_type",
      "mobility_type",
      "job_change_type",
      "appointment_type",
      "mob_type_e",
      "mob_type_f",
      "mob_type_etext",
      "mob_type_ftext",
    ],
    type: "string",
  },
  movement_count: {
    label: "Movement Count",
    aliases: [
      "movement_count",
      "mobility_count",
      "promotions",
      "appointments",
      "number_of_movements",
    ],
    type: "number",
  },
};

const strongPiiTokens = [
  "email",
  "phone",
  "mobile",
  "socialsecurity",
  "governmentid",
  "nationalid",
  "passport",
  "dateofbirth",
  "birthdate",
];

const exactPiiHeaders = new Set([
  "name",
  "first_name",
  "last_name",
  "full_name",
  "employee_name",
  "candidate_name",
  "applicant_name",
  "person_name",
  "responsible_person",
  "contact_name",
  "address",
  "street_address",
  "home_address",
  "mailing_address",
  "ssn",
  "dob",
  "post_code",
  "postcode",
  "zip",
  "zip_code",
]);

const personNameQualifiers = new Set([
  "first",
  "last",
  "full",
  "employee",
  "candidate",
  "applicant",
  "person",
  "manager",
  "supervisor",
  "contact",
  "responsible",
]);

export function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

const compact = (value: string) => normalizeHeader(value).replaceAll("_", "");

export function semanticRoleForCanonicalField(
  canonicalField: string | undefined,
  definition?: CanonicalFieldDefinition,
): SemanticRole | undefined {
  if (!canonicalField) return undefined;
  if (definition?.pii) return "pii";
  if (definition?.sensitive) return "sensitive_dimension";
  if (canonicalField === "employee_id" || canonicalField === "candidate_id") {
    return "person_id";
  }
  if (
    canonicalField.endsWith("_id") ||
    canonicalField === "appraisal_id"
  ) {
    return canonicalField.includes("application") ||
      canonicalField.includes("requisition") ||
      canonicalField.includes("course")
      ? "entity_id"
      : "event_id";
  }
  if (
    canonicalField === "report_period" ||
    canonicalField === "survey_wave"
  ) {
    return "period";
  }
  if (canonicalField === "snapshot_month") return "as_of_date";
  if (
    canonicalField.endsWith("_date") ||
    canonicalField.endsWith("_at")
  ) {
    return "event_date";
  }
  if (
    canonicalField.endsWith("_status") ||
    canonicalField === "attrition" ||
    canonicalField.endsWith("_flag")
  ) {
    return "status";
  }
  if (
    canonicalField.endsWith("_count") ||
    canonicalField === "applications_count" ||
    canonicalField === "advertisements_count" ||
    canonicalField === "movement_count"
  ) {
    return "measure";
  }
  if (
    canonicalField.includes("salary") ||
    canonicalField.includes("compensation")
  ) {
    return "amount";
  }
  if (
    canonicalField.includes("rating") ||
    canonicalField.includes("score")
  ) {
    return "rating";
  }
  if (
    canonicalField.includes("rate") ||
    canonicalField.includes("ratio") ||
    canonicalField.includes("gap") ||
    canonicalField.includes("hours") ||
    canonicalField.includes("days")
  ) {
    return "measure";
  }
  return "category";
}

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
        sensitive: Boolean(definition.sensitive),
        semanticRole: semanticRoleForCanonicalField(canonicalField, definition),
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
        sensitive: Boolean(definition.sensitive),
        semanticRole: semanticRoleForCanonicalField(canonicalField, definition),
        expectedType: definition.type,
      };
    }
  }

  return null;
}

export function isLikelyPii(sourceField: string) {
  if (
    /姓名|名字|英文名|中文名|qq|微信|手机号|手机号码|电话号码|电话|邮箱|身份证|护照|住址|家庭地址|通信地址/i.test(
      sourceField,
    )
  ) {
    return true;
  }
  const normalized = normalizeHeader(sourceField);
  if (exactPiiHeaders.has(normalized)) return true;
  const value = compact(sourceField);
  if (strongPiiTokens.some((token) => value.includes(token))) return true;
  const segments = normalized.split("_");
  if (segments.includes("address")) return true;
  return (
    segments.includes("name") &&
    segments.some((segment) => personNameQualifiers.has(segment))
  );
}
