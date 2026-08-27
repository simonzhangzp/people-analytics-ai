import { calculateReadinessScore, calculateTimeToFillAnalysis } from "@/lib/analytics";
import type {
  DatasetProfile,
  ExecutiveInsight,
  FieldMapping,
  MetricDefinition,
  RecommendedAction,
  StageDuration,
  StorySlide,
  StrategicObjective,
  WorkflowStage,
  WorkflowStageId,
} from "@/types/domain";

export const workflowStages: WorkflowStage[] = [
  { id: "strategy", label: "Strategy", eyebrow: "01", status: "Approved" },
  { id: "measurement", label: "Measurement", eyebrow: "02", status: "Ready" },
  { id: "data", label: "Data", eyebrow: "03", status: "Needs input" },
  { id: "analysis", label: "Analysis", eyebrow: "04", status: "Ready" },
  { id: "story", label: "Executive Story", eyebrow: "05", status: "Not started" },
  { id: "actions", label: "Action", eyebrow: "06", status: "Not started" },
];

export const strategicObjective: StrategicObjective = {
  id: "ta-speed-01",
  title: "Reduce Time to Fill",
  originalText: "We need to hire critical AI talent faster without lowering quality.",
  refinedObjective:
    "Reduce median Time to Fill for priority AI and Engineering roles from 62 days to 45 days by Q4, while maintaining or improving Quality of Hire.",
  businessOutcome:
    "Build critical product and engineering capacity fast enough to deliver the 2027 AI roadmap.",
  population: "AI + Engineering · Levels 5–6",
  baseline: 62,
  target: 45,
  unit: "days",
  deadline: "Q4 2027",
  status: "Approved",
  guardrails: [
    "Quality of Hire",
    "Candidate Satisfaction",
    "Offer Acceptance Rate",
  ],
};

export const metricDefinitions: MetricDefinition[] = [
  {
    id: "ta_time_to_fill",
    name: "Time to Fill",
    category: "Outcome",
    currentValue: "59 days",
    target: "45 days",
    trend: "+8 days vs prior quarter",
    definition:
      "Elapsed calendar days from requisition open date to accepted offer.",
    formula: "offer_accepted_at - requisition_open_date",
    requiredFields: ["requisition_open_date", "offer_accepted_at", "requisition_id"],
    status: "Approved",
    version: "v1.3",
    confidence: "High",
  },
  {
    id: "quality_of_hire",
    name: "Quality of Hire",
    category: "Guardrail",
    currentValue: "76 / 100",
    target: "≥ 76",
    trend: "Stable vs prior cohort",
    definition:
      "Weighted index of first-year performance, 12-month retention, and manager satisfaction.",
    formula: "performance × 50% + retention × 30% + manager satisfaction × 20%",
    requiredFields: ["performance_rating", "retained_12m", "manager_satisfaction"],
    status: "Approved",
    version: "v1.1",
    confidence: "Medium",
  },
  {
    id: "candidate_satisfaction",
    name: "Candidate Satisfaction",
    category: "Guardrail",
    currentValue: "4.1 / 5",
    target: "≥ 4.1",
    trend: "−0.1 after panel interview",
    definition: "Average post-decision candidate survey rating.",
    formula: "mean(overall_satisfaction)",
    requiredFields: ["survey_event", "overall_satisfaction"],
    status: "Approved",
    version: "v1.0",
    confidence: "Medium",
  },
  {
    id: "interview_scheduling",
    name: "Interview Scheduling Time",
    category: "Driver",
    currentValue: "12.1 days",
    target: "6 days",
    trend: "+3.4 days vs prior quarter",
    definition:
      "Elapsed time from interview request to confirmed interview schedule.",
    formula: "interview_scheduled_at - interview_requested_at",
    requiredFields: ["interview_requested_at", "interview_scheduled_at"],
    status: "Approved",
    version: "v1.0",
    confidence: "High",
  },
  {
    id: "offer_approval",
    name: "Offer Approval Time",
    category: "Driver",
    currentValue: "9 days",
    target: "6 days",
    trend: "+1.8 days vs prior quarter",
    definition: "Elapsed time from offer creation to final approval.",
    formula: "offer_approved_at - offer_created_at",
    requiredFields: ["offer_created_at", "offer_approved_at"],
    status: "Needs Review",
    version: "v0.9",
    confidence: "High",
  },
];

