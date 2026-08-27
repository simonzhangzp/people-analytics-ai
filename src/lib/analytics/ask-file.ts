import { canonicalPeopleFields, findCanonicalField } from "@/lib/data/canonical-schema";
import { canonicalSource } from "@/lib/data/local-profiler";
import { suggestAskQuestion } from "@/lib/data/report-headers";
import { formatNumber } from "@/lib/utils";
import type {
  AskConfirmations,
  AskDefinition,
  AskEvidenceKind,
  AskFileResult,
  AskInsight,
  AskMetric,
  AskScenario,
} from "@/types/ask";
import type { DataRow, LocalDataset } from "@/types/local-data";

function pct(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function pctLabel(count: number, total: number) {
  return `${pct(count, total)}% (${formatNumber(count)} of ${formatNumber(total)})`;
}

function fillRate(rows: DataRow[], source?: string) {
  if (!source || rows.length === 0) return 0;
  const filled = rows.filter((row) => row[source] !== null && row[source] !== "").length;
  return pct(filled, rows.length);
}

function counts(rows: DataRow[], source?: string) {
  const map = new Map<string, number>();
  if (!source) return map;
  for (const row of rows) {
    const value = row[source];
    if (value === null || value === "") continue;
    const key = String(value);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function topEntries(map: Map<string, number>, limit = 6) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function cell(row: DataRow, source?: string) {
  if (!source) return "";
  const value = row[source];
  return value === null || value === undefined ? "" : String(value);
}

function includeRow(
  row: DataRow,
  population: string,
  statusSource?: string,
  typeSource?: string,
) {
  const status = cell(row, statusSource);
  const type = cell(row, typeSource);
  const terminated =
    /terminate/i.test(status) || /ex-employee/i.test(type);
  if (population === "active_only") return /active assignment/i.test(status);
  if (population === "exclude_terminated") return !terminated;
  return true;
}

function source(dataset: LocalDataset, canonicalField: string) {
  return (
    canonicalSource(dataset, canonicalField) ??
    dataset.columns.find((column) => column.canonicalField === canonicalField)?.name
  );
}

function detectScenario(dataset: LocalDataset): AskScenario {
  if (dataset.entity === "Talent Review Extract") return "talent_review";
  if (dataset.entity === "Candidate Application") return "recruiting";
  if (dataset.entity === "Employee Snapshot") return "headcount";
  if (dataset.entity === "Employee Roster" || dataset.entity === "Employee Hire Extract") {
    return "roster";
  }
  const names = dataset.columns.map((column) => column.name.toLowerCase()).join(" | ");
  if (/talent review|placement code|appraisal summary/.test(names)) return "talent_review";
  return "generic";
}

function questionFocus(question: string) {
  const text = question.toLowerCase();
  return {
    recruiting: /time to fill|time to hire|requisition|candidate|funnel/.test(text),
    retention: /retention|flight|attrition|regret/.test(text),
    placement: /placement|potential|nine.?box|9.?box/.test(text),
    performance: /performance|rating|appraisal/.test(text),
    distribution:
      /distribution|mix|cut|segment|break.?down|headcount|population|workforce/.test(text),
    completeness: /complete|coverage|status|how many|risk/.test(text) || text.trim() === "",
  };
}

function usedColumn(
  dataset: LocalDataset,
  rows: DataRow[],
  canonicalField: string,
) {
  const sourceField = source(dataset, canonicalField);
  if (!sourceField) return null;
  return {
    source: sourceField,
    meaning: canonicalPeopleFields[canonicalField]?.label ?? findCanonicalField(sourceField)?.label ?? sourceField,
    fillRate: fillRate(rows, sourceField),
  };
}

function kindFor(id: string, confirmations: AskConfirmations): AskEvidenceKind {
  return confirmations[id] ? "approved" : "assumption";
}

export const defaultAskConfirmations: AskConfirmations = {
  population: "all_rows",
  talent_review_meaning: "started",
  retention_low: "do_not_interpret",
  headcount_meaning: "latest_month",
};

function talentDefinitions(confirmations: AskConfirmations): AskDefinition[] {
  return [
    {
      id: "population",
      label: "Who belongs in the denominator?",
      why: "Terminated and leave rows change completion rates.",
      kind: kindFor("population", confirmations),
      options: [
        { id: "all_rows", label: "All rows in this file" },
        { id: "active_only", label: "Active assignments only" },
        { id: "exclude_terminated", label: "Exclude terminated / ex-employees" },
      ],
    },
    {
      id: "talent_review_meaning",
      label: "What does Talent Review = Initiated mean?",
      why: "Initiated may mean started, not finished.",
      kind: kindFor("talent_review_meaning", confirmations),
      options: [
        { id: "started", label: "Review has started, not necessarily finished" },
        { id: "has_rating", label: "Count as reviewed only if Overall Performance is filled" },
      ],
    },
    {
      id: "retention_low",
      label: "What does Retention = Low mean?",
      why: "Low can mean flight risk or a different retention judgment.",
      kind: kindFor("retention_low", confirmations),
      options: [
        { id: "do_not_interpret", label: "Do not interpret until the process owner confirms" },
        { id: "flight_risk", label: "Flight / regrettable-loss risk" },
      ],
    },
  ];
}

function structureSentence(dataset: LocalDataset, scenario: AskScenario) {
  const layout = dataset.aggregates?.headerLayout ?? "single";
  const layoutText =
    layout === "section_then_fields"
      ? "a two-row report header (section titles, then field names)"
      : "a single header row";
  if (scenario === "talent_review") {
    return `${formatNumber(dataset.columns.length)} columns recovered from ${layoutText}; grain is one employee per row, covering identity, talent-review ratings, and PM appraisal status.`;
  }
  return `${formatNumber(dataset.columns.length)} columns recovered from ${layoutText}; inferred entity is ${dataset.entity} at grain “${dataset.grain}”.`;
}

function fileSummarySentence(
  dataset: LocalDataset,
  scenario: AskScenario,
  rowCount: number,
) {
  const people =
    dataset.aggregates?.uniqueEmployees && dataset.aggregates.uniqueEmployees > 0
      ? dataset.aggregates.uniqueEmployees
      : rowCount;
  if (scenario === "talent_review") {
    return `This file is an employee-level talent review and performance-appraisal extract: ${formatNumber(people)} people, ${formatNumber(dataset.columns.length)} columns, inferred as ${dataset.entity}.`;
  }
  if (scenario === "recruiting") {
    return `This file looks like a recruiting extract: ${formatNumber(rowCount)} application rows and ${formatNumber(dataset.columns.length)} columns.`;
  }
  if (scenario === "headcount") {
    return `This file looks like an employee snapshot: ${formatNumber(people)} unique employees across ${formatNumber(rowCount)} rows.`;
  }
  return `This file has ${formatNumber(rowCount)} rows and ${formatNumber(dataset.columns.length)} columns, inferred as ${dataset.entity} (${dataset.grain}).`;
}

function analyzeTalentReview(
  dataset: LocalDataset,
  question: string,
  confirmations: AskConfirmations,
): Omit<
  AskFileResult,
  "fileSummary" | "structure" | "qualityScore" | "qualityCaption" | "headerLayout"
> {
  const population = confirmations.population ?? "all_rows";
  const reviewMeaning = confirmations.talent_review_meaning ?? "started";
  const retentionMeaning = confirmations.retention_low ?? "do_not_interpret";
  const focus = questionFocus(question);

  const statusSource = source(dataset, "employment_status");
  const typeSource = source(dataset, "employee_type");
  const reviewSource = source(dataset, "talent_review_status");
  const performanceSource = source(dataset, "overall_performance");
  const placementSource = source(dataset, "placement_code");
  const retentionSource = source(dataset, "retention_risk");
  const appraisalSource = source(dataset, "appraisal_status");
  const objectivesSource = source(dataset, "objectives_summary");
  const competencySource = source(dataset, "competency_summary");
  const leadershipSource = source(dataset, "leadership_area");

  const populationRows = dataset.rows.filter((row) =>
    includeRow(row, population, statusSource, typeSource),
  );
  const total = populationRows.length;

  const reviewed = populationRows.filter((row) => {
    if (reviewMeaning === "has_rating") {
      return cell(row, performanceSource) !== "";
    }
    return /initiated|complete/i.test(cell(row, reviewSource));
  });
  const appraisalCompleted = populationRows.filter((row) =>
    /completed/i.test(cell(row, appraisalSource)),
  );
  const performanceCounts = counts(reviewed, performanceSource);
  const placementCounts = counts(reviewed, placementSource);
  const retentionCounts = counts(populationRows, retentionSource);
  const retentionRated = [...retentionCounts.values()].reduce((sum, value) => sum + value, 0);
  const retentionLow = retentionCounts.get("Low") ?? 0;
  const placementRisk =
    (placementCounts.get("Not Well Placed") ?? 0) +
    (placementCounts.get("Performance Issue") ?? 0);
  const highPotential = placementCounts.get("High Potential") ?? 0;
  const active = populationRows.filter((row) =>
    /active assignment/i.test(cell(row, statusSource)),
  ).length;
  const terminated = populationRows.filter((row) =>
    /terminate/i.test(cell(row, statusSource)) || /ex-employee/i.test(cell(row, typeSource)),
  ).length;

  const leadershipUnreviewed = new Map<string, { total: number; unreviewed: number }>();
  if (leadershipSource) {
    for (const row of populationRows) {
      const area = cell(row, leadershipSource) || "(blank)";
      const current = leadershipUnreviewed.get(area) ?? { total: 0, unreviewed: 0 };
      current.total += 1;
      const reviewedRow =
        reviewMeaning === "has_rating"
          ? cell(row, performanceSource) !== ""
          : /initiated|complete/i.test(cell(row, reviewSource));
      if (!reviewedRow) current.unreviewed += 1;
      leadershipUnreviewed.set(area, current);
    }
  }
  const concentrated = [...leadershipUnreviewed.entries()]
    .sort((a, b) => b[1].unreviewed - a[1].unreviewed)
    .at(0);

  const metrics: AskMetric[] = [
    {
      name: "Population",
      formula:
        population === "active_only"
          ? "Rows where Assignment Status = Active Assignment"
          : population === "exclude_terminated"
            ? "Rows excluding Terminate Assignment and Ex-employee"
            : "All non-empty rows in the extract",
      value: formatNumber(total),
      status: confirmations.population ? "calculated" : "assumption",
    },
    {
      name: "Talent review started",
      formula:
        reviewMeaning === "has_rating"
          ? "Overall Performance is not blank / population"
          : "Talent Review is Initiated or Completed / population",
      value: pctLabel(reviewed.length, total),
      status: confirmations.talent_review_meaning ? "calculated" : "assumption",
    },
    {
      name: "Appraisal completed",
      formula: "Appraisal Summary = COMPLETED / population",
      value: pctLabel(appraisalCompleted.length, total),
      status: "calculated",
    },
  ];

  if (performanceCounts.size > 0) {
    metrics.push({
      name: "Performance mix among reviewed",
      formula: "Count of each Overall Performance value among reviewed rows",
      value: topEntries(performanceCounts)
        .map(([label, count]) => `${label} ${formatNumber(count)}`)
        .join(" · "),
      status: "calculated",
    });
  }
  if (placementCounts.size > 0) {
    metrics.push({
      name: "Placement mix among reviewed",
      formula: "Count of each Placement Code among reviewed rows",
      value: topEntries(placementCounts)
        .map(([label, count]) => `${label} ${formatNumber(count)}`)
        .join(" · "),
      status: "calculated",
    });
  }
  if (retentionRated > 0) {
    metrics.push({
      name: "Retention = Low among rated",
      formula: "Retention = Low / rows with a Retention value",
      value: pctLabel(retentionLow, retentionRated),
      status: retentionMeaning === "do_not_interpret" ? "assumption" : "calculated",
    });
  }

  const columnsUsed = [
    usedColumn(dataset, dataset.rows, "employee_id"),
    usedColumn(dataset, dataset.rows, "employment_status"),
    usedColumn(dataset, dataset.rows, "employee_type"),
    usedColumn(dataset, dataset.rows, "talent_review_status"),
    usedColumn(dataset, dataset.rows, "overall_performance"),
    usedColumn(dataset, dataset.rows, "placement_code"),
    usedColumn(dataset, dataset.rows, "retention_risk"),
    usedColumn(dataset, dataset.rows, "appraisal_status"),
    usedColumn(dataset, dataset.rows, "objectives_summary"),
    usedColumn(dataset, dataset.rows, "competency_summary"),
    usedColumn(dataset, dataset.rows, "leadership_area"),
    usedColumn(dataset, dataset.rows, "hire_date"),
  ].filter((column): column is NonNullable<typeof column> => Boolean(column));

  const assumptions = [
    !confirmations.population
      ? "Denominator is every row in the file, including terminated and leave assignments."
      : null,
    !confirmations.talent_review_meaning
      ? "Talent Review = Initiated is treated as started, not finished."
      : null,
    retentionMeaning === "do_not_interpret"
      ? "Retention = Low is reported as a count only; it is not treated as flight risk."
      : null,
    leadershipSource
      ? "CLT labels are person names used only as leadership-area segments, not as individual performance scores."
      : null,
  ].filter((item): item is string => Boolean(item));

  const approvedDefinitions = [
    confirmations.population
      ? `Population: ${talentDefinitions(confirmations)[0].options.find((option) => option.id === population)?.label}`
      : null,
    confirmations.talent_review_meaning
      ? `Talent Review meaning: ${talentDefinitions(confirmations)[1].options.find((option) => option.id === reviewMeaning)?.label}`
      : null,
    confirmations.retention_low && confirmations.retention_low !== "do_not_interpret"
      ? "Retention = Low is treated as flight / regrettable-loss risk."
      : null,
  ].filter((item): item is string => Boolean(item));

  const missingEvidence: string[] = [];
  if (focus.recruiting) {
    missingEvidence.push(
      "This extract has no requisition or candidate dates, so Time to Fill cannot be answered.",
    );
  }
  if (!reviewSource && !performanceSource) {
    missingEvidence.push("No talent-review status or overall performance column was found.");
  }
  if (objectivesSource && populationRows.every((row) => /not started|^$/i.test(cell(row, objectivesSource)))) {
    missingEvidence.push(
      "Objectives Summary is Not Started on every row, so goal quality cannot be scored.",
    );
  }

  let conclusion: string;
  const answerable = Boolean(reviewSource || performanceSource || appraisalSource);

  if (focus.recruiting && !focus.completeness && !focus.performance) {
    conclusion =
      "This file cannot answer a recruiting-funnel question. It is an employee talent-review / appraisal extract with no requisition or candidate dates.";
  } else if (!answerable) {
    conclusion =
      "The file looks like a people extract, but the columns needed to answer this question were not found.";
  } else {
    const reviewClause = `${pctLabel(reviewed.length, total)} meet the current “reviewed” rule`;
    const appraisalClause = `Appraisal Summary is COMPLETED for ${pctLabel(appraisalCompleted.length, total)}`;
    const performanceClause =
      performanceCounts.size > 0
        ? `Among reviewed rows, Overall Performance is ${topEntries(performanceCounts)
            .map(([label, count]) => `${label} ${formatNumber(count)}`)
            .join(", ")}.`
        : "";
    const riskClause =
      placementRisk > 0
        ? ` ${formatNumber(placementRisk)} reviewed rows are Not Well Placed or Performance Issue.`
        : "";
    const retentionClause =
      retentionRated > 0
        ? retentionMeaning === "flight_risk"
          ? ` ${formatNumber(retentionLow)} of ${formatNumber(retentionRated)} rated rows are Retention = Low and are treated as flight risk.`
          : ` Retention is filled on ${formatNumber(retentionRated)} rows, including ${formatNumber(retentionLow)} Low — meaning is not confirmed.`
        : "";
    const concentrationClause =
      concentrated && concentrated[1].unreviewed > 0
        ? ` Unreviewed rows concentrate in the largest unfinished leadership area (${formatNumber(concentrated[1].unreviewed)} of ${formatNumber(concentrated[1].total)} there).`
        : "";
    const populationNote =
      statusSource || typeSource
        ? ` The current population includes ${formatNumber(active)} active assignments and ${formatNumber(terminated)} terminated / ex-employee rows.`
        : "";

    if (focus.retention && !focus.completeness) {
      conclusion = `Retention can be described only where the field is filled. ${retentionClause.trim() || "No Retention values were found."} Confirm the Low definition before using it as an action trigger.`;
    } else if (focus.placement && !focus.completeness) {
      conclusion = `Placement is available on reviewed rows. High Potential = ${formatNumber(highPotential)}.${riskClause} Placement codes should not be turned into actions until the company meaning is confirmed.`;
    } else {
      conclusion = `Talent review is only partly executed in this extract. ${reviewClause}. ${appraisalClause}.${performanceClause ? ` ${performanceClause}` : ""}${riskClause}${retentionClause}${concentrationClause}${populationNote}`;
    }
  }

  return {
    scenario: "talent_review",
    suggestedQuestion: suggestAskQuestion(dataset.name),
    question,
    answerable: answerable && !(focus.recruiting && !focus.completeness && !focus.performance),
    conclusion: conclusion.trim(),
    columnsUsed,
    metrics,
    pendingDefinitions: talentDefinitions(confirmations),
    assumptions,
    approvedDefinitions,
    missingEvidence,
  };
}

function monthLabel(month: string) {
  const [year, mon] = month.split("-");
  if (!year || !mon) return month;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(mon) - 1, 1)));
}

