import { asList, asRecord, formatRate, isoDate } from "../format";
import { identityLabel } from "../demo-identities";
import { aggregateVisibleBy, finiteRate, visibleBreakdownCells } from "../case3-view";
import { suppressionCopy } from "./suppression-copy";
import type { PeopleObservedFact, PeopleToolCall } from "./types";

export function metricVersion(id: string | undefined, version = 1): string | undefined {
  return id ? `${id}@${version}` : undefined;
}

export function num(value: unknown): number | null {
  return finiteRate(value);
}

export function formatMetricValue(payload: unknown): string {
  const row = asRecord(payload);
  if (row.denied === true) return "restricted";
  const value = num(row.value);
  if (value == null) return "unavailable";
  const unit = String(row.unit ?? "");
  if (unit === "rate") return formatRate(value);
  if (unit === "hours") return `${value.toFixed(1)} hours`;
  if (unit === "ratio") return value.toFixed(2);
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : "unavailable";
}

export function pickNamed(
  results: Array<{ call: PeopleToolCall; result: unknown }>,
  name: string,
  index = 0,
): Record<string, unknown> {
  const matches = results.filter((row) => row.call.name === name);
  return asRecord(matches[index]?.result);
}

export function fact(text: string, extra: Partial<PeopleObservedFact> = {}): PeopleObservedFact {
  const asOf = extra.as_of ?? extra.asOf;
  return {
    text,
    filters: extra.filters ?? {},
    ...extra,
    as_of: asOf,
    asOf: asOf,
  };
}

export function tracedFacts(
  facts: PeopleObservedFact[],
  results: Array<{ call: PeopleToolCall; ok: boolean }>,
): PeopleObservedFact[] {
  const names = new Set<string>(results.filter((row) => row.ok).map((row) => row.call.name));
  return facts.filter((item) => !item.source_tool || names.has(item.source_tool));
}

function collectSuppressed(breakdown: Record<string, unknown>) {
  const cells = asList(breakdown.cells);
  const minCell = num(breakdown.min_cell) ?? 50;
  return cells
    .filter((cell) => cell.suppressed === true)
    .map((cell) => ({
      dimension: String(breakdown.dimension ?? ""),
      key: String(cell.key ?? ""),
      n: num(cell.n),
      min_cell: minCell,
    }));
}

function engineeringMetric(results: Array<{ call: PeopleToolCall; result: unknown }>) {
  const matches = results.filter((row) => row.call.name === "get_metric");
  const eng = matches.find((row) => asRecord(row.result).job_family === "Engineering") ?? matches[0];
  return asRecord(eng?.result);
}

export type ChipDraft = {
  headline: string;
  facts: PeopleObservedFact[];
  hypotheses: string[];
  suppressed: Array<{ dimension?: string; key?: string; n?: number | null; min_cell?: number }>;
  skillsUsed: string[];
  definition?: unknown;
};

