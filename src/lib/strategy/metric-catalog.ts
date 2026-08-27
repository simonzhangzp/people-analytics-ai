import { classifyCustomStatement } from "@/lib/strategy/analyze-brief";
import { metricTemplates } from "@/lib/strategy/metric-templates";
import type { Confidence } from "@/types/domain";
import type {
  CustomMetricDraft,
  MetricCatalogItem,
  MetricProposal,
  MetricRole,
  StrategyBrief,
  StrategyCategory,
} from "@/types/strategy";

const ISO = {
  source: "ISO 30414 human capital reporting",
  sourceUrl: "https://www.iso.org/standard/69338.html",
};
const SHRM = {
  source: "SHRM people-metric practice",
  sourceUrl: "https://www.shrm.org/",
};
const CIPD = {
  source: "CIPD people analytics and workforce practice",
  sourceUrl: "https://www.cipd.org/en/knowledge/factsheets/people-analytics-factsheet/",
};
const GARTNER = {
  source: "Gartner CHRO / HR operating priorities",
  sourceUrl: "https://www.gartner.com/en/human-resources/trends/top-priorities-for-hr-leaders",
};
const GALLUP = {
  source: "Gallup workplace research practice",
  sourceUrl: "https://www.gallup.com/workplace/",
};
const LINKEDIN = {
  source: "LinkedIn Talent and Workplace Learning practice",
  sourceUrl: "https://www.linkedin.com/business/talent/blog",
};
const DELOITTE = {
  source: "Deloitte workforce planning insights",
  sourceUrl:
    "https://www.deloitte.com/us/en/insights/topics/talent/future-of-workforce-planning/reinventing-workforce-planning.html",
};

const existingDomain: Record<string, StrategyCategory> = {
  time_to_fill: "Talent Acquisition",
  time_to_hire: "Talent Acquisition",
  quality_of_hire: "Talent Acquisition",
  offer_acceptance: "Talent Acquisition",
  candidate_satisfaction: "Talent Acquisition",
  cost_per_hire: "Talent Acquisition",
  source_effectiveness: "Talent Acquisition",
  requisition_aging: "Talent Acquisition",
  time_to_first_qualified: "Talent Acquisition",
  interview_scheduling: "Talent Acquisition",
  offer_approval: "Talent Acquisition",
  hiring_manager_satisfaction: "Talent Acquisition",
  first_year_attrition: "Retention",
  regrettable_attrition: "Retention",
  overall_attrition: "Retention",
  retention_critical: "Retention",
  high_performer_retention: "Retention",
  enps: "Engagement & Culture",
  engagement_index: "Engagement & Culture",
  change_adoption: "Engagement & Culture",
  manager_effectiveness: "Leadership",
  bench_strength: "Leadership",
  succession_readiness: "Leadership",
  span_of_control: "Leadership",
  internal_fill: "Internal Mobility",
  internal_mobility: "Internal Mobility",
  promotion_rate: "Internal Mobility",
  time_to_productivity: "Skills & Capability",
  skills_coverage: "Skills & Capability",
  critical_skill_gap: "Skills & Capability",
  learning_hours: "Skills & Capability",
  ai_adoption: "Skills & Capability",
  pay_equity: "Compensation",
  compa_ratio: "Compensation",
  representation: "DEI",
  inclusion_index: "DEI",
  headcount_vs_plan: "Workforce Planning",
  contractor_ratio: "Workforce Planning",
  workforce_cost: "Workforce Planning",
  absence_rate: "Wellbeing",
  wellbeing_index: "Wellbeing",
  overtime_rate: "Wellbeing",
  process_cycle_time: "People Operations",
  data_completeness: "People Operations",
};

const existingSource: Record<string, { source: string; sourceUrl: string }> = {
  time_to_fill: ISO,
  time_to_hire: CIPD,
  quality_of_hire: ISO,
  offer_acceptance: LINKEDIN,
  candidate_satisfaction: LINKEDIN,
  cost_per_hire: CIPD,
  source_effectiveness: CIPD,
  requisition_aging: SHRM,
  time_to_first_qualified: LINKEDIN,
  interview_scheduling: CIPD,
  offer_approval: LINKEDIN,
  hiring_manager_satisfaction: SHRM,
  first_year_attrition: CIPD,
  regrettable_attrition: CIPD,
  overall_attrition: ISO,
  retention_critical: DELOITTE,
  high_performer_retention: CIPD,
  enps: GALLUP,
  engagement_index: GALLUP,
  change_adoption: GARTNER,
  manager_effectiveness: SHRM,
  bench_strength: CIPD,
  succession_readiness: CIPD,
  span_of_control: DELOITTE,
  internal_fill: DELOITTE,
  internal_mobility: DELOITTE,
  promotion_rate: ISO,
  time_to_productivity: SHRM,
  skills_coverage: DELOITTE,
  critical_skill_gap: DELOITTE,
  learning_hours: LINKEDIN,
  ai_adoption: GARTNER,
  pay_equity: ISO,
  compa_ratio: CIPD,
  representation: SHRM,
  inclusion_index: GALLUP,
  headcount_vs_plan: ISO,
  contractor_ratio: DELOITTE,
  workforce_cost: DELOITTE,
  absence_rate: CIPD,
  wellbeing_index: CIPD,
  overtime_rate: CIPD,
  process_cycle_time: GARTNER,
  data_completeness: ISO,
};

