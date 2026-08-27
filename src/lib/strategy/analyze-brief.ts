import { getCatalogItem, strategyCatalog } from "@/lib/strategy/catalog";
import { metricTemplates } from "@/lib/strategy/metric-templates";
import type {
  CatalogItem,
  MetricProposal,
  StrategyAnalysis,
  StrategyBrief,
  StrategyCategory,
  StrategyIntent,
} from "@/types/strategy";

const categoryKeywords: Array<{ category: StrategyCategory; keywords: string[] }> = [
  {
    category: "Talent Acquisition",
    keywords: ["hire", "hiring", "recruit", "time to fill", "time to hire", "offer", "requisition", "candidate", "sourcing"],
  },
  {
    category: "Retention",
    keywords: ["attrition", "retention", "turnover", "exit", "regrettable", "flight"],
  },
  {
    category: "Skills & Capability",
    keywords: ["skill", "capability", "learning", "academy", "reskill", "upskill", "proficiency"],
  },
  {
    category: "Leadership",
    keywords: ["manager", "leadership", "successor", "succession", "bench", "span of control"],
  },
  {
    category: "Internal Mobility",
    keywords: ["internal fill", "mobility", "marketplace", "internal candidate", "career path"],
  },
  {
    category: "Engagement & Culture",
    keywords: ["engagement", "culture", "enps", "experience", "recognition", "hybrid"],
  },
  {
    category: "DEI",
    keywords: ["inclusion", "representation", "equity", "slate", "diversity", "pay equity"],
  },
  {
    category: "Workforce Planning",
    keywords: ["headcount", "workforce plan", "contractor", "fte", "snapshot", "demand"],
  },
  {
    category: "Compensation",
    keywords: ["pay", "comp", "reward", "salary", "compa", "bonus"],
  },
  {
    category: "Performance",
    keywords: ["performance", "high performer", "calibration", "goal", "rating"],
  },
  {
    category: "Wellbeing",
    keywords: ["wellbeing", "burnout", "overtime", "absence", "workload", "fatigue"],
  },
  {
    category: "People Operations",
    keywords: ["data quality", "completeness", "sla", "hr process", "privacy", "operating model"],
  },
];

export function classifyCustomStatement(text: string): StrategyCategory {
  const hay = text.toLowerCase();
  let best: StrategyCategory = "Workforce Planning";
  let score = 0;
  for (const entry of categoryKeywords) {
    const hits = entry.keywords.filter((keyword) => hay.includes(keyword)).length;
    if (hits > score) {
      score = hits;
      best = entry.category;
    }
  }
  return best;
}

function templatesFor(ids: string[]): MetricProposal[] {
  return ids.flatMap((id) => {
    const template = metricTemplates[id];
    if (!template) return [];
    return [
      {
        ...template,
        target: "",
        status: "Proposed" as const,
        origin: "catalog" as const,
      },
    ];
  });
}

function nearestCatalogItem(kind: StrategyIntent, category: StrategyCategory) {
  return (
    strategyCatalog.find((item) => item.kind === kind && item.category === category) ??
    strategyCatalog.find((item) => item.category === category) ??
    strategyCatalog[0]
  );
}

export function metricsFromCatalogItem(item: CatalogItem): MetricProposal[] {
  return templatesFor(item.metricIds);
}

export function buildLocalAnalysis(
  kind: StrategyIntent,
  title: string,
  statement: string,
  category: StrategyCategory | "Custom",
): StrategyAnalysis {
  const label = kind === "strategy" ? "strategy" : "problem";
  return {
    summary: `This ${label} is framed as a measurable People question in ${category === "Custom" ? "a custom category" : category}. Recommended metrics distinguish an outcome, guardrails, and drivers. Targets are optional until evidence exists.`,
    decisions: [
      "Which metric is the outcome versus a guardrail?",
      "What population and time window make the metric comparable?",
      "Which required fields are missing before the number can be calculated?",
    ],
    assumptions: [
      "Catalog metrics are proposals until a human confirms the definition.",
      "Suggested targets are starting points, not approved company standards.",
    ],
    missingEvidence: [
      "Current baseline is unknown until local People files are profiled.",
      "Protected attributes are not used as action drivers.",
    ],
    source: "catalog",
    modelNote: "Deterministic catalog proposal · AI not required",
  };
}

export function createBriefFromCatalog(item: CatalogItem): StrategyBrief {
  return {
    intentKind: item.kind,
    source: "catalog",
    catalogId: item.id,
    category: item.category,
    title: item.title,
    statement: item.statement,
    population: item.population ?? "To be confirmed",
    analysis: buildLocalAnalysis(item.kind, item.title, item.statement, item.category),
    metrics: metricsFromCatalogItem(item),
    targetsSkipped: false,
  };
}

export function createBriefFromCustom(
  kind: StrategyIntent,
  title: string,
  statement: string,
): StrategyBrief {
  const category = classifyCustomStatement(`${title} ${statement}`);
  const nearest = nearestCatalogItem(kind, category);
  return {
    intentKind: kind,
    source: "custom",
    category,
    title: title.trim() || (kind === "strategy" ? "Custom strategy" : "Custom problem"),
    statement: statement.trim(),
    population: "To be confirmed",
    analysis: {
      ...buildLocalAnalysis(kind, title, statement, category),
      summary: `Custom ${kind} classified as ${category}. Metrics are borrowed from the nearest catalog pattern (“${nearest.title}”) and remain proposals.`,
    },
    metrics: metricsFromCatalogItem(nearest),
    targetsSkipped: false,
  };
}

export function analyzeStrategyBrief(input: {
  catalogId?: string;
  kind: StrategyIntent;
  title: string;
  statement: string;
}): StrategyBrief {
  if (input.catalogId) {
    const item = getCatalogItem(input.catalogId);
    if (item) return createBriefFromCatalog(item);
  }
  return createBriefFromCustom(input.kind, input.title, input.statement);
}

export function applyTargets(
  metrics: MetricProposal[],
  targets: Record<string, string>,
  skipped: boolean,
): MetricProposal[] {
  return metrics.map((metric) => ({
    ...metric,
    target: skipped ? "" : (targets[metric.id] ?? metric.target),
    status: skipped ? "Proposed" : metric.target || targets[metric.id] ? "Confirmed" : "Proposed",
  }));
}
