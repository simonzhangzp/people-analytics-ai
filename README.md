# People Analytics AI Workbench

Public site for [peopleanalyticsai.net](https://peopleanalyticsai.net).

**Ask your People data anything.**

The primary path is:

**Upload → Ask → Chart + answer → Continue or branch → Executive Story**

That analysis workspace is Microsoft Data Formulator 0.8 (MIT) with a People
knowledge overlay, intended to run at
[app.peopleanalyticsai.net](https://app.peopleanalyticsai.net). Uploaded Excel
and CSV files are stored in the Formulator server workspace. They are not saved
on the marketing site.

`peopleanalyticsai.net` remains landing, strategy, architecture, and portfolio.
`/workbench` is a browser-local DuckDB fallback for demos and machines without
Docker. `/demo` opens three synthetic, related attrition datasets. `/strategy`
stays a separate Strategy → Metrics → Data → Insights → Action entry.

## Analysis server (Formulator)

Requires Docker.

```bash
copy apps/formulator/.env.example apps/formulator/.env
docker compose -f apps/formulator/docker-compose.yml up --build
```

Open [http://localhost:5567](http://localhost:5567). Then set
`NEXT_PUBLIC_FORMULATOR_URL=http://localhost:5567` (or
`https://app.peopleanalyticsai.net` in production) so `/app` can open the
workspace.

To clone the pinned Data Formulator commit locally without Docker:

```bash
npm run formulator:bootstrap
python apps/formulator/people_layer/test_rules.py
```

Details: `apps/formulator/README.md`.

## Browser fallback

`/workbench` still performs:

- UTF-8 / UTF-16 / UTF-32 decode for HR extracts;
- CSV and Excel normalization followed by DuckDB-Wasm registration;
- table/grain inference, safe column profiling, and multi-file join coverage;
- canonical People field mapping, including Chinese headers and local-only PII;
- hidden simple, semantic, and diagnostic query routing;
- deterministic People metrics, cuts, trends, and profile calculations;
- semantic Flint charts with a deterministic rendering fallback;
- inline metric clarification only when ambiguity can change the answer;
- continuous follow-up and branching analysis;
- evidence-linked stories with recommended 3/5/7-slide length and editable
  PPTX export.

On this fallback path, raw People rows stay in browser memory. Numbers are
calculated in code; AI proposes semantics, interpretations, and story structure.

## Test data

`sample_data/` contains public synthetic IBM recruiting and employee-outcome
datasets, plus optional local VDM headcount extracts. Source notes and
encoding/PII warnings are in `sample_data/README.md`. Large VDM snapshots are
gitignored.

End-to-end tests use the same workbench controls a user sees, then complete:

**Files → Question → Direct answer → Follow-up or branch → Story → PPTX**

## Local run

```bash
npm install
npx playwright install chromium
npm test
npm run test:e2e
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Analyze My Data opens `/app`.
If Formulator is not configured, that page explains Docker setup and offers the
browser workbench.

## Optional environment

Copy `.env.example` to `.env.local` to enable DeepSeek, Supabase knowledge
sync, and the Formulator origin. The guided demo remains usable with explicit
deterministic/local-only fallbacks when either service is unavailable.