function extra(
  id: string,
  name: string,
  domain: StrategyCategory,
  category: MetricRole,
  definition: string,
  measurementStandard: string,
  formula: string,
  unit: string,
  requiredFields: string[],
  suggestedTarget: string,
  confidence: Confidence,
  cite: { source: string; sourceUrl: string },
): MetricCatalogItem {
  return {
    id,
    name,
    domain,
    category,
    definition,
    measurementStandard,
    formula,
    unit,
    requiredFields,
    suggestedTarget,
    confidence,
    ...cite,
  };
}

const fromTemplates: MetricCatalogItem[] = Object.values(metricTemplates).map((template) => ({
  ...template,
  domain: existingDomain[template.id] ?? "People Operations",
  ...(existingSource[template.id] ?? ISO),
}));

const additional: MetricCatalogItem[] = [
  extra("application_volume", "Application Volume", "Talent Acquisition", "Driver", "Count of completed applications in the period.", "Count unique applications, not page views. Deduplicate by candidate × requisition.", "count(applications)", "count", ["application_id", "application_date"], "Context-specific; watch sudden drops", "High", LINKEDIN),
  extra("apply_to_screen", "Apply-to-Screen Rate", "Talent Acquisition", "Driver", "Share of applications that reach a documented screen.", "Use the approved screened event. Bots and incomplete applies excluded.", "screened ÷ applications", "%", ["application_date", "reviewed_at"], "Meet the approved funnel standard", "High", CIPD),
  extra("screen_to_interview", "Screen-to-Interview Rate", "Talent Acquisition", "Driver", "Share of screened candidates who reach a scheduled interview.", "Completed screens only. Canceled loops excluded.", "interviewed ÷ screened", "%", ["reviewed_at", "interviewed_at"], "Meet the approved funnel standard", "High", CIPD),
  extra("interview_to_offer", "Interview-to-Offer Rate", "Talent Acquisition", "Driver", "Share of interviewed candidates who receive an offer.", "Count unique candidates per requisition.", "offers ÷ interviewed", "%", ["interviewed_at", "offer_extended_at"], "Context-specific; investigate sudden drops", "High", LINKEDIN),
  extra("offer_to_start", "Offer-to-Start Time", "Talent Acquisition", "Driver", "Days from accepted offer to start date.", "Completed starts only. Delayed starts stay in the sample.", "start_date − offer_accepted_at", "days", ["offer_accepted_at", "hire_date"], "≤ 30 days unless role-specific", "High", SHRM),
  extra("time_to_source", "Time to Source", "Talent Acquisition", "Driver", "Days from requisition open to first sourced candidate in process.", "Requires a sourced event. Inbound applies can be reported separately.", "first_sourced_at − requisition_open_date", "days", ["requisition_open_date", "sourced_at"], "≤ 7 days for priority reqs", "Medium", LINKEDIN),
  extra("recruiter_load", "Recruiter Requisition Load", "Talent Acquisition", "Driver", "Open requisitions assigned per recruiter.", "Count active reqs only. Contract recruiters reported separately.", "open_reqs ÷ recruiters", "ratio", ["recruiter_id", "requisition_id", "req_status"], "Within the approved load range", "Medium", SHRM),
  extra("slate_quality", "Qualified Slate Rate", "Talent Acquisition", "Driver", "Share of requisitions with a complete qualified slate inside the SLA.", "Qualified definition must be approved before reporting.", "reqs_with_qualified_slate ÷ reqs", "%", ["requisition_id", "qualified_at"], "≥ 80% inside SLA", "Medium", CIPD),
  extra("candidate_nps", "Candidate NPS", "Talent Acquisition", "Guardrail", "Net Promoter Score from post-process candidate surveys.", "Include hired and declined. Report response rate.", "% promoters − % detractors", "index", ["survey_event", "nps_score"], "≥ +20", "Medium", LINKEDIN),
  extra("candidate_ghosting", "Candidate Ghosting Rate", "Talent Acquisition", "Driver", "Share of candidates who stop responding after a scheduled stage.", "Needs a no-response rule. Do not treat as quality of the person.", "ghosted ÷ scheduled", "%", ["stage_status", "last_response_at"], "Investigate if above historical median", "Low", SHRM),
  extra("req_cancel_rate", "Requisition Cancel Rate", "Talent Acquisition", "Driver", "Share of opened requisitions later cancelled without a hire.", "Cancelled after open. Never-approved drafts excluded.", "cancelled_reqs ÷ opened_reqs", "%", ["requisition_id", "req_status"], "Below historical median", "High", CIPD),
  extra("hm_response_time", "Hiring Manager Response Time", "Talent Acquisition", "Driver", "Days from slate delivery to manager decision or feedback.", "Requires a feedback timestamp. Missing times are a data gap, not zero.", "hm_feedback_at − slate_sent_at", "days", ["slate_sent_at", "hiring_manager_feedback_at"], "≤ 3 days", "Medium", SHRM),
  extra("interview_noshow", "Interview No-show Rate", "Talent Acquisition", "Driver", "Share of scheduled interviews with a candidate or interviewer no-show.", "Break out candidate vs interviewer when both flags exist.", "no_shows ÷ scheduled_interviews", "%", ["interview_scheduled_at", "no_show_flag"], "Below historical median", "High", LINKEDIN),
  extra("referral_hire_rate", "Referral Hire Rate", "Talent Acquisition", "Driver", "Share of hires whose source is an employee referral.", "Use the approved source taxonomy.", "referral_hires ÷ hires", "%", ["source", "hire_date"], "Context-specific; avoid over-concentration", "High", LINKEDIN),
  extra("agency_mix", "Agency Hire Mix", "Talent Acquisition", "Driver", "Share of hires from agencies or search firms.", "Include retained and contingent search.", "agency_hires ÷ hires", "%", ["source", "hire_date"], "Within the approved channel mix", "High", CIPD),
  extra("pipeline_coverage", "Pipeline Coverage Ratio", "Talent Acquisition", "Driver", "Active qualified candidates per open requisition.", "Qualified definition must match slate quality.", "qualified_active_candidates ÷ open_reqs", "ratio", ["requisition_id", "candidate_status"], "≥ 3 qualified per priority req", "Medium", LINKEDIN),
  extra("hiring_forecast_accuracy", "Hiring Forecast Accuracy", "Talent Acquisition", "Guardrail", "Actual hires versus the approved hiring forecast.", "Same period and population as the plan.", "1 − |actual_hires − planned_hires| ÷ planned_hires", "%", ["hire_date", "planned_hires"], "≥ 85% accuracy", "Medium", DELOITTE),
  extra("voluntary_attrition", "Voluntary Attrition", "Retention", "Outcome", "Voluntary separations divided by average headcount.", "Use the approved voluntary definition. Retirements can be separated.", "voluntary_exits ÷ average_headcount", "%", ["termination_date", "termination_type"], "At or below historical median", "High", ISO),
  extra("involuntary_attrition", "Involuntary Attrition", "Retention", "Driver", "Involuntary separations divided by average headcount.", "Do not mix with performance-management counts unless definitions match.", "involuntary_exits ÷ average_headcount", "%", ["termination_date", "termination_type"], "Context-specific", "High", ISO),
  extra("ninety_day_attrition", "90-day Attrition", "Retention", "Outcome", "Share of hires who leave within 90 days of start.", "Cohort with 90 days of observation only.", "exits_within_90d ÷ hires_in_cohort", "%", ["hire_date", "termination_date"], "≤ 5%", "High", CIPD),
  extra("average_tenure", "Average Tenure", "Retention", "Driver", "Mean completed years of service for the active population.", "Active employees at period end. Report median beside the mean.", "mean(years_of_service)", "years", ["employee_id", "hire_date"], "Context-specific", "High", ISO),
  extra("stay_interview_completion", "Stay-interview Completion", "Retention", "Driver", "Share of targeted employees with a completed stay interview in the period.", "Target list must be approved. Notes are not the metric.", "completed_stay_interviews ÷ targeted_employees", "%", ["employee_id", "stay_interview_at"], "100% of the critical-role list", "Medium", CIPD),
  extra("boomerang_rate", "Boomerang Hire Rate", "Retention", "Driver", "Share of hires who are former employees.", "Requires a reliable prior-employee flag.", "alumni_hires ÷ hires", "%", ["hire_date", "alumni_flag"], "Context-specific", "Medium", LINKEDIN),
  extra("exit_survey_completion", "Exit Survey Completion", "Retention", "Driver", "Share of separations with a completed exit survey.", "Voluntary exits can be reported separately.", "completed_exit_surveys ÷ separations", "%", ["termination_date", "exit_survey_at"], "≥ 70%", "Medium", SHRM),
  extra("tenure_under_two", "Share with Tenure under 2 Years", "Retention", "Driver", "Active employees with less than two years of service.", "Snapshot as-of date required.", "tenure_lt_2y ÷ headcount", "%", ["employee_id", "hire_date", "snapshot_month"], "Context-specific", "High", ISO),
  extra("certification_completion", "Certification Completion Rate", "Skills & Capability", "Driver", "Share of assigned certifications completed in the period.", "Separate compliance from capability certifications.", "completed_certs ÷ assigned_certs", "%", ["employee_id", "certification_status"], "Meet the program standard", "Medium", LINKEDIN),
  extra("learning_completion_rate", "Learning Completion Rate", "Skills & Capability", "Driver", "Share of assigned learning items completed.", "Hours and completion are different metrics.", "completed_items ÷ assigned_items", "%", ["employee_id", "learning_status"], "Meet the program standard", "Medium", LINKEDIN),
  extra("skill_assessment_coverage", "Skill Assessment Coverage", "Skills & Capability", "Driver", "Share of employees with a current assessed proficiency on required skills.", "Self-ratings alone are Low confidence.", "assessed_required_skills ÷ required_skill_seats", "%", ["employee_id", "skill_id", "assessment_date"], "≥ 80% of critical skills", "Low", DELOITTE),
  extra("adjacent_skill_coverage", "Adjacent Skill Coverage", "Skills & Capability", "Driver", "Share of demanded adjacent skills with internal supply.", "Adjacent list must be approved with the critical-skill list.", "covered_adjacent ÷ demanded_adjacent", "%", ["skill_id", "adjacency_flag", "proficiency_level"], "Track as a build option", "Low", DELOITTE),
  extra("time_to_skill", "Time to Skill", "Skills & Capability", "Outcome", "Days from assignment or hire to verified proficiency.", "Requires an approved proficiency event. Attendance is not proficiency.", "proficient_at − skill_start_at", "days", ["skill_id", "skill_start_at", "proficient_at"], "Role-specific", "Low", LINKEDIN),
  extra("internal_skill_fill", "Internal Skill Fill Rate", "Skills & Capability", "Outcome", "Share of skill-demand seats filled internally rather than hired or contracted.", "Same skill taxonomy as coverage.", "internal_fills ÷ skill_seats_filled", "%", ["skill_id", "fill_source"], "Increase versus prior year", "Medium", DELOITTE),
  extra("training_effectiveness", "Training Effectiveness", "Skills & Capability", "Guardrail", "Share of learners who meet the post-training proficiency or performance check.", "Do not use smile-sheets as the outcome.", "passed_checks ÷ learners", "%", ["learning_id", "assessment_result"], "≥ 70% pass", "Low", CIPD),
  extra("ai_skill_coverage", "AI Collaboration Skill Coverage", "Skills & Capability", "Driver", "Share of targeted roles with verified AI-collaboration proficiency.", "Active use and proficiency are different metrics.", "proficient_ai_roles ÷ targeted_roles", "%", ["job_role", "ai_proficiency"], "Context-specific", "Low", GARTNER),
  extra("first_time_manager_success", "First-time Manager Success", "Leadership", "Outcome", "Share of first-time managers still in role and meeting the approved standard at 12 months.", "Requires a first-time-manager flag and a success definition.", "successful_ftm ÷ ftm_cohort", "%", ["employee_id", "first_time_manager_flag", "manager_effectiveness"], "≥ 80%", "Medium", SHRM),
  extra("leadership_pipeline_ratio", "Leadership Pipeline Ratio", "Leadership", "Driver", "Ready-now plus ready-in-1-year successors per leadership role.", "One person should not inflate several benches without a rule.", "(ready_now + ready_1y) ÷ leadership_roles", "ratio", ["critical_role_id", "readiness_level"], "≥ 2.0", "Medium", CIPD),
  extra("skip_level_coverage", "Skip-level Coverage", "Leadership", "Driver", "Share of employees with a documented skip-level manager.", "Org hierarchy completeness metric.", "employees_with_skip_level ÷ employees", "%", ["employee_id", "skip_level_manager_id"], "≥ 95%", "High", DELOITTE),
  extra("manager_training_completion", "Manager Training Completion", "Leadership", "Driver", "Share of people managers completing the required manager curriculum.", "Required curriculum must be approved.", "completed_managers ÷ people_managers", "%", ["employee_id", "manager_flag", "training_status"], "100% of new managers in 180 days", "Medium", SHRM),
  extra("exec_stability", "Executive Stability", "Leadership", "Guardrail", "Retention of the approved executive population.", "Small-n: report counts, not just percents.", "retained_executives ÷ executive_population", "%", ["employee_id", "executive_flag"], "Context-specific", "Medium", GARTNER),
  extra("nine_box_coverage", "Talent-review Coverage", "Leadership", "Driver", "Share of targeted employees with a current talent-review rating.", "Rating scale must be approved. Compression is a separate issue.", "reviewed ÷ targeted", "%", ["employee_id", "talent_rating"], "100% of the targeted list", "Medium", CIPD),
  extra("time_to_internal_fill", "Time to Internal Fill", "Internal Mobility", "Driver", "Days from requisition open to accepted internal offer.", "Internal fills only. Compare with Time to Fill.", "internal_offer_accepted_at − requisition_open_date", "days", ["requisition_open_date", "offer_accepted_at", "internal_candidate_flag"], "Faster than external fill", "High", DELOITTE),
  extra("cross_function_move", "Cross-function Move Rate", "Internal Mobility", "Driver", "Employees moving across approved function boundaries.", "Function taxonomy must be stable.", "cross_function_moves ÷ average_headcount", "%", ["employee_id", "job_change_type", "function"], "Context-specific", "Medium", DELOITTE),
  extra("internal_apply_rate", "Internal Apply Rate", "Internal Mobility", "Driver", "Share of employees who apply to at least one internal role.", "Count unique employees, not applications.", "internal_applicants ÷ average_headcount", "%", ["employee_id", "internal_application_date"], "Rising versus prior year", "Medium", LINKEDIN),
  extra("mobility_after_learning", "Mobility after Learning", "Internal Mobility", "Driver", "Share of academy completers who make an internal move within 12 months.", "Requires a join between learning and job-change events.", "movers ÷ academy_completers", "%", ["learning_id", "job_change_date"], "Context-specific", "Low", LINKEDIN),
  extra("manager_release_time", "Manager Release Time", "Internal Mobility", "Driver", "Days from internal offer accept to home-manager release.", "Missing release dates are a process gap.", "release_at − internal_offer_accepted_at", "days", ["offer_accepted_at", "release_at"], "≤ 30 days", "Medium", SHRM),
  extra("survey_participation", "Survey Participation Rate", "Engagement & Culture", "Driver", "Share of invited employees who complete the census or pulse.", "Always report beside the score.", "completes ÷ invited", "%", ["survey_event", "invitation_status"], "≥ 70%", "High", GALLUP),
  extra("action_plan_close", "Survey Action-plan Close Rate", "Engagement & Culture", "Outcome", "Share of committed survey actions marked complete before the next cycle.", "Committed actions only. Themes without owners are excluded.", "closed_actions ÷ committed_actions", "%", ["action_id", "action_status"], "≥ 80%", "Medium", GALLUP),
  extra("recognition_rate", "Recognition Rate", "Engagement & Culture", "Driver", "Share of employees receiving a documented recognition in the period.", "Program events only. Informal thanks are out of scope unless captured.", "recognized_employees ÷ average_headcount", "%", ["employee_id", "recognition_event"], "No team at zero for two cycles", "Low", GARTNER),
  extra("hybrid_engagement_gap", "Hybrid Engagement Gap", "Engagement & Culture", "Driver", "Difference in engagement between hybrid and on-site groups.", "Work-location field must be approved. Suppress small groups.", "hybrid_score − onsite_score", "pp", ["survey_event", "work_location", "engagement_item_score"], "Close unexplained gaps", "Medium", GALLUP),
  extra("onboarding_experience", "Onboarding Experience Score", "Engagement & Culture", "Guardrail", "New-hire favorable score on onboarding items in the first 90 days.", "Cohort reporting. Do not diagnose individuals.", "mean(onboarding_items)", "% favorable", ["hire_date", "onboarding_survey"], "≥ 75% favorable", "Medium", SHRM),
  extra("goal_clarity", "Goal Clarity", "Engagement & Culture", "Driver", "Favorable score on knowing what is expected at work.", "Gallup-style item or approved equivalent.", "mean(goal_clarity_item)", "% favorable", ["survey_event", "goal_clarity_item"], "≥ 70% favorable", "Medium", GALLUP),
  extra("trust_in_leadership", "Trust in Leadership", "Engagement & Culture", "Guardrail", "Favorable score on senior-leadership trust items.", "Report response rate and unit-level suppression.", "mean(trust_items)", "% favorable", ["survey_event", "trust_item_score"], "Stable or rising", "Medium", SHRM),
  extra("slate_composition", "Interview Slate Composition", "DEI", "Outcome", "Composition of interview slates against the approved process standard.", "Process metric on slates. Not a prediction about individuals.", "slate_mix vs approved standard", "%", ["slate_id", "approved_composition_fields"], "Meet the approved slate standard", "Medium", SHRM),
  extra("stage_pass_parity", "Stage Pass-through Review", "DEI", "Driver", "Stage conversion reviewed against the approved fairness process standard.", "Investigate process design. Do not build protected-class prediction models.", "stage_pass_rate by approved process cut", "%", ["stage_name", "stage_result"], "No unexplained process drop", "Medium", CIPD),
  extra("promotion_slate_mix", "Promotion Slate Mix", "DEI", "Driver", "Composition of promotion slates against the approved standard.", "Slates, not individual scoring models.", "promotion_slate_mix vs standard", "%", ["promotion_slate_id", "approved_composition_fields"], "Meet the approved standard", "Medium", SHRM),
  extra("sponsorship_coverage", "Sponsorship Coverage", "DEI", "Driver", "Share of targeted employees with a documented sponsor.", "Sponsor is not the same as mentor. Definition must be approved.", "sponsored ÷ targeted", "%", ["employee_id", "sponsor_id"], "Meet the program standard", "Low", CIPD),
  extra("self_id_completeness", "Self-ID Completeness", "DEI", "Driver", "Share of employees with complete, consented self-ID fields used for process reporting.", "Completeness is not a vanity score. Suppression rules still apply.", "complete_self_id ÷ employees", "%", ["employee_id", "self_id_status"], "High enough to report, still suppress small n", "Medium", ISO),
  extra("vacancy_rate", "Vacancy Rate", "Workforce Planning", "Outcome", "Open requisitions as a share of planned seats.", "Same as-of date as headcount. Frozen reqs excluded if policy says so.", "open_reqs ÷ planned_seats", "%", ["requisition_id", "plan_headcount"], "Within the approved vacancy band", "High", DELOITTE),
  extra("joiners", "Joiners", "Workforce Planning", "Driver", "Employees starting in the period.", "Use hire/start date. Transfers in can be reported separately.", "count(hires)", "people", ["employee_id", "hire_date"], "Versus hiring plan", "High", ISO),
  extra("leavers", "Leavers", "Workforce Planning", "Driver", "Employees separating in the period.", "All separations unless a filter is approved.", "count(separations)", "people", ["employee_id", "termination_date"], "Versus attrition plan", "High", ISO),
  extra("net_change", "Net Headcount Change", "Workforce Planning", "Outcome", "Joiners minus leavers in the period.", "Reconcile to snapshot headcount.", "joiners − leavers", "people", ["hire_date", "termination_date", "snapshot_month"], "Explain residual versus snapshot", "High", ISO),
  extra("org_layers", "Organization Layers", "Workforce Planning", "Driver", "Count of management layers from front line to CEO.", "Use the approved hierarchy. Dotted lines excluded unless documented.", "max(org_depth)", "count", ["employee_id", "manager_id"], "Within the org-design range", "Medium", DELOITTE),
  extra("fte_vs_headcount", "FTE vs Headcount", "Workforce Planning", "Driver", "Full-time equivalent compared with unique employee headcount.", "Part-time fractions must follow the approved FTE rule.", "sum(fte) vs count(employees)", "ratio", ["employee_id", "fte"], "Track both; do not substitute", "High", ISO),
  extra("hiring_plan_accuracy", "Hiring Plan Accuracy", "Workforce Planning", "Guardrail", "Actual hires versus planned hires by unit.", "Same grain as the workforce plan.", "actual_hires ÷ planned_hires", "%", ["hire_date", "planned_hires", "org_unit"], "≥ 90% of plan ± tolerance", "Medium", DELOITTE),
  extra("turnover_cost", "Turnover Cost Estimate", "Workforce Planning", "Driver", "Estimated replacement cost of separations.", "Use an approved cost model. Label as estimate.", "separations × approved_replacement_cost", "currency", ["termination_date", "replacement_cost_rate"], "Trend, not a precise ledger", "Low", CIPD),
  extra("range_penetration", "Range Penetration", "Compensation", "Driver", "Position of base pay inside the salary range.", "0 at minimum, 1 at maximum. Report distribution.", "(base_pay − range_min) ÷ (range_max − range_min)", "ratio", ["base_pay", "range_min", "range_max"], "No unexplained pile-up at the min", "High", CIPD),
  extra("bonus_achievement", "Bonus Target Achievement", "Compensation", "Driver", "Actual bonus as a share of target bonus.", "Eligible population only.", "actual_bonus ÷ target_bonus", "%", ["employee_id", "bonus_actual", "bonus_target"], "Context-specific", "Medium", SHRM),
  extra("benefits_participation", "Benefits Participation", "Compensation", "Driver", "Share of eligible employees enrolled in a named benefit.", "Eligibility file required.", "enrolled ÷ eligible", "%", ["employee_id", "benefit_enrolled"], "Meet the program standard", "High", SHRM),
  extra("living_wage_gap", "Living-wage Gap", "Compensation", "Guardrail", "Share of employees below an approved living-wage reference.", "Reference must be documented by location.", "below_reference ÷ employees", "%", ["base_pay", "location", "living_wage_reference"], "Zero unless a documented exception", "Medium", CIPD),
  extra("variable_pay_mix", "Variable Pay Mix", "Compensation", "Driver", "Variable pay as a share of total cash.", "Use the approved total-cash definition.", "variable_pay ÷ total_cash", "%", ["variable_pay", "total_cash"], "Within the approved mix by job family", "Medium", CIPD),
  extra("pay_cycle_time", "Pay-decision Cycle Time", "Compensation", "Driver", "Days from pay-change request to employee-visible outcome.", "Off-cycle and cycle events can be split.", "pay_effective_at − pay_request_at", "days", ["pay_request_at", "pay_effective_at"], "Meet the published SLA", "High", SHRM),
  extra("market_positioning", "Market Positioning", "Compensation", "Driver", "Base or total cash versus the approved market benchmark.", "Benchmark vintage and peer set must be stated.", "pay ÷ market_reference", "ratio", ["base_pay", "market_reference"], "Within the approved target percentile", "Medium", CIPD),
  extra("goal_completion", "Goal Completion Rate", "Performance", "Driver", "Share of approved goals marked complete in the period.", "Goals must be in the system of record.", "completed_goals ÷ approved_goals", "%", ["goal_id", "goal_status"], "Context-specific", "Medium", CIPD),
  extra("calibration_variance", "Calibration Rating Spread", "Performance", "Driver", "Dispersion of ratings after calibration.", "Extreme compression is a warning, not a target by itself.", "stdev(calibrated_rating)", "index", ["employee_id", "performance_rating"], "Not collapsed to a single rating", "Medium", CIPD),
  extra("review_completion", "Performance Review Completion", "Performance", "Driver", "Share of required reviews completed by the deadline.", "Required population only.", "completed_reviews ÷ required_reviews", "%", ["employee_id", "review_status"], "100% of required reviews", "High", SHRM),
  extra("feedback_frequency", "Feedback Frequency", "Performance", "Driver", "Average documented feedback events per employee in the period.", "System events only.", "feedback_events ÷ employees", "count", ["employee_id", "feedback_event"], "Context-specific", "Low", GARTNER),
  extra("performance_goal_alignment", "Goal-to-strategy Alignment", "Performance", "Guardrail", "Share of team goals mapped to an approved strategy metric.", "Mapping must be explicit, not inferred by a model.", "aligned_goals ÷ team_goals", "%", ["goal_id", "strategy_metric_id"], "100% of priority teams", "Low", GARTNER),
  extra("pip_close_rate", "Performance-plan Close Rate", "Performance", "Driver", "Share of performance-improvement plans closed with an approved outcome.", "Process metric. Do not use as an individual score.", "closed_plans ÷ opened_plans", "%", ["pip_id", "pip_status"], "Plans should not stay open past SLA", "Medium", SHRM),
  extra("pto_usage", "PTO Usage Rate", "Wellbeing", "Driver", "Used paid time off as a share of entitled time.", "Entitlement file required. Report unused balances separately.", "used_pto ÷ entitled_pto", "%", ["employee_id", "pto_used", "pto_entitled"], "No team at extreme unused for a year", "Medium", CIPD),
  extra("after_hours_index", "After-hours Activity Index", "Wellbeing", "Driver", "Share of collaboration events outside approved working hours.", "Tool logs are a signal, not a performance score.", "after_hours_events ÷ all_events", "%", ["employee_id", "event_at"], "Investigate chronic outliers at team level", "Low", GARTNER),
  extra("meeting_load", "Meeting Load", "Wellbeing", "Driver", "Average meeting hours per employee per week.", "Calendar data. Focus time can be reported beside it.", "meeting_hours ÷ employees ÷ weeks", "hours", ["employee_id", "meeting_hours"], "Context-specific", "Low", GARTNER),
  extra("eap_utilization", "EAP Utilization", "Wellbeing", "Driver", "Share of eligible employees using the EAP in the period.", "Aggregate only. Never drill to individuals in this product.", "eap_users ÷ eligible", "%", ["eap_use_flag"], "Interpret with wellbeing and absence, not as a target to maximize", "Low", CIPD),
  extra("burnout_pulse", "Burnout Pulse (team)", "Wellbeing", "Guardrail", "Team-level unfavorable score on workload and recovery items.", "Suppress small teams. Not an individual diagnosis.", "mean(unfavorable_recovery_items)", "%", ["survey_event", "wellbeing_item_score"], "No team above the alert threshold for two pulses", "Medium", GARTNER),
  extra("case_volume", "HR Case Volume", "People Operations", "Driver", "Opened People cases in the period.", "Use the case system taxonomy.", "count(cases)", "count", ["case_id", "opened_at"], "Watch unexpected spikes", "High", GARTNER),
  extra("first_contact_resolution", "First-contact Resolution", "People Operations", "Outcome", "Share of cases resolved on first contact.", "Resolution definition must be approved.", "fcr_cases ÷ closed_cases", "%", ["case_id", "fcr_flag"], "Meet the service standard", "Medium", SHRM),
  extra("onboarding_completion", "Onboarding Task Completion", "People Operations", "Driver", "Share of required onboarding tasks complete by day 30.", "Required task list must be approved.", "completed_required_tasks ÷ required_tasks", "%", ["employee_id", "onboarding_task_status"], "≥ 95%", "High", SHRM),
  extra("policy_ack", "Policy Acknowledgement Rate", "People Operations", "Driver", "Share of required policy acknowledgements completed.", "Required policies only.", "acked ÷ required", "%", ["employee_id", "policy_ack_at"], "100% of required policies", "High", ISO),
  extra("hr_sla_met", "HR SLA Met Rate", "People Operations", "Outcome", "Share of People cases or requests closed inside the published SLA.", "SLA clock rules must be documented.", "on_time ÷ closed", "%", ["case_id", "sla_met_flag"], "≥ 90%", "High", GARTNER),
  extra("identity_match_rate", "Identity Match Rate", "People Operations", "Driver", "Share of People records that join across core systems on the approved key.", "Unmatched IDs are an evidence gap for every downstream metric.", "matched ÷ records", "%", ["employee_id", "source_system"], "≥ 98%", "High", ISO),
  extra("offer_letter_cycle", "Offer-letter Cycle Time", "People Operations", "Driver", "Days from offer approval to signed letter.", "Signed letters only.", "letter_signed_at − offer_approved_at", "days", ["offer_approved_at", "letter_signed_at"], "≤ 3 days", "High", SHRM),
];

