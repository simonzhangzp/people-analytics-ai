# Open Source Notices

People Strategy Intelligence uses the following open-source dependencies. They
remain third-party dependencies; this repository does not copy their source,
visual identity, examples, or product branding.

| Package | Version range | License | Use in this product |
| --- | --- | --- | --- |
| `@duckdb/duckdb-wasm` | `^1.33.1-dev57.0` | MIT | Browser-local SQL engine for file registration, joins, profiling, filtering, and aggregation |
| `@kanaries/graphic-walker` | `^0.5.2` | Apache-2.0 | On-demand, isolated visual exploration of bounded local query results |
| `pptxgenjs` | `^4.0.1` | MIT | Browser generation of editable 16:9 PowerPoint files |
| `@radix-ui/react-dialog` | `^1.1.23` | MIT | Accessible desktop overlays and responsive workbench drawers |
| `@radix-ui/react-tabs` | `^1.1.21` | MIT | Accessible segmented views where required |
| `@radix-ui/react-tooltip` | `^1.2.16` | MIT | Accessible contextual help |
| `class-variance-authority` | `^0.7.1` | Apache-2.0 | Typed UI component variants |
| `styled-components` | `^6.5.3` | MIT | Peer runtime required by Graphic Walker |
| `@supabase/supabase-js` | `^2.112.4` | MIT | Anonymous authentication and RLS-protected knowledge persistence |
| `recharts` | `^3.10.1` | MIT | Evidence and story chart rendering |
| `papaparse` | `^5.7.0` | MIT | Local CSV parsing and normalized CSV generation |
| `read-excel-file` | `^9.3.10` | MIT | Local Excel workbook parsing |

The exact installed versions and complete transitive dependency graph are
recorded in `package-lock.json`. Each dependency is distributed under its own
license and copyright notice.

## Security boundary

Raw uploaded People rows are processed in the browser. Graphic Walker loads only
after an explicit “Explore data” action and receives a bounded local result.
Computed expressions are disabled. PptxGenJS receives only application-owned
text and structured chart specifications; this product does not pass
user-supplied images to its image parsers.

