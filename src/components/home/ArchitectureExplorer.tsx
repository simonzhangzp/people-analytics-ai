"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LiveTag } from "@/components/site/LiveTag";
import {
  ARCHITECTURE_LAYERS,
  ARCHITECTURE_PILLARS,
  CASE_PROOF,
  type ArchitectureLayer,
  type ArchitecturePillar,
  type LayerId,
  type PillarId,
} from "@/lib/people/architecture-map";
import { CASES } from "@/lib/people/demo-cases";
import { LAYER_TONE, PILLAR_TONE } from "@/lib/people/layer-tones";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

type Selection = { kind: "layer"; id: LayerId } | { kind: "pillar"; id: PillarId };

function sameSelection(a: Selection, b: Selection) {
  return a.kind === b.kind && a.id === b.id;
}

function statusCounts(components: { status: "live" | "target" }[]) {
  const live = components.filter((row) => row.status === "live").length;
  return { live, target: components.length - live };
}

/** Vertical flow connector between two layers. Lit (in the active layer's hue) when adjacent. */
function Connector({ lit, hex, reduce }: { lit: boolean; hex: string; reduce: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="mx-auto block h-7 w-full"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
    >
      <line
        x1="50"
        y1="0"
        x2="50"
        y2="28"
        stroke={lit ? hex : "#cbd3e1"}
        strokeWidth={lit ? 2 : 1.25}
        strokeDasharray="4 8"
        className={lit && !reduce ? "flow-line" : undefined}
        style={{ transition: "stroke 400ms ease, stroke-width 400ms ease" }}
      />
      <path
        d="M46 6 L50 1 L54 6"
        fill="none"
        stroke={lit ? hex : "#cbd3e1"}
        strokeWidth={lit ? 2 : 1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: "stroke 400ms ease" }}
      />
    </svg>
  );
}