function joinSegments(
  segments: Array<{ segment: string; count: number }> | undefined,
  limit = 5,
) {
  const list = [...(segments ?? [])].sort((a, b) => b.count - a.count);
  const total = list.reduce((sum, item) => sum + item.count, 0);
  return {
    total,
    text: list
      .slice(0, limit)
      .map((item) => `${item.segment} ${pctLabel(item.count, total)}`)
      .join("; "),
  };
}

function joinRecord(record: Record<string, number> | undefined, limit = 5) {
  const list = Object.entries(record ?? {})
    .map(([segment, count]) => ({ segment, count }))
    .sort((a, b) => b.count - a.count);
  return joinSegments(list, limit);
}

function headcountDefinitions(confirmations: AskConfirmations): AskDefinition[] {
  return [
    {
      id: "headcount_meaning",
      label: "What should count as official headcount?",
      why: "This file is employee × month. Latest-month rows and distinct people are different numbers.",
      kind: kindFor("headcount_meaning", confirmations),
      options: [
        { id: "latest_month", label: "Row count in the latest snapshot month" },
        { id: "unique_people", label: "Distinct employee IDs across the whole file" },
      ],
    },
  ];
}

function analyzeWorkforceCuts(
  dataset: LocalDataset,
  question: string,
  confirmations: AskConfirmations,
  scenario: AskScenario,
): Omit<
  AskFileResult,
  "fileSummary" | "structure" | "qualityScore" | "qualityCaption" | "headerLayout"
