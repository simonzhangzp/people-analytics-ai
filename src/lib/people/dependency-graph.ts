/**
 * Builds the source → canonical entity → transformation → business rule → metric →
 * mart → agent/tool → case dependency graph for the Metric Governance Card.
 * Pure function over serving payloads; no invented nodes. Rendered client-side.
 */

import { asRecord } from "./format";

export type GraphColumn =
  | "source"
  | "canonical"
  | "transformation"
  | "rule"
  | "metric"
  | "mart"
  | "tool"
  | "case";

export const GRAPH_COLUMNS: Array<{ id: GraphColumn; label: string }> = [
  { id: "source", label: "Source" },
  { id: "canonical", label: "Canonical entity" },
  { id: "transformation", label: "Transformation" },
  { id: "rule", label: "Business rule" },
  { id: "metric", label: "Metric" },
  { id: "mart", label: "Mart / dashboard" },
  { id: "tool", label: "Agent · tool" },
  { id: "case", label: "Case" },
];

export type GraphNode = { id: string; label: string; column: GraphColumn; sub?: string };
export type GraphEdge = { from: string; to: string };
export type DependencyGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

const CASE_FOR_METRIC: Record<string, Array<{ id: string; label: string }>> = {
  headcount: [
    { id: "case-trust", label: "Case 1 · Can I trust this number?" },
    { id: "case-incident", label: "Case 2 · Why did Headcount drop?" },
  ],
  voluntary_attrition_rate: [{ id: "case-attrition", label: "Case 3 · Engineering attrition" }],
};

const TOOLS_FOR_METRIC: Record<string, string[]> = {
  headcount: ["get_metric", "get_metric_definition", "get_lineage"],
  voluntary_attrition_rate: ["get_metric", "get_metric_trend", "get_metric_breakdown"],
};

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((row) => String(row)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;]\s*/)
      .map((row) => row.trim())
      .filter(Boolean);
  }
  return [];
}

function classifyLineageObject(name: string): GraphColumn | null {
  const lower = name.toLowerCase();
  if (/^people_(hist|dim|xw)_/.test(lower)) return "canonical";
  if (/^people_(evt|snap|fact)_/.test(lower)) return "transformation";
  if (/^people_mart_/.test(lower)) return "mart";
  if (/^people_metric|^people_get_/.test(lower)) return "metric";
  if (/\./.test(lower) || /^(frappe|greenhouse|onet|bls)/.test(lower)) return "source";
  return null;
}