function LayerCard({
  layer,
  active,
  dimmed,
  pinned,
  mode,
  reduce,
  onEnter,
  onSelect,
}: {
  layer: ArchitectureLayer;
  active: boolean;
  dimmed: boolean;
  pinned: boolean;
  mode: "compact" | "expanded";
  reduce: boolean;
  onEnter: () => void;
  onSelect: () => void;
}) {
  const counts = statusCounts(layer.components);
  const tone = LAYER_TONE[layer.id];
  return (
    <motion.button
      type="button"
      onMouseEnter={onEnter}
      onFocus={onEnter}
      onClick={onSelect}
      aria-pressed={active && pinned}
      aria-describedby="architecture-detail"
      data-testid={`arch-layer-${layer.id}`}
      data-active={active ? "true" : "false"}
      animate={{
        opacity: dimmed ? 0.72 : 1,
        scale: active && !reduce ? 1.012 : 1,
      }}
      transition={{ duration: reduce ? 0.12 : 0.5, ease: EASE }}
      className={cn(
        "relative w-full rounded-[12px] border bg-white p-4 text-left sm:p-5",
        active ? cn(tone.border, "shadow-lift") : "border-edge shadow-card",
      )}
      style={{ transition: "border-color 400ms ease, box-shadow 400ms ease" }}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-4 left-0 w-1 rounded-r-full", tone.solid)}
        style={{ opacity: active ? 1 : 0.35, transition: "opacity 400ms ease" }}
      />
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "mt-0.5 inline-flex min-w-9 items-center justify-center rounded-[8px] px-2 py-1 text-[11px] font-bold tabular-nums",
            active ? cn(tone.solid, "text-white") : cn(tone.soft, tone.text),
          )}
          style={{ transition: "background-color 400ms ease, color 400ms ease" }}
        >
          {layer.id}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[16px] font-semibold tracking-[-0.015em] text-ink sm:text-[17px]">
              {layer.name}
            </span>
            <LiveTag status={layer.status} compact />
          </span>
          <span className="mt-1 block text-[13px] text-muted">{layer.short}</span>
          <AnimatePresence initial={false}>
            {active || mode === "expanded" ? (
              <motion.span
                key="why"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: reduce ? 0.1 : 0.4, ease: EASE }}
                className="block overflow-hidden"
              >
                <span className="mt-3 block text-[14px] leading-6 text-body">
                  {layer.whyItMatters}
                </span>
              </motion.span>
            ) : null}
          </AnimatePresence>
          {mode === "expanded" ? (
            <span className="mt-3 flex flex-wrap gap-1.5">
              {layer.components.map((component) => (
                <span
                  key={component.label}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    component.status === "live"
                      ? "border-edge bg-canvas-2 text-body"
                      : "border-dashed border-gold-line bg-gold-soft text-gold-dark",
                  )}
                >
                  {component.label}
                  {component.status === "target" ? <span className="text-[9px] uppercase">target</span> : null}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <span className="hidden shrink-0 text-right text-[11px] leading-4 text-faint sm:block">
          {counts.live} live
          {counts.target ? (
            <>
              <br />
              {counts.target} target
            </>
          ) : null}
        </span>
      </div>
    </motion.button>
  );
}

function PillarBar({
  pillar,
  active,
  dimmed,
  reduce,
  onEnter,
  onSelect,
}: {
  pillar: ArchitecturePillar;
  active: boolean;
  dimmed: boolean;
  reduce: boolean;
  onEnter: () => void;
  onSelect: () => void;
}) {
  const counts = statusCounts(pillar.components);
  const tone = PILLAR_TONE[pillar.id];
  return (
    <motion.button
      type="button"
      onMouseEnter={onEnter}
      onFocus={onEnter}
      onClick={onSelect}
      data-testid={`arch-pillar-${pillar.id}`}
      data-active={active ? "true" : "false"}
      animate={{ opacity: dimmed ? 0.55 : 1 }}
      transition={{ duration: reduce ? 0.12 : 0.5, ease: EASE }}
      className={cn(
        "flex flex-1 items-center gap-3 rounded-[12px] border bg-white px-3 py-3 text-left lg:min-h-0 lg:w-[72px] lg:flex-col lg:justify-between lg:px-2 lg:py-4",
        active ? cn(tone.border, "shadow-lift") : "border-edge shadow-card",
      )}
      style={{ transition: "border-color 400ms ease, box-shadow 400ms ease" }}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1 w-8 rounded-full lg:h-full lg:w-1",
          active ? tone.solid : "bg-edge-strong",
        )}
        style={{ transition: "background-color 400ms ease" }}
      />
      <span
        className="text-[12px] font-semibold tracking-[0.02em] text-ink lg:[writing-mode:vertical-rl] lg:rotate-180"
      >
        {pillar.name}
      </span>
      <span className="text-[10px] text-faint lg:[writing-mode:vertical-rl] lg:rotate-180">
        {counts.live} live{counts.target ? ` · ${counts.target} target` : ""}
      </span>
    </motion.button>
  );
}