export const metricCatalog: MetricCatalogItem[] = [...fromTemplates, ...additional];

export const metricDomains: StrategyCategory[] = [
  "Talent Acquisition",
  "Retention",
  "Skills & Capability",
  "Leadership",
  "Internal Mobility",
  "Engagement & Culture",
  "DEI",
  "Workforce Planning",
  "Compensation",
  "Performance",
  "Wellbeing",
  "People Operations",
];

export function getMetricCatalogItem(id: string) {
  return metricCatalog.find((item) => item.id === id);
}

export function proposalFromCatalogItem(
  item: MetricCatalogItem,
  origin: MetricProposal["origin"] = "catalog",
): MetricProposal {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    definition: item.definition,
    measurementStandard: item.measurementStandard,
    formula: item.formula,
    unit: item.unit,
    requiredFields: item.requiredFields,
    suggestedTarget: item.suggestedTarget,
    target: "",
    confidence: item.confidence,
    status: "Proposed",
    origin,
  };
}

export function filterMetricCatalog(
  query: string,
  domain?: StrategyCategory | "All",
  role?: MetricRole | "All",
) {
  const normalized = query.trim().toLowerCase();
  return metricCatalog.filter((item) => {
    if (domain && domain !== "All" && item.domain !== domain) return false;
    if (role && role !== "All" && item.category !== role) return false;
    if (!normalized) return true;
    return `${item.name} ${item.definition} ${item.domain} ${item.formula} ${item.source}`
      .toLowerCase()
      .includes(normalized);
  });
}