> {
  const focus = questionFocus(question);
  const meaning = confirmations.headcount_meaning ?? "latest_month";
  const aggregates = dataset.aggregates;
  const monthly = aggregates?.monthlyHeadcount ?? [];
  const latestMonth = monthly.at(-1);
  const firstMonth = monthly[0];
  const uniquePeople = aggregates?.uniqueEmployees ?? 0;
  const statusCut = joinRecord(aggregates?.statusCounts);
  const hireYears = (aggregates?.hireYearCounts ?? []).map((item) => ({
    segment: item.year,
    count: item.count,
  }));
  const hireCut = joinSegments(hireYears);
  const mixCuts = Object.entries(aggregates?.mixCounts ?? {})
    .map(([field, segments]) => ({
      field,
      label: canonicalPeopleFields[field]?.label ?? field,
      ...joinSegments(segments),
    }))
    .filter((cut) => cut.total > 0);
  const latestCut = joinSegments(aggregates?.latestMonthSegments);
  const latestCutField = aggregates?.latestMonthSegmentField
    ? canonicalPeopleFields[aggregates.latestMonthSegmentField]?.label ??
      aggregates.latestMonthSegmentField
    : null;

  const headlineValue =
    meaning === "unique_people"
      ? uniquePeople
      : (latestMonth?.count ?? uniquePeople);
  const headlineLabel =
    meaning === "unique_people"
      ? "distinct employees across the file"
      : latestMonth
        ? `employee × month rows in ${monthLabel(latestMonth.month)}`
        : "snapshot rows";

  const metrics: AskMetric[] = [
    {
      name: "Official headcount used for this answer",
      formula:
        meaning === "unique_people"
          ? "Count of distinct employee IDs across all snapshot rows"
          : "Row count in the latest snapshot month at employee × month grain",
      value: `${formatNumber(headlineValue)} ${headlineLabel}`,
      status: confirmations.headcount_meaning ? "calculated" : "assumption",
    },
    {
      name: "Unique employees in file",
      formula: "Distinct employee IDs counted while parsing the full file",
      value: formatNumber(uniquePeople),
      status: "calculated",
    },
  ];

  if (latestMonth && firstMonth) {
    metrics.push({
      name: "Monthly headcount range",
      formula: "Full-file count of snapshot rows grouped by snapshot month",
      value: `${monthLabel(firstMonth.month)} ${formatNumber(firstMonth.count)} → ${monthLabel(latestMonth.month)} ${formatNumber(latestMonth.count)} (${formatNumber(monthly.length)} months)`,
      status: "calculated",
    });
  }
  if (statusCut.total > 0) {
    metrics.push({
      name: "Workforce status mix",
      formula: "Full-file snapshot rows grouped by workforce status / data flag",
      value: statusCut.text,
      status: "calculated",
    });
  }
  if (latestCut.total > 0 && latestCutField) {
    metrics.push({
      name: `Latest month by ${latestCutField}`,
      formula: `Snapshot rows in ${latestMonth ? monthLabel(latestMonth.month) : "the latest month"} grouped by ${latestCutField}`,
      value: latestCut.text,
      status: "calculated",
    });
  }
  for (const cut of mixCuts.filter((item) => item.field !== "workforce_status")) {
    metrics.push({
      name: `${cut.label} mix`,
      formula: `Full-file snapshot rows grouped by ${cut.label}`,
      value: cut.text,
      status: "calculated",
    });
  }
  if (hireCut.total > 0) {
    metrics.push({
      name: "Hire-year mix",
      formula: "Distinct employees grouped by year of hire / start date",
      value: hireCut.text,
      status: "calculated",
    });
  }

  const presentCuts = [
    monthly.length > 0 ? "snapshot month" : null,
    statusCut.total > 0 ? "workforce status" : null,
    ...mixCuts
      .filter((item) => item.field !== "workforce_status")
      .map((item) => item.label.toLowerCase()),
    hireCut.total > 0 ? "hire year" : null,
  ].filter((item): item is string => Boolean(item));

  const usefulCuts = [
    "country",
    "department",
    "region",
    "job_title",
    "tenure_band",
  ] as const;
  const missingCuts = usefulCuts.filter((field) => !source(dataset, field));

  const missingEvidence: string[] = [];
  if (focus.recruiting) {
    missingEvidence.push(
      "This snapshot has no requisition or candidate dates, so Time to Fill cannot be answered.",
    );
  }
  if (missingCuts.length > 0) {
    missingEvidence.push(
      `These common workforce cuts are not in the file: ${missingCuts
        .map((field) => canonicalPeopleFields[field]?.label ?? field)
        .join(", ")}.`,
    );
  }

  const mixSentence = [
    statusCut.total > 0 ? `Workforce status across snapshot rows: ${statusCut.text}.` : null,
    latestCut.total > 0 && latestCutField
      ? `In the latest month, ${latestCutField} is ${latestCut.text}.`
      : null,
    mixCuts
      .filter((item) => item.field !== "workforce_status")
      .slice(0, 2)
      .map((cut) => `${cut.label}: ${cut.text}.`)
      .join(" "),
    hireCut.total > 0 ? `Hire year among employees: ${hireCut.text}.` : null,
  ]
    .filter((item): item is string => Boolean(item && item.trim()))
    .join(" ");

  const conclusion =
    presentCuts.length === 0
      ? "The file was profiled, but no usable population cut (month, status, country, or hire year) could be calculated."
      : `The file can answer population distribution only on the cuts it actually contains: ${presentCuts.join(", ")}. Using ${formatNumber(headlineValue)} ${headlineLabel} as headcount. ${mixSentence}${
          missingCuts.length > 0
            ? ` It cannot cut the population by ${missingCuts
                .map((field) => canonicalPeopleFields[field]?.label ?? field)
                .join(", ")
                .toLowerCase()}.`
            : ""
        }`;

  const columnsUsed = [
    usedColumn(dataset, dataset.rows, "snapshot_month"),
    usedColumn(dataset, dataset.rows, "employee_id"),
    usedColumn(dataset, dataset.rows, "workforce_status"),
    usedColumn(dataset, dataset.rows, "hire_date"),
    usedColumn(dataset, dataset.rows, "country"),
    usedColumn(dataset, dataset.rows, "department"),
    usedColumn(dataset, dataset.rows, "region"),
    usedColumn(dataset, dataset.rows, "job_title"),
    usedColumn(dataset, dataset.rows, "tenure_band"),
    usedColumn(dataset, dataset.rows, "employment_status"),
  ].filter((column): column is NonNullable<typeof column> => Boolean(column));

  return {
    scenario,
    suggestedQuestion: suggestAskQuestion(dataset.name),
    question,
    answerable: presentCuts.length > 0 && !focus.recruiting,
    conclusion: conclusion.trim(),
    columnsUsed,
    metrics,
    pendingDefinitions: headcountDefinitions(confirmations),
    assumptions: [
      !confirmations.headcount_meaning
        ? "Official headcount is treated as the latest snapshot-month row count until you confirm another definition."
        : null,
      statusCut.total > 0
        ? "Workforce status mix is counted on employee × month rows, not on a de-duplicated people list."
        : null,
      aggregates?.sampled
        ? "Column fill rates come from a local sample; monthly and mix counts use the full file."
        : null,
    ].filter((item): item is string => Boolean(item)),
    approvedDefinitions: [
      confirmations.headcount_meaning
        ? `Headcount: ${headcountDefinitions(confirmations)[0].options.find((option) => option.id === meaning)?.label}`
        : null,
    ].filter((item): item is string => Boolean(item)),
    missingEvidence,
  };
}

