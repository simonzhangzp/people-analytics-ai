---
version: alpha
name: Certified Ink
description: PeopleAnalyticsAI public site. Paper-white canvas, deep-navy ink, one signal blue for actions, one certified green for governed facts, one gold for roadmap and hypotheses, and a five-hue spectrum that follows the architecture layers.
colors:
  primary: "#2456f6"
  primary-dark: "#1b43c9"
  primary-deep: "#10307f"
  primary-soft: "#e8eeff"
  primary-ring: "#a9bdff"
  ink: "#0b1730"
  ink-2: "#142547"
  ink-3: "#1f3466"
  body: "#2a3650"
  body-2: "#47546c"
  muted: "#5f6b82"
  faint: "#8a94a8"
  canvas: "#ffffff"
  canvas-2: "#f3f6fc"
  canvas-3: "#e9eff9"
  edge: "#e4e8f0"
  edge-strong: "#cbd3e1"
  certified: "#0e8a5f"
  certified-dark: "#0a6b4a"
  certified-soft: "#e3f5ec"
  certified-line: "#b9e3ce"
  gold: "#b8730e"
  gold-dark: "#8f5a0b"
  gold-soft: "#fbf1de"
  gold-line: "#ebd3a6"
  danger: "#b3403f"
  danger-soft: "#fbecec"
  danger-line: "#f0caca"
  layer-1: "#0f8b9e"
  layer-2: "#0e8a5f"
  layer-3: "#b8730e"
  layer-4: "#6a48d7"
  layer-5: "#2456f6"
  on-ink: "#e6ebf5"
  on-ink-2: "#c3ccdf"
  on-ink-3: "#aab6cc"
  on-ink-muted: "#8e9bb5"
  on-ink-link: "#9db4ff"
  on-ink-eyebrow: "#a9bdff"
  on-ink-certified: "#5fd0a5"
  on-ink-gold: "#f0c36a"
typography:
  hero-title:
    fontFamily: Bricolage Grotesque
    fontSize: 4.25rem
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: -0.035em
  section-title:
    fontFamily: Bricolage Grotesque
    fontSize: 2.5rem
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: -0.03em
  card-title:
    fontFamily: Bricolage Grotesque
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  metric-number:
    fontFamily: Bricolage Grotesque
    fontSize: 2.4rem
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: -0.035em
    fontFeature: "tnum"
  lede:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.55
  label-caps:
    fontFamily: Geist
    fontSize: 11.5px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.08em
  code:
    fontFamily: ui-monospace
    fontSize: 11.5px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: 8px
  card: 12px
  hero-card: 16px
  chip: 9999px
spacing:
  base: 16px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  section: 112px
  band: 96px
  container: 1100px
  gutter: 20px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    height: 48px
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: 48px
  card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    rounded: "{rounded.card}"
    padding: 24px
  band-ink:
    backgroundColor: "{colors.ink}"
    textColor: "#e6ebf5"
  chip-live:
    backgroundColor: "{colors.certified-soft}"
    textColor: "{colors.certified-dark}"
    rounded: "{rounded.chip}"
  chip-target:
    backgroundColor: "{colors.gold-soft}"
    textColor: "{colors.gold-dark}"
    rounded: "{rounded.chip}"
---

# PeopleAnalyticsAI — Certified Ink