export function composeLocations(
  results: Array<{ call: PeopleToolCall; result: unknown; ok: boolean }>,
  asOf: string,
  identityId: string,
): ChipDraft {
  const eng = engineeringMetric(results);
  const breakdown = pickNamed(results, "get_metric_breakdown");
  const cells = asList(breakdown.cells);
  const minCell = num(breakdown.min_cell) ?? 50;
  const ranked = aggregateVisibleBy(cells, "location_id");
  const top = ranked[0];
  const suppressed = collectSuppressed(breakdown);
  const rate = num(eng.value);
  const asOfDate = isoDate(eng.as_of) || asOf;
  const who = identityLabel(identityId);
  const copy = suppressionCopy({
    hidden: suppressed.length,
    total: cells.length,
    minCell,
    grain: "location × tenure × grade",
  });
  const headline = !top
    ? `At ${who} min_cell ${minCell}, no location slice is visible. Engineering trailing-12m voluntary attrition is ${formatMetricValue(eng)}.`
    : copy.noneHidden
      ? `Engineering trailing-12m voluntary attrition concentrates in ${top.key} (${formatRate(top.rate)}).`
      : `Among cells visible at ${who} min_cell ${minCell}, Engineering trailing-12m voluntary attrition concentrates in ${top.key} (${formatRate(top.rate)}).`;
  const facts = [
    fact(
      `Engineering trailing-12m voluntary attrition: ${formatMetricValue(eng)} as of ${asOfDate}. Grain: trailing-12m (annualized).`,
      {
        source_tool: "get_metric",
        metric_id: metricVersion("voluntary_attrition_rate"),
        filters: { job_family: "Engineering", grain: "trailing_12m" },
        value: rate,
        unit: "rate",
        as_of: asOfDate,
        grain: "trailing-12m (annualized)",
        denied: eng.denied === true,
      },
    ),
    ...ranked.slice(0, 3).map((row) =>
      fact(
        copy.noneHidden
          ? `Location ${row.key}: ${formatRate(row.rate)}.`
          : `Visible location ${row.key}: ${formatRate(row.rate)} (as-of month n used for min_cell).`,
        {
          source_tool: "get_metric_breakdown",
          metric_id: metricVersion("voluntary_attrition_rate"),
          filters: { location_id: row.key, min_cell: minCell },
          value: row.rate,
          unit: "rate",
          as_of: asOfDate,
          grain: "trailing-12m (annualized)",
        },
      ),
    ),
    fact(copy.hiddenFact, {
      source_tool: "get_metric_breakdown",
      filters: { dimension: String(breakdown.dimension ?? "location_tenure_grade"), min_cell: minCell },
      as_of: asOfDate,
      grain: copy.grain,
    }),
  ];
  return {
    headline,
    facts,
    hypotheses: [
      "Location concentration is an observed association after suppression. It does not by itself prove a cause.",
      "Read the visible location ranking before treating any one site as a company-wide problem.",
    ],
    suppressed,
    skillsUsed: [],
  };
}

export function composeNextSteps(
  results: Array<{ call: PeopleToolCall; result: unknown; ok: boolean }>,
  asOf: string,
): ChipDraft {
  const eng = engineeringMetric(results);
  const breakdown = pickNamed(results, "get_metric_breakdown");
  const cells = asList(breakdown.cells);
  const minCell = num(breakdown.min_cell) ?? 50;
  const rankedLoc = aggregateVisibleBy(cells, "location_id");
  const rankedTenure = aggregateVisibleBy(cells, "tenure_band");
  const where = rankedLoc[0]?.key ?? "the highest-rate visible location";
  const tenure = rankedTenure[0]?.key;
  const asOfDate = isoDate(eng.as_of) || asOf;
  const suppressed = collectSuppressed(breakdown);
  const copy = suppressionCopy({
    hidden: suppressed.length,
    total: cells.length,
    minCell,
    grain: "location × tenure × grade",
  });
  const slice = cells
    .filter((cell) => cell.suppressed !== true && num(cell.value) != null)
    .sort((a, b) => Number(b.value) - Number(a.value))[0];
  const sliceLabel = slice
    ? `${String(slice.location_id ?? where)} · ${String(slice.tenure_band ?? "tenure")} · ${String(slice.grade_id ?? "grade")}`
    : where;
  return {
    headline: `Next: inspect the highest-rate Engineering slice (${sliceLabel})${copy.afterMinCell}. Do not launch a company-wide program from hidden cells.`,
    facts: [
      fact(
        `Engineering trailing-12m voluntary attrition: ${formatMetricValue(eng)} as of ${asOfDate}. Grain: trailing-12m (annualized).`,
        {
          source_tool: "get_metric",
          metric_id: metricVersion("voluntary_attrition_rate"),
          filters: { job_family: "Engineering", grain: "trailing_12m" },
          value: num(eng.value),
          unit: "rate",
          as_of: asOfDate,
          grain: "trailing-12m (annualized)",
        },
      ),
      fact(
        copy.noneHidden
          ? `Highest-rate cell: ${sliceLabel}${slice ? ` at ${formatRate(slice.value)}` : ""}.`
          : `Highest-rate visible cell after min_cell ${minCell}: ${sliceLabel}${slice ? ` at ${formatRate(slice.value)}` : ""}.`,
        {
          source_tool: "get_metric_breakdown",
          metric_id: metricVersion("voluntary_attrition_rate"),
          filters: { min_cell: minCell },
          value: num(slice?.value),
          unit: "rate",
          as_of: asOfDate,
          grain: "trailing-12m (annualized)",
        },
      ),
      fact(
        copy.noneHidden
          ? copy.hiddenFact
          : `${copy.hiddenFact} Hidden cells are not evidence for a company-wide action.`,
        {
          source_tool: "get_metric_breakdown",
          filters: { min_cell: minCell },
          as_of: asOfDate,
          grain: copy.grain,
        },
      ),
    ],
    hypotheses: [
      copy.noneHidden
        ? `Pull the ${where}${tenure ? ` / ${tenure}` : ""} Engineering file: manager changes, hiring mix, and whether the rate is new or persistent.`
        : `Pull the ${where}${tenure ? ` / ${tenure}` : ""} Engineering file that remains visible after min_cell ${minCell}: manager changes, hiring mix, and whether the rate is new or persistent.`,
      "Do not use the APAC HRIS replay, or any hidden cell, as the brief for a company-wide retention program.",
    ],
    suppressed,
    skillsUsed: [],
  };
}