function analyzeGeneric(
  dataset: LocalDataset,
  question: string,
  scenario: AskScenario,
): Omit<
  AskFileResult,
  "fileSummary" | "structure" | "qualityScore" | "qualityCaption" | "headerLayout"
> {
  const focus = questionFocus(question);
  const columnsUsed = dataset.columns
    .filter((column) => column.canonicalField && !column.likelyPii)
    .slice(0, 8)
    .map((column) => ({
      source: column.name,
      meaning: canonicalPeopleFields[column.canonicalField ?? ""]?.label ?? column.name,
      fillRate: 100 - column.nullPercent,
    }));

  const missingEvidence: string[] = [];
  if (focus.recruiting && scenario !== "recruiting") {
    missingEvidence.push("Requisition open and accepted-offer dates are not in this file.");
  }
  if (focus.retention && !source(dataset, "retention_risk") && !source(dataset, "attrition")) {
    missingEvidence.push("No retention or attrition column was found.");
  }

  const conclusion =
    missingEvidence.length > 0
      ? `This file cannot fully answer the question yet. ${missingEvidence[0]} What it can show is the inferred entity (${dataset.entity}) and the mapped columns listed below.`
      : `The mapped columns support a ${dataset.entity} view at grain “${dataset.grain}”. Confirm the business question if you need a more specific conclusion.`;

  return {
    scenario,
    suggestedQuestion: suggestAskQuestion(dataset.name),
    question,
    answerable: missingEvidence.length === 0,
    conclusion,
    columnsUsed,
    metrics: [
      {
        name: "Rows",
        formula: "Count of non-empty rows kept after local parsing",
        value: formatNumber(dataset.rowCount),
        status: "calculated",
      },
      {
        name: "Mapped fields",
        formula: "Source headers matched to the canonical People schema",
        value: formatNumber(dataset.mappings.length),
        status: "calculated",
      },
    ],
    pendingDefinitions: [],
    assumptions: ["Column meanings are inferred from header names until you confirm them."],
    approvedDefinitions: [],
    missingEvidence,
  };
}

