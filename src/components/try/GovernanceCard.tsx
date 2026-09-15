"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  GRAPH_COLUMNS,
  dependencyClosure,
  type DependencyGraph,
  type GraphColumn,
} from "@/lib/people/dependency-graph";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

export type GovernedMetric = {
  metricId: string;
  name: string;
  /** First-layer governance fields, already stringified server-side. */
  fields: Array<{ label: string; value: string }>;
  graph: DependencyGraph;
};

const NODE_W = 168;
const NODE_H = 44;
const COL_GAP = 40;
const ROW_GAP = 14;

function layout(graph: DependencyGraph) {
  const columns = GRAPH_COLUMNS.filter((column) => graph.nodes.some((node) => node.column === column.id));
  const perColumn = new Map<GraphColumn, string[]>();
  for (const column of columns) {
    perColumn.set(
      column.id,
      graph.nodes.filter((node) => node.column === column.id).map((node) => node.id),
    );
  }
  const maxRows = Math.max(...[...perColumn.values()].map((rows) => rows.length), 1);
  const height = maxRows * NODE_H + (maxRows - 1) * ROW_GAP + 40;
  const width = columns.length * NODE_W + (columns.length - 1) * COL_GAP;
  const positions = new Map<string, { x: number; y: number }>();
  columns.forEach((column, columnIndex) => {
    const ids = perColumn.get(column.id) ?? [];
    const blockHeight = ids.length * NODE_H + (ids.length - 1) * ROW_GAP;
    const top = (height - 40 - blockHeight) / 2 + 40;
    ids.forEach((id, rowIndex) => {
      positions.set(id, {
        x: columnIndex * (NODE_W + COL_GAP),
        y: top + rowIndex * (NODE_H + ROW_GAP),
      });
    });
  });
  return { columns, positions, width, height };
}

function DependencyGraphView({ graph, reduce }: { graph: DependencyGraph; reduce: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const { columns, positions, width, height } = useMemo(() => layout(graph), [graph]);
  const closure = useMemo(() => (hover ? dependencyClosure(graph, hover) : null), [graph, hover]);

  const nodeTone = (id: string) => {
    if (!hover) return "idle";
    if (id === hover) return "self";
    if (closure?.upstream.has(id)) return "up";
    if (closure?.downstream.has(id)) return "down";
    return "muted";
  };

  return (
    <div className="mt-4 overflow-x-auto" data-testid="dependency-graph">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Metric dependency graph"
        className="block min-w-full"
        onMouseLeave={() => setHover(null)}
      >
        {columns.map((column, index) => (
          <text
            key={column.id}
            x={index * (NODE_W + COL_GAP)}
            y={14}
            className="fill-faint text-[10px] font-bold uppercase"
            style={{ letterSpacing: "0.1em" }}
          >
            {column.label}
          </text>
        ))}
        {graph.edges.map((edge) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_W;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_H / 2;
          const mid = (x1 + x2) / 2;
          const inUp = (id: string) => id === hover || closure?.upstream.has(id) === true;
          const inDown = (id: string) => id === hover || closure?.downstream.has(id) === true;
          const lit =
            hover != null &&
            ((inUp(edge.from) && inUp(edge.to)) || (inDown(edge.from) && inDown(edge.to)));
          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={`M${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={lit ? "#2456f6" : hover ? "#e4e8f0" : "#cbd3e1"}
              strokeWidth={lit ? 2 : 1.25}
              style={{ transition: reduce ? undefined : "stroke 300ms ease, stroke-width 300ms ease" }}
            />
          );
        })}
        {graph.nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const tone = nodeTone(node.id);
          const fill =
            tone === "self" ? "#2456f6" : tone === "up" ? "#e3f5ec" : tone === "down" ? "#e8eeff" : "#ffffff";
          const stroke =
            tone === "self" ? "#2456f6" : tone === "up" ? "#0e8a5f" : tone === "down" ? "#10307f" : tone === "muted" ? "#e4e8f0" : "#cbd3e1";
          const text = tone === "self" ? "#ffffff" : tone === "muted" ? "#8a94a8" : "#0b1730";
          return (
            <g
              key={node.id}
              transform={`translate(${pos.x} ${pos.y})`}
              onMouseEnter={() => setHover(node.id)}
              onFocus={() => setHover(node.id)}
              tabIndex={0}
              role="button"
              aria-label={`${node.label}: highlight upstream and downstream dependencies`}
              className="cursor-pointer outline-none"
              data-testid={`graph-node-${node.column}`}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill={fill}
                stroke={stroke}
                strokeWidth={tone === "self" ? 1.5 : 1}
                style={{ transition: reduce ? undefined : "fill 300ms ease, stroke 300ms ease" }}
              />
              <text x={10} y={node.sub ? 18 : 26} fill={text} className="text-[11px] font-semibold">
                {node.label.length > 24 ? `${node.label.slice(0, 23)}…` : node.label}
              </text>
              {node.sub ? (
                <text x={10} y={33} fill={tone === "self" ? "#dce5ff" : "#8a94a8"} className="text-[9px]">
                  {node.sub.length > 28 ? `${node.sub.slice(0, 27)}…` : node.sub}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-[12px] text-muted">
        Hover a node: green is upstream (what it depends on), blue is downstream (what breaks if the rule
        changes). Nodes come from people_metric_definition and people_lineage; tools and cases are
        the site surfaces that read the metric.
      </p>
    </div>
  );
}

export function GovernanceCard({ metrics }: { metrics: GovernedMetric[] }) {
  const reduce = useReducedMotion() ?? false;
  const [activeId, setActiveId] = useState(metrics[0]?.metricId ?? "");
  const [showGraph, setShowGraph] = useState(false);
  const metric = metrics.find((row) => row.metricId === activeId) ?? metrics[0];
  if (!metric) return null;

  return (
    <div className="mt-8" data-testid="governance-card">
      <div className="flex flex-wrap gap-2">
        {metrics.map((row) => (
          <button
            key={row.metricId}
            type="button"
            onClick={() => setActiveId(row.metricId)}
            aria-pressed={row.metricId === metric.metricId}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
              row.metricId === metric.metricId
                ? "border-primary bg-primary-soft text-primary-dark"
                : "border-edge bg-white text-body-2 hover:border-edge-strong",
            )}
          >
            {row.name}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={metric.metricId}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.1 : 0.4, ease: EASE }}
          className="surface mt-4 p-6"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Governed analytical asset</p>
          <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">{metric.name}</h3>
          <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {metric.fields.map((field) => (
              <div key={field.label}>
                <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">{field.label}</dt>
                <dd className="mt-1 text-[13px] leading-5 text-ink">{field.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-[12px] leading-5 text-muted">
            Approver, RACI roles, inclusion / exclusion rules and effective date are not stored in the
            data-v1 registry; they are marked as missing rather than filled in. Nothing on this card is
            typed by hand; it is read from people_get_metric_definition and people_metric.
          </p>
          <button
            type="button"
            onClick={() => setShowGraph((value) => !value)}
            aria-expanded={showGraph}
            className="mt-5 inline-flex min-h-10 items-center rounded-[8px] border border-edge-strong bg-white px-4 text-[13px] font-semibold text-ink hover:border-edge-strong"
            data-testid="governance-graph-toggle"
          >
            {showGraph ? "Hide lineage & impact" : "View lineage & impact"}
          </button>
          <AnimatePresence initial={false}>
            {showGraph ? (
              <motion.div
                key="graph"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: reduce ? 0.1 : 0.45, ease: EASE }}
                className="overflow-hidden"
              >
                <DependencyGraphView graph={metric.graph} reduce={reduce} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