export function composeTenure(
  results: Array<{ call: PeopleToolCall; result: unknown; ok: boolean }>,
  asOf: string,
  identityId: string,
): ChipDraft {
  const eng = engineeringMetric(results);
  const breakdown = pickNamed(results, "get_metric_breakdown");
  const cells = asList(breakdown.cells);
  const minCell = num(breakdown.min_cell) ?? 50;
  const ranked = aggregateVisibleBy(cells, "tenure_band");
  const suppressed = collectSuppressed(breakdown);
  const asOfDate = isoDate(eng.as_of) || asOf;
  const visibleCells = visibleBreakdownCells(cells).filter((row) => String(row.tenure_band ?? "").trim());
  const bandKeys = [
    ...new Set(cells.map((cell) => String(cell.tenure_band ?? "").trim()).filter(Boolean)),
  ];
  const hiddenBands = bandKeys.filter((key) => !ranked.some((row) => row.key === key)).length;
  const copy = suppressionCopy({
    hidden: hiddenBands,
    total: bandKeys.length,
    minCell,
    grain: "tenure_band",
  });
  const who = identityLabel(identityId);
  const allHidden = visibleCells.length === 0 || ranked.length === 0 || copy.allHidden;

  if (allHidden) {
    return {
      headline: `At ${who} access, all tenure bands fall below min_cell ${minCell}; only the Engineering total is visible.`,
      facts: [
        fact(
          `Engineering trailing-12m voluntary attrition: ${formatMetricValue(eng)} as of ${asOfDate}. Grain: trailing-12m (annualized).`,
          {
            source_tool: "get_metric",
            metric_id: metricVersion("voluntary_attrition_rate"),
            filters: { job_family: "Engineering", grain: "trailing_12m" },
            value: num(eng.value),
            unit: "rate",
            as_of: asOfDate,
            grain: "trailing-12m (annualized)",
          },
        ),
        fact(
          `Tenure-band cells are hidden at min_cell ${minCell} (n is as-of month headcount). No tenure rate is substituted.`,
          {
            source_tool: "get_metric_breakdown",
            filters: { dimension: String(breakdown.dimension ?? "location_tenure"), min_cell: minCell },
            as_of: asOfDate,
            grain: "trailing-12m (annualized)",
          },
        ),
      ],
      hypotheses: [
        `Ask with an identity whose min_cell is below ${minCell} if you need tenure bands that remain hidden here.`,
      ],
      suppressed,
      skillsUsed: [],
    };
  }

  const top = ranked[0];
  return {
    headline: copy.noneHidden
      ? `Engineering tenure bands peak in ${top.key} at ${formatRate(top.rate)} (trailing-12m, as of ${asOfDate}).`
      : `Visible Engineering tenure bands after min_cell ${minCell} peak in ${top.key} at ${formatRate(top.rate)} (trailing-12m, as of ${asOfDate}).`,
    facts: [
      fact(
        `Engineering trailing-12m voluntary attrition: ${formatMetricValue(eng)} as of ${asOfDate}. Grain: trailing-12m (annualized).`,
        {
          source_tool: "get_metric",
          metric_id: metricVersion("voluntary_attrition_rate"),
          filters: { job_family: "Engineering", grain: "trailing_12m" },
          value: num(eng.value),
          unit: "rate",
          as_of: asOfDate,
          grain: "trailing-12m (annualized)",
        },
      ),
      ...ranked.map((row) =>
        fact(
          copy.noneHidden
            ? `Tenure ${row.key}: ${formatRate(row.rate)}.`
            : `Tenure ${row.key}: ${formatRate(row.rate)} among cells still visible at min_cell ${minCell}.`,
          {
            source_tool: "get_metric_breakdown",
            metric_id: metricVersion("voluntary_attrition_rate"),
            filters: { tenure_band: row.key, min_cell: minCell },
            value: row.rate,
            unit: "rate",
            as_of: asOfDate,
            grain: "trailing-12m (annualized)",
          },
        ),
      ),
      fact(copy.hiddenFact, {
        source_tool: "get_metric_breakdown",
        filters: { min_cell: minCell, grain: "tenure_band" },
        as_of: asOfDate,
        grain: copy.grain,
      }),
    ],
    hypotheses: [
      "Tenure differences are associations after suppression. They are not a claim that tenure causes quits.",
    ],
    suppressed,
    skillsUsed: [],
  };
}

