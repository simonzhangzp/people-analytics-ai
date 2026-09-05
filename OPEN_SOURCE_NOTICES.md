# Open Source Notices

People Analytics AI Workbench uses the following open-source dependencies. They
remain third-party dependencies; this repository does not copy their source,
visual identity, examples, or product branding.

| Package | Version range | License | Use in this product |
| --- | --- | --- | --- |
| `@duckdb/duckdb-wasm` | `^1.33.1-dev57.0` | MIT | Browser-local SQL engine for file registration, joins, profiling, filtering, and aggregation |
| `flint-chart` | `^0.5.1` | MIT | Semantic chart assembly from deterministic aggregate data |
| `vega`, `vega-lite`, `vega-embed` | `^6.4.0`, `^6.4.3`, `^7.1.0` | BSD-3-Clause | Flint chart compilation and browser rendering |
| `pptxgenjs` | `^4.0.1` | MIT | Browser generation of editable 16:9 PowerPoint files |
| `@radix-ui/react-dialog` | `^1.1.23` | MIT | Accessible desktop overlays and responsive workbench drawers |
| `@radix-ui/react-tabs` | `^1.1.21` | MIT | Accessible segmented views where required |
| `@radix-ui/react-tooltip` | `^1.2.16` | MIT | Accessible contextual help |
| `class-variance-authority` | `^0.7.1` | Apache-2.0 | Typed UI component variants |
| `@supabase/supabase-js` | `^2.112.4` | MIT | Anonymous authentication and RLS-protected knowledge persistence |
| `recharts` | `^3.10.1` | MIT | Deterministic chart fallback and story rendering |
| `papaparse` | `^5.7.0` | MIT | Local CSV parsing and normalized CSV generation |
| `read-excel-file` | `^9.3.10` | MIT | Local Excel workbook parsing |

The exact installed versions and complete transitive dependency graph are
recorded in `package-lock.json`. Each dependency is distributed under its own
license and copyright notice.

## Analysis engine

Microsoft [Data Formulator](https://github.com/microsoft/data-formulator) 0.8
(commit `5477f0e236426dc8f74a498ec400414fba7fbc0f`) is used under MIT as the
optional Docker analysis workspace. This repository does not vendor that source
in git. The People overlay lives in `apps/formulator/` and is original to this
product.

## Security boundary

Files attached through Analyze are stored in the Formulator analysis workspace
volume. The marketing site does not receive those uploads. Flint and the
fallback renderer receive only deterministic aggregate chart data; direct
identifiers are excluded from charts. PptxGenJS receives only application-owned
text and structured chart specifications; this product does not pass
user-supplied images to its image parsers.

The `/workbench` fallback still processes raw rows in the browser for local
demos.