export const stageDurations: StageDuration[] = [
  { stage: "Sourcing", currentDays: 8, targetDays: 7 },
  { stage: "Screening", currentDays: 7.5, targetDays: 6.5 },
  { stage: "Interview scheduling", currentDays: 12.1, targetDays: 6 },
  { stage: "Interview process", currentDays: 14, targetDays: 12 },
  { stage: "Offer approval", currentDays: 9, targetDays: 6 },
  { stage: "Offer close", currentDays: 8.4, targetDays: 7.5 },
];

export const timeToFillAnalysis = calculateTimeToFillAnalysis(stageDurations);

export const monthlyTrend = [
  { month: "Jan", value: 44, target: 45 },
  { month: "Feb", value: 46, target: 45 },
  { month: "Mar", value: 49, target: 45 },
  { month: "Apr", value: 52, target: 45 },
  { month: "May", value: 56, target: 45 },
  { month: "Jun", value: 59, target: 45 },
];

export const segmentGap = [
  { segment: "Seattle · L5–6", excess: 4.8 },
  { segment: "Austin · L5–6", excess: 3.9 },
  { segment: "New York · L5–6", excess: 2.1 },
  { segment: "Other priority roles", excess: 3.2 },
];

export const datasetProfiles: DatasetProfile[] = [
  {
    id: "requisitions",
    name: "requisitions.csv",
    entity: "Requisition",
    grain: "Requisition",
    rows: 2_084,
    timeRange: "Jan 2025–Jun 2027",
    health: 94,
    mappingStatus: "Mapped",
  },
  {
    id: "applications",
    name: "candidate_applications.csv",
    entity: "Application",
    grain: "Candidate × Requisition",
    rows: 74_812,
    timeRange: "Jan 2025–Jun 2027",
    health: 89,
    mappingStatus: "Mapped",
  },
  {
    id: "stage-history",
    name: "stage_history.xlsx",
    entity: "Stage Event",
    grain: "Application × Stage Event",
    rows: 318_406,
    timeRange: "Jan 2025–Jun 2027",
    health: 76,
    mappingStatus: "Review",
  },
  {
    id: "hire-outcomes",
    name: "new_hire_outcomes.csv",
    entity: "Hire Outcome",
    grain: "Employee × Hire",
    rows: 1_487,
    timeRange: "Jan 2025–Jun 2027",
    health: 68,
    mappingStatus: "Needs input",
  },
];

export const readinessScores = {
  Completeness: 82,
  Consistency: 86,
  Joinability: 71,
  "Time coverage": 94,
  "Metric readiness": 78,
  "Privacy risk": 58,
};

export const readinessScore = calculateReadinessScore(readinessScores);

export const fieldMappings: FieldMapping[] = [
  {
    id: "map-1",
    sourceField: "job_req_id",
    proposedMeaning: "Requisition ID",
    canonicalField: "requisition_id",
    confidence: 98,
    status: "Confirmed",
  },
  {
    id: "map-2",
    sourceField: "req_open_dt",
    proposedMeaning: "Requisition open date",
    canonicalField: "requisition_open_date",
    confidence: 96,
    status: "Confirmed",
  },
  {
    id: "map-3",
    sourceField: "cand_num",
    proposedMeaning: "Candidate ID",
    canonicalField: "candidate_id",
    confidence: 94,
    status: "Confirmed",
  },
  {
    id: "map-4",
    sourceField: "hm_feedback_dt",
    proposedMeaning: "Manager feedback timestamp",
    canonicalField: "hiring_manager_feedback_at",
    confidence: 73,
    status: "Review",
  },
];

