# People Strategy Intelligence

Public site for [peopleanalyticsai.net](https://peopleanalyticsai.net).

Phase 1 is a persistent People Analytics Workbench with an Engineering
voluntary-attrition vertical slice:

**Data → Metric Definition → Analysis Thread → Executive Story**

The public `/demo` path opens three synthetic, related attrition datasets. The
older Strategy Mode remains available at `/strategy` as a secondary workflow.
`/workbench` opens an empty local-first workspace.

The browser-local pipeline now performs:

- UTF-8 / UTF-16 / UTF-32 decode for HR extracts;
- CSV and Excel normalization followed by DuckDB-Wasm registration;
- table/grain inference, safe column profiling, and multi-file join coverage;
- canonical People field mapping without sending raw values to a server;
- versioned metric definitions with visible natural-language diffs;
- deterministic attrition trend, tenure, level, and compensation analysis;
- bounded on-demand visual exploration;
- evidence-linked 3/5-slide stories and editable PPTX export.

Raw People rows stay in browser memory and are not sent to the application
server or Supabase. Numbers are calculated in code; five typed AI tasks only
propose semantics, plans, interpretations, and story structure.

## Test data

`sample_data/` contains public synthetic IBM recruiting and employee-outcome
datasets, plus optional local VDM headcount extracts. Source notes and
encoding/PII warnings are in `sample_data/README.md`. Large VDM snapshots are
gitignored.

End-to-end tests use the same workbench controls a user sees, then complete:

**Demo files → Question → Metric approval → Analysis branch → Story → PPTX**

## Local run

```bash
npm install
npx playwright install chromium
npm test
npm run test:e2e
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Optional environment

Copy `.env.example` to `.env.local` to enable DeepSeek and Supabase knowledge
sync. The guided demo remains usable with explicit deterministic/local-only
fallbacks when either service is unavailable.