export function composeCompensation(
  results: Array<{ call: PeopleToolCall; result: unknown; ok: boolean }>,
  asOf: string,
  identityId: string,
): ChipDraft {
  const row = pickNamed(results, "get_metric");
  const asOfDate = isoDate(row.as_of) || asOf;
  const who = identityLabel(identityId);
  const n = num(row.n);
  const nClause = n != null ? ` (n=${Math.round(n)} Engineering certified workers)` : "";
  if (row.denied === true) {
    return {
      headline: `Compensation positioning is not available to ${who}. No substitute number is shown.`,
      facts: [
        fact(
          `As of ${asOfDate}, certified Engineering median compa-ratio is not available to ${who}${
            row.reason ? ` (${String(row.reason)})` : ""
          }. Grain: month snapshot. min_cell does not create a fallback value.`,
          {
            source_tool: "get_metric",
            metric_id: metricVersion("compa_ratio_median"),
            filters: { job_family: "Engineering" },
            value: null,
            denied: true,
            as_of: asOfDate,
            grain: "month (as-of)",
          },
        ),
      ],
      hypotheses: [
        row.reason === "org_scope"
          ? `${who} can read Engineering pay positioning only. A different org is not substituted.`
          : "Related Signals control/slice medians, if shown, are scenario aggregates and are not this certified metric.",
      ],
      suppressed: [],
      skillsUsed: [],
    };
  }
  return {
    headline: `Engineering median compa-ratio is ${formatMetricValue(row)}${nClause} as of ${asOfDate}.`,
    facts: [
      fact(
        `Certified calculator: ${formatMetricValue(row)}${nClause} as of ${asOfDate}. Grain: month (as-of).`,
        {
          source_tool: "get_metric",
          metric_id: metricVersion("compa_ratio_median"),
          filters: { job_family: "Engineering" },
          value: num(row.value),
          as_of: asOfDate,
          grain: "month (as-of)",
        },
      ),
    ],
    hypotheses: [
      "Compa-ratio is a pay-positioning snapshot. It does not by itself explain attrition.",
    ],
    suppressed: [],
    skillsUsed: [],
  };
}