export const executiveInsight: ExecutiveInsight = {
  headline:
    "AI Engineering Time to Fill is 14 days above target, driven by interview scheduling and offer approval",
  evidence: [
    "Interview scheduling contributes 6.1 days, or 44% of the total gap.",
    "Offer approval contributes another 3.0 days.",
    "Seattle and Austin Level 5–6 roles account for 62% of excess delay.",
  ],
  limitation:
    "Hiring-manager resume review timestamps are unavailable, so manager responsiveness cannot be tested.",
  confidence: "High",
  metricVersion: "Time to Fill · Approved v1.3",
};

export const storySlides: StorySlide[] = [
  {
    id: 1,
    kicker: "Executive answer",
    headline: "AI Engineering Time to Fill is 14 days above target",
    visual: "summary",
    facts: ["59 days current", "45 days target", "High confidence"],
  },
  {
    id: 2,
    kicker: "Where delay happens",
    headline: "Interview scheduling accounts for 44% of the gap",
    visual: "bar",
    facts: ["+6.1 days", "Offer approval: +3.0 days", "Metric: TTF v1.3"],
  },
  {
    id: 3,
    kicker: "Where it concentrates",
    headline: "Two locations and Level 5–6 roles drive 62% of excess delay",
    visual: "segments",
    facts: ["Seattle", "Austin", "Priority AI roles"],
  },
  {
    id: 4,
    kicker: "Evidence boundary",
    headline: "The current data answers the process question, not manager response time",
    visual: "answerability",
    facts: ["Answerability: 74%", "Stage data available", "HM timestamps missing"],
  },
  {
    id: 5,
    kicker: "Recommended decision",
    headline: "Pilot centralized interview scheduling for priority AI roles",
    visual: "actions",
    facts: ["4–6 week pilot", "Target: −3 to −5 days", "Guardrail: Candidate Satisfaction"],
  },
];

export const recommendedAction: RecommendedAction = {
  title: "Pilot centralized interview scheduling for priority AI roles",
  evidence: "Interview scheduling contributes 6.1 days to the Time to Fill gap.",
  hypothesis:
    "Centralized scheduling will reduce median scheduling delay by 3–5 days without lowering candidate satisfaction.",
  owner: "TA Operations",
  population: "AI Engineering · Levels 5–6 · Seattle + Austin",
  successMetric: "Median Interview Scheduling Time",
  guardrail: "Candidate Satisfaction",
  duration: "4–6 weeks",
};

export const aiGuidance: Record<
  WorkflowStageId,
  { title: string; body: string; action: string; note: string }
> = {
  strategy: {
    title: "Proposal, not approved knowledge",
    body: "The library and agent can propose metrics. Confirm the outcome, guardrails, and whether targets stay empty until Data is profiled.",
    action: "Human confirmation required",
    note: "AI proposes · you decide",
  },
  measurement: {
    title: "Definitions stay proposals until you confirm",
    body: "Add metrics from the library or write your own. Keep outcome, guardrail, and driver roles visible. Targets may stay empty until Data is profiled.",
    action: "Confirm the measurement plan",
    note: "Human decision required",
  },
  data: {
    title: "Critical data gap",
    body: "Candidate-to-employee linkage is incomplete. Quality of Hire can be reported, but source attribution is less reliable.",
    action: "Review limitation",
    note: "Safe metadata only",
  },
  analysis: {
    title: "Dashboards follow the first three steps",
    body: "Each card is generated from the confirmed strategy or problem, the measurement plan, and the uploaded files. Calculated values stay local. Missing fields are labeled, not invented.",
    action: "Review calculated vs missing evidence",
    note: "Code calculates · AI does not invent numbers",
  },
  story: {
    title: "CHRO storyline",
    body: "Lead with the 14-day gap, show the two largest contributors, state the evidence boundary, then recommend one focused pilot.",
    action: "5 slides proposed",
    note: "Evidence linked",
  },
  actions: {
    title: "Pilot design",
    body: "Use Interview Scheduling Time as the success metric and Candidate Satisfaction as the guardrail. Review after four weeks.",
    action: "Create pilot",
    note: "Needs owner confirmation",
  },
};