export function analyzeAskFile(
  dataset: LocalDataset,
  question: string,
  confirmations: AskConfirmations = {},
): AskFileResult {
  const scenario = detectScenario(dataset);
  const asked = question.trim() || suggestAskQuestion(dataset.name);
  const core =
    scenario === "talent_review"
      ? analyzeTalentReview(dataset, asked, confirmations)
      : scenario === "headcount" || scenario === "roster"
        ? analyzeWorkforceCuts(dataset, asked, confirmations, scenario)
        : analyzeGeneric(dataset, asked, scenario);

  const qualityCaption =
    scenario === "talent_review"
      ? "Score reflects identity completeness and internal consistency, not how finished the talent-review cycle is. Sparse review fields are a finding, not a broken file."
      : "Score reflects required-field completeness, grain uniqueness, and mapping confidence.";

  return {
    ...core,
    fileSummary: fileSummarySentence(dataset, scenario, dataset.rowCount),
    structure: structureSentence(dataset, scenario),
    qualityScore: dataset.health,
    qualityCaption,
    headerLayout: dataset.aggregates?.headerLayout ?? "single",
  };
}

export function buildAskInsights(result: AskFileResult): AskInsight[] {
  if (result.scenario === "headcount" || result.scenario === "roster") {
    const icons: AskInsight["icon"][] = ["users", "clock", "check", "target", "alert", "shield"];
    return result.metrics.slice(0, 6).map((metric, index) => ({
      id: `cut-${index}`,
      icon: icons[index] ?? "users",
      title: metric.name,
      body: metric.value,
      evidence: metric.formula,
    }));
  }

  if (result.scenario !== "talent_review") {
    return result.metrics.slice(0, 3).map((metric, index) => ({
      id: `metric-${index}`,
      icon: index === 0 ? "check" : "users",
      title: metric.name,
      body: metric.value,
      evidence: metric.formula,
    }));
  }

  const review = result.metrics.find((metric) => metric.name === "Talent review started");
  const appraisal = result.metrics.find((metric) => metric.name === "Appraisal completed");
  const performance = result.metrics.find((metric) => metric.name === "Performance mix among reviewed");
  const placement = result.metrics.find((metric) => metric.name === "Placement mix among reviewed");
  const retention = result.metrics.find((metric) => metric.name === "Retention = Low among rated");
  const insights: AskInsight[] = [];

  if (review) {
    insights.push({
      id: "review-coverage",
      icon: "alert",
      title: "Review coverage is incomplete",
      body: `${review.value} meet the current reviewed rule.`,
      evidence: review.formula,
    });
  }
  if (appraisal) {
    insights.push({
      id: "appraisal-complete",
      icon: "clock",
      title: "Appraisal completion lags the roster",
      body: `${appraisal.value} are COMPLETED.`,
      evidence: appraisal.formula,
    });
  }
  if (performance) {
    insights.push({
      id: "performance-mix",
      icon: "users",
      title: "Performance ratings exist only where review started",
      body: performance.value,
      evidence: performance.formula,
    });
  }
  if (placement) {
    insights.push({
      id: "placement-risk",
      icon: "target",
      title: "Placement codes are available for reviewed people",
      body: placement.value,
      evidence: placement.formula,
    });
  }
  if (retention) {
    insights.push({
      id: "retention-low",
      icon: "shield",
      title: "Retention Low needs a confirmed meaning",
      body: retention.value,
      evidence: retention.formula,
    });
  }
  if (result.missingEvidence.some((item) => /objectives/i.test(item))) {
    insights.push({
      id: "objective-gap",
      icon: "alert",
      title: "Objectives were not captured",
      body: "Every Objectives and Competency summary is Not Started, including rows with a completed appraisal.",
      evidence: "Objectives Summary and Competency Summary versus Appraisal Summary.",
    });
  }

  return insights;
}

export function detectAskScenario(dataset: LocalDataset) {
  return detectScenario(dataset);
}