export function composeSkills(
  results: Array<{ call: PeopleToolCall; result: unknown; ok: boolean }>,
  asOf: string,
): ChipDraft {
  const payload = pickNamed(results, "get_skill_coverage");
  const rows = asList(payload.rows);
  const asOfDate = isoDate(payload.as_of) || asOf;
  const ranked = [...rows]
    .map((row) => ({
      org: String(row.org_id ?? "Engineering"),
      coverage: num(row.coverage_ratio),
    }))
    .filter((row) => row.coverage != null)
    .sort((a, b) => (a.coverage ?? 0) - (b.coverage ?? 0));
  const lowest = ranked[0];
  const headline = lowest
    ? `Engineering skill coverage as of ${asOfDate} is lowest in ${lowest.org} at ${formatRate(lowest.coverage)} (job-family aggregate).`
    : `Engineering skill coverage is not in the serving result for this identity as of ${asOfDate}.`;
  const facts: PeopleObservedFact[] = [
    fact(
      `Skill coverage grain: job-family aggregate. As-of ${asOfDate}. This table does not list workers; min_cell is not used to hide people.`,
      {
        source_tool: "get_skill_coverage",
        metric_id: metricVersion("skill_coverage"),
        filters: { job_family: "Engineering", grain: "job_family" },
        as_of: asOfDate,
        grain: "job_family",
      },
    ),
  ];
  if (lowest?.coverage != null) {
    facts.push(
      fact(`Largest coverage gap (lowest ratio): ${lowest.org} at ${formatRate(lowest.coverage)}.`, {
        source_tool: "get_skill_coverage",
        metric_id: metricVersion("skill_coverage"),
        filters: { org_id: lowest.org, job_family: "Engineering" },
        value: lowest.coverage,
        unit: "rate",
        as_of: asOfDate,
        grain: "job_family",
      }),
    );
  }
  for (const row of ranked.slice(1, 3)) {
    if (row.coverage == null) continue;
    facts.push(
      fact(`Also visible: ${row.org} at ${formatRate(row.coverage)}.`, {
        source_tool: "get_skill_coverage",
        filters: { org_id: row.org },
        value: row.coverage,
        unit: "rate",
        as_of: asOfDate,
        grain: "job_family",
      }),
    );
  }
  return {
    headline,
    facts,
    hypotheses: [
      "Coverage ratios are observed aggregates. They are not a ranked list of people or a hiring requisition.",
    ],
    suppressed: [],
    skillsUsed: ["get_skill_coverage"],
  };
}

export function composeDefinition(
  results: Array<{ call: PeopleToolCall; result: unknown; ok: boolean }>,
  planMetric?: string,
): ChipDraft {
  const def = pickNamed(results, "get_metric_definition");
  const metricId = String(def.metric_id ?? planMetric ?? "metric");
  return {
    headline: String(def.business_definition ?? `${metricId} definition`),
    facts: [
      fact(`Owner: ${String(def.owner ?? "People Analytics")}`, {
        source_tool: "get_metric_definition",
        metric_id: metricVersion(metricId),
        filters: {},
      }),
      fact(`Formula: ${String(def.formula ?? def.formula_sql ?? "")}`, {
        source_tool: "get_metric_definition",
        filters: {},
      }),
      fact(`Version ${String(def.version ?? 1)}. Certified snapshot as-of 2026-08-31. min_cell does not apply to a definition lookup.`, {
        source_tool: "get_metric_definition",
        filters: {},
        as_of: "2026-08-31",
        grain: "definition",
      }),
    ],
    hypotheses: [],
    suppressed: [],
    skillsUsed: [],
    definition: def,
  };
}