function DetailPanel({ selection, reduce }: { selection: Selection; reduce: boolean }) {
  const layer = selection.kind === "layer" ? ARCHITECTURE_LAYERS.find((row) => row.id === selection.id) : null;
  const pillar =
    selection.kind === "pillar" ? ARCHITECTURE_PILLARS.find((row) => row.id === selection.id) : null;
  const item = layer ?? pillar;
  if (!item) return null;
  const proofCases = CASES.filter((row) => item.cases.includes(row.id));
  const tone = layer ? LAYER_TONE[layer.id] : PILLAR_TONE[(pillar as ArchitecturePillar).id];

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={`${selection.kind}-${selection.id}`}
        initial={{ opacity: 0, x: reduce ? 0 : 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: reduce ? 0 : -6 }}
        transition={{ duration: reduce ? 0.12 : 0.4, ease: EASE }}
        id="architecture-detail"
        data-testid="architecture-detail"
        className="surface relative overflow-hidden p-6"
      >
        <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", tone.solid)} />
        <p className={cn("text-[11.5px] font-bold uppercase tracking-[0.08em]", tone.text)}>
          {layer ? `Layer ${layer.id}` : "Cross-cutting pillar"}
        </p>
        <h3 className="display mt-2 text-[22px] font-bold tracking-[-0.02em] text-ink">{item.name}</h3>
        <p className="mt-3 text-[14px] leading-6 text-body">{item.explanation}</p>

        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Components</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {item.components.map((component) => {
            const chip = (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  component.status === "live"
                    ? "border-edge bg-canvas-2 text-body"
                    : "border-dashed border-gold-line bg-gold-soft text-gold-dark",
                  component.href && "hover:border-primary-ring",
                )}
              >
                {component.label}
                {component.status === "target" ? <span className="text-[9px] uppercase">target</span> : null}
              </span>
            );
            return (
              <li key={component.label}>
                {component.href ? <Link href={component.href}>{chip}</Link> : chip}
              </li>
            );
          })}
        </ul>

        {proofCases.length ? (
          <>
            <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Proved by</p>
            <ul className="mt-2 space-y-1.5">
              {proofCases.map((row) => (
                <li key={row.id}>
                  <Link href={row.href} className="text-[13px] font-semibold text-primary hover:underline">
                    {row.question}
                  </Link>
                  <span className="block text-[12px] text-muted">{CASE_PROOF[row.id].thesis}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <Link
          href={item.cta.href}
          className="mt-6 inline-flex min-h-10 items-center rounded-[8px] bg-primary px-4 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          {item.cta.label}
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Section 2 — interactive five-layer architecture with two cross-cutting pillars.
 * Hover previews, click pins. Compact on the homepage; expanded on /architecture.
 */
export function ArchitectureExplorer({
  mode = "compact",
  defaultSelection = { kind: "layer", id: "L4" },
}: {
  mode?: "compact" | "expanded";
  defaultSelection?: Selection;
}) {
  const reduce = useReducedMotion() ?? false;
  const [hover, setHover] = useState<Selection | null>(null);
  const [pinned, setPinned] = useState<Selection | null>(null);
  const selection = pinned ?? hover ?? defaultSelection;

  const layersTopDown = useMemo(() => [...ARCHITECTURE_LAYERS].reverse(), []);
  const activeLayerIndex =
    selection.kind === "layer" ? ARCHITECTURE_LAYERS.findIndex((row) => row.id === selection.id) : -1;

  function select(next: Selection) {
    setPinned((current) => (current && sameSelection(current, next) ? null : next));
  }

  return (
    <div
      className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
      data-testid="architecture-explorer"
      data-mode={mode}
      onMouseLeave={() => setHover(null)}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <ol className="flex flex-col" aria-label="Architecture layers, top to bottom">
          {layersTopDown.map((layer, index) => {
            const layerIndex = ARCHITECTURE_LAYERS.findIndex((row) => row.id === layer.id);
            const isActive = selection.kind === "layer" && selection.id === layer.id;
            const isDimmed = !isActive && (selection.kind === "pillar" ? false : true);
            // Connector below this card links layerIndex (upper) with layerIndex-1 (lower).
            const lit = activeLayerIndex === layerIndex || activeLayerIndex === layerIndex - 1;
            const litHex =
              selection.kind === "layer" ? LAYER_TONE[selection.id].hex : LAYER_TONE.L5.hex;
            return (
              <li key={layer.id}>
                <LayerCard
                  layer={layer}
                  active={isActive}
                  dimmed={isDimmed}
                  pinned={pinned != null && sameSelection(pinned, { kind: "layer", id: layer.id })}
                  mode={mode}
                  reduce={reduce}
                  onEnter={() => setHover({ kind: "layer", id: layer.id })}
                  onSelect={() => select({ kind: "layer", id: layer.id })}
                />
                {index < layersTopDown.length - 1 ? (
                  <Connector lit={lit} hex={litHex} reduce={reduce} />
                ) : null}
              </li>
            );
          })}
        </ol>
        <div className="flex gap-3 lg:flex-col" aria-label="Cross-cutting pillars">
          {ARCHITECTURE_PILLARS.map((pillar) => (
            <PillarBar
              key={pillar.id}
              pillar={pillar}
              active={selection.kind === "pillar" && selection.id === pillar.id}
              dimmed={!(selection.kind === "pillar" && selection.id === pillar.id)}
              reduce={reduce}
              onEnter={() => setHover({ kind: "pillar", id: pillar.id })}
              onSelect={() => select({ kind: "pillar", id: pillar.id })}
            />
          ))}
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <DetailPanel selection={selection} reduce={reduce} />
        <p className="mt-3 text-[11px] leading-5 text-faint">
          Hover to preview, click to pin. Dashed chips are target architecture, not shipped.
        </p>
      </aside>
    </div>
  );
}