This file follows the [DESIGN.md format](https://github.com/google-labs-code/design.md) so agents
and humans read the same source of truth. Tokens above are normative; the prose below explains why
they exist and how to apply them. Implementation lives in `src/app/globals.css` (`@theme`) and
`src/lib/people/layer-tones.ts`.

## Overview

The site is a recruiter-facing case study of an AI-ready People Analytics platform. The subject is
governed facts: a number that arrives with its identity, tool, policy and trace attached. The look
should feel like a certified ledger drawn on engineering paper, not a chatbot landing page: calm
white canvas, deep-navy ink, one decisive action colour, and colour used as information.

Audience: hiring managers and People Analytics / data leaders. They read a lot, so long-form
sections stay light; dark bands are reserved for the artifact that proves the thesis (the hero
provenance card), the closing boundary section and the footer.

The one place boldness is spent: the **five-layer colour spectrum**. Every reference to an
architecture layer (explorer, comparison table, proof points, try modules, pipeline cards) carries
that layer's hue, so a visitor learns the palette once and reads it everywhere.

## Colors

- **Ink (#0b1730)** deep navy for headlines and primary text; also the dark band background.
- **Primary (#2456f6)** signal blue, the only action colour. Buttons, links, active nav.
- **Certified (#0e8a5f)** green reserved for governed facts: certified metrics, live tags,
  the "trusted facts" highlight. Never used decoratively.
- **Gold (#b8730e)** roadmap, target architecture, hypotheses and the synthetic-data disclaimer.
  It means "not yet a fact".
- **Danger (#b3403f)** refusals and failed checks only.
- **Layer spectrum** L1 teal, L2 green (same as certified: knowledge is certified definitions),
  L3 gold (mostly roadmap), L4 violet (agent runtime), L5 blue (experience = primary).
  Pillars: governance = ink, observability = muted slate.
- **Neutrals** canvas white, canvas-2 tint for alternating bands and insets, edge for hairlines.
  Body copy uses `body` / `body-2`; `muted` for secondary; `faint` only for non-essential hints.

Text on white must meet WCAG AA (4.5:1): `body`, `body-2`, `muted`, `primary`, `certified-dark`,
`gold-dark` all do. `faint` (3.4:1) is for decorative or duplicated information only. Text on
soft tints uses the `-dark` / `-deep` variant of the same hue.

Text on ink bands (`.band-ink`, `.band-ink-deep`, the hero provenance card) uses the `on-ink-*`
tokens only: `on-ink` for headings, `on-ink-2` / `on-ink-3` for body, `on-ink-muted` for labels,
`on-ink-link` for links, `on-ink-certified` and `on-ink-gold` for the same semantics as on white.
Hairlines and insets on ink use `white/10` and `white/5`; nothing else is hard-coded.

## Typography

- **Display: Bricolage Grotesque** (variable, `opsz` + `wdth`) for h1, h2, card titles, metric
  numbers and the wordmark. Weight 700, tight tracking. It carries the personality; it is never
  used for paragraphs.
- **Body: Geist** for everything else. 14px default, 18px lede, 1.5–1.6 line height.
- **Code / identifiers**: monospace only for real identifiers (RPC names, table names, tokens).

Keyword highlights are coloured text plus a thick offset underline (`.hl` + `.hl-certified` /
`.hl-ai` / `.hl-gold` / `.hl-ink`). Colour follows meaning: green = governed fact, blue = AI /
model, gold = roadmap or hypothesis. At most two highlights per heading, none in body copy;
inline emphasis in paragraphs uses `<strong>` in ink or `certified-dark`.

Eyebrow labels are 11.5px, uppercase, primary blue; they name the section's role, not decorate.

## Layout

Fixed max width 1100px, 20px gutters on mobile and 32px from `sm`. Homepage sections are full-bleed
bands (white → white table → tinted architecture → white proof/environment → ink closing → deeper
ink footer) with 112px between sections and 96px band padding. Interior pages are single-column at
1100px (case shells use a 220 / flex / 280 three-column grid).

Content is left-aligned throughout. Hero is a two-column split: copy left, live provenance card
right; it stacks on mobile with the card below the CTAs. Tables (the Traditional vs AI-ready
comparison) are true side-by-side grids on `md+` and stack per row below that, repeating the
column labels inside each cell.

## Elevation & Depth

Depth is tonal first, shadow second. Cards are white on white with a 1px `edge` hairline and a
soft two-layer shadow (`shadow-card`); hover lifts to `shadow-lift` with a 2px translate. Tinted
bands (`canvas-2`) separate sections without borders. On ink bands, surfaces are 5–6% white with a
12% white hairline and no shadow; two blurred radial tints (blue top-right, green bottom-left)
give the band atmosphere without a gradient wash over content.

## Shapes

Cards 12px, controls 8px, hero card 16px, chips and tags fully rounded. Layer accents are 4px bars
(left edge or top edge of a card) rounded on the inside. Do not mix radii within one surface tier.

## Components

- **Buttons**: `.btn-primary` blue with a coloured drop shadow; `.btn-secondary` white with
  `edge-strong` border, turns to `primary-ring` border on hover. On ink bands the secondary button
  becomes translucent white. Height 48px on marketing pages, 40–44px inside tools.
- **LiveTag**: green = live, gold = target architecture, blue = live + target. Never render a target
  item without one.
- **Layer chip**: `LAYER_TONE[id].soft` background + `.text`, no border.
- **Comparison table**: dimension column (layer bar + numbered badge + thesis + links), traditional
  cell on `canvas-2` with × markers, AI-ready cell on `primary-soft/35` with green check markers.
- **Provenance card**: ink band, live certified value in display type, four-step timeline whose dots
  take the colour of the responsible layer.
- **Header**: sticky, translucent white with blur; active item gets a 2px primary underline;
  "Connect via MCP" is the single ink-filled action.
- **Footer**: `band-ink-deep` (#07101f) so it still reads as an ending after a dark closing band.

## Do's and Don'ts

- Do use `certified` only for things that are actually certified or live.
- Do give every layer reference its layer colour; do not invent a sixth hue.
- Do keep body copy in Geist; display type is for headings and numbers.
- Don't add gradients over text or as section backgrounds; the two blurred tints on ink bands are
  the only ambient colour.
- Don't highlight more than two phrases in a heading, and never highlight inside paragraphs.
- Don't put a number on a page that did not come from a serving RPC or committed documentation.
- Don't reintroduce the grey `#f7f8fa` page background; tint comes from `canvas-2` bands, not the
  whole page.
- Don't mark a roadmap capability as live; if it is on the page it carries the gold target tag.