export function buildDependencyGraph(input: {
  metricId: string;
  definition: Record<string, unknown>;
  lineageRows: Record<string, unknown>[];
  rules: Record<string, unknown>[];
}): DependencyGraph {
  const def = asRecord(input.definition);
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const metricNode = `metric:${input.metricId}`;

  const add = (node: GraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const link = (from: string, to: string) => {
    if (from !== to && !edges.some((edge) => edge.from === from && edge.to === to)) {
      edges.push({ from, to });
    }
  };

  add({
    id: metricNode,
    label: String(def.metric_name ?? input.metricId),
    column: "metric",
    sub: `v${String(def.version ?? 1)} · ${String(def.status ?? "certified")}`,
  });

  // Lineage rows that name the metric itself (people_metric.<id>, people_get_metric_for(<id>))
  // collapse onto the metric node instead of becoming a second "metric" box.
  const isMetricObject = (name: string) => {
    const lower = name.toLowerCase();
    return (
      lower === `people_metric.${input.metricId}` ||
      lower === `people_metric_${input.metricId}` ||
      lower === `people_get_metric_for(${input.metricId})`
    );
  };
  const nodeIdFor = (name: string) => (isMetricObject(name) ? metricNode : `obj:${name}`);

  // Walk lineage upstream from what the registry declares (source tables, grain table), any row
  // naming the metric, and any row whose note cites one of this metric's business rules,
  // so the chain reaches the original source document, not just the last hop.
  const sources = stringList(def.source_tables);
  const grainTable = typeof def.grain_table === "string" && def.grain_table.trim() ? def.grain_table.trim() : "";
  const ruleIdsForSeed = input.rules.map((rule) => String(rule.rule_id ?? "")).filter(Boolean);
  const reachable = new Set<string>(sources);
  if (grainTable) reachable.add(grainTable);
  for (const row of input.lineageRows) {
    const note = String(row.note ?? "");
    const to = String(row.to_object ?? "");
    const citesRule = ruleIdsForSeed.some((id) => note.includes(id));
    if (note.includes(input.metricId) || to.includes(input.metricId) || citesRule) {
      reachable.add(String(row.from_object ?? ""));
      reachable.add(to);
    }
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of input.lineageRows) {
      const from = String(row.from_object ?? "");
      const to = String(row.to_object ?? "");
      if (to && from && [...reachable].some((name) => to.includes(name) || name.includes(to)) && !reachable.has(from)) {
        reachable.add(from);
        grew = true;
      }
    }
  }
  const relevant = input.lineageRows.filter((row) => {
    const from = String(row.from_object ?? "");
    const to = String(row.to_object ?? "");
    return reachable.has(from) && reachable.has(to);
  });

  for (const row of relevant) {
    const from = String(row.from_object ?? "");
    const to = String(row.to_object ?? "");
    const fromColumn = classifyLineageObject(from);
    const toColumn = isMetricObject(to) ? "metric" : classifyLineageObject(to);
    if (fromColumn && toColumn) {
      if (!isMetricObject(from)) {
        add({ id: nodeIdFor(from), label: from, column: fromColumn, sub: String(row.via ?? "") || undefined });
      }
      if (!isMetricObject(to)) add({ id: nodeIdFor(to), label: to, column: toColumn });
      link(nodeIdFor(from), nodeIdFor(to));
    }
  }

  // Ensure declared source / grain tables exist and feed the chain.
  for (const table of sources) {
    const column = classifyLineageObject(table) ?? "source";
    add({ id: `obj:${table}`, label: table, column });
  }
  if (grainTable) {
    add({
      id: `obj:${grainTable}`,
      label: grainTable,
      column: classifyLineageObject(grainTable) ?? "transformation",
      sub: "grain table",
    });
  }

  // Business rules feed the metric.
  for (const rule of input.rules.slice(0, 3)) {
    const id = String(rule.rule_id ?? "");
    if (!id) continue;
    add({ id: `rule:${id}`, label: id, column: "rule", sub: String(rule.kind ?? rule.domain ?? "") || undefined });
    link(`rule:${id}`, metricNode);
  }

  // Terminal transformation/canonical nodes flow into the rules (or the metric when no rules).
  const ruleIds = [...nodes.values()].filter((node) => node.column === "rule").map((node) => node.id);
  const hasOutgoing = new Set(edges.map((edge) => edge.from));
  for (const node of [...nodes.values()]) {
    if ((node.column === "transformation" || node.column === "canonical" || node.column === "source") && !hasOutgoing.has(node.id)) {
      if (ruleIds.length) ruleIds.forEach((rule) => link(node.id, rule));
      else link(node.id, metricNode);
    }
  }

  for (const mart of stringList(def.downstream_marts)) {
    add({ id: `mart:${mart}`, label: mart, column: "mart" });
    link(metricNode, `mart:${mart}`);
  }

  for (const tool of TOOLS_FOR_METRIC[input.metricId] ?? ["get_metric"]) {
    add({ id: `tool:${tool}`, label: tool, column: "tool", sub: "MCP · Ask" });
    link(metricNode, `tool:${tool}`);
  }

  for (const row of CASE_FOR_METRIC[input.metricId] ?? []) {
    add({ id: row.id, label: row.label, column: "case" });
    for (const tool of TOOLS_FOR_METRIC[input.metricId] ?? ["get_metric"]) link(`tool:${tool}`, row.id);
    for (const mart of stringList(def.downstream_marts)) link(`mart:${mart}`, row.id);
  }

  return { nodes: [...nodes.values()], edges };
}

/** Upstream and downstream closure for hover highlighting. */
export function dependencyClosure(graph: DependencyGraph, nodeId: string) {
  const upstream = new Set<string>();
  const downstream = new Set<string>();
  const walk = (start: string, direction: "up" | "down", into: Set<string>) => {
    const queue = [start];
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of graph.edges) {
        const next = direction === "up" ? (edge.to === current ? edge.from : null) : edge.from === current ? edge.to : null;
        if (next && !into.has(next) && next !== start) {
          into.add(next);
          queue.push(next);
        }
      }
    }
  };
  walk(nodeId, "up", upstream);
  walk(nodeId, "down", downstream);
  return { upstream, downstream };
}