export function metricCatalogStats() {
  const byDomain = Object.fromEntries(metricDomains.map((domain) => [domain, 0])) as Record<
    StrategyCategory,
    number
  >;
  const byRole = { Outcome: 0, Guardrail: 0, Driver: 0 };
  for (const item of metricCatalog) {
    byDomain[item.domain] += 1;
    byRole[item.category] += 1;
  }
  return { total: metricCatalog.length, byDomain, byRole };
}

export function emptyMeasurementBrief(): StrategyBrief {
  return {
    intentKind: "strategy",
    source: "custom",
    category: "Custom",
    title: "Measurement plan",
    statement: "Metrics selected from the People metric library or written by you.",
    population: "To be confirmed",
    analysis: null,
    metrics: [],
    targetsSkipped: false,
  };
}

export function proposalFromCustomDraft(draft: CustomMetricDraft): MetricProposal {
  const name = draft.name.trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "metric";
  const fields = draft.requiredFields
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
  return {
    id: `custom-${slug}-${Date.now()}`,
    name,
    category: draft.category,
    definition: draft.definition.trim(),
    measurementStandard:
      draft.measurementStandard.trim() || "Measurement standard needs human confirmation.",
    formula: draft.formula.trim() || "To be confirmed",
    unit: draft.unit.trim(),
    requiredFields: fields,
    suggestedTarget: draft.suggestedTarget.trim(),
    target: draft.suggestedTarget.trim(),
    confidence: "Low",
    status: "Proposed",
    origin: "custom",
  };
}

export function inferMetricDomain(name: string, definition: string): StrategyCategory {
  return classifyCustomStatement(`${name} ${definition}`);
}
