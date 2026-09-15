/**
 * Colour follows the architecture layer wherever a layer is referenced (explorer,
 * comparison table, proof points, try modules). Tokens live in globals.css @theme.
 * Tailwind needs literal class names, so the map is spelled out.
 */

import type { LayerId, PillarId } from "./architecture-map";

export type LayerTone = {
  /** Solid fill for active badges. */
  solid: string;
  /** Text colour on white / soft surfaces. */
  text: string;
  /** Soft tinted surface. */
  soft: string;
  /** Border colour when the layer is active. */
  border: string;
  /** Hex for SVG strokes and inline styles. */
  hex: string;
};

export const LAYER_TONE: Record<LayerId, LayerTone> = {
  L1: { solid: "bg-layer-1", text: "text-layer-1", soft: "bg-layer-1-soft", border: "border-layer-1", hex: "#0f8b9e" },
  L2: { solid: "bg-layer-2", text: "text-layer-2", soft: "bg-layer-2-soft", border: "border-layer-2", hex: "#0e8a5f" },
  L3: { solid: "bg-layer-3", text: "text-layer-3", soft: "bg-layer-3-soft", border: "border-layer-3", hex: "#b8730e" },
  L4: { solid: "bg-layer-4", text: "text-layer-4", soft: "bg-layer-4-soft", border: "border-layer-4", hex: "#6a48d7" },
  L5: { solid: "bg-layer-5", text: "text-layer-5", soft: "bg-layer-5-soft", border: "border-layer-5", hex: "#2456f6" },
};

export const PILLAR_TONE: Record<PillarId, LayerTone> = {
  governance: { solid: "bg-ink", text: "text-ink", soft: "bg-canvas-3", border: "border-ink", hex: "#0b1730" },
  observability: { solid: "bg-muted", text: "text-muted", soft: "bg-canvas-2", border: "border-muted", hex: "#5f6b82" },
};

/** Chip classes for a layer reference on a white surface. */
export function layerChip(id: LayerId): string {
  const tone = LAYER_TONE[id];
  return `${tone.soft} ${tone.text}`;
}
