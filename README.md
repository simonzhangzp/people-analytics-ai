# People Strategy Intelligence

Public site for [peopleanalyticsai.net](https://peopleanalyticsai.net).

Phase 1 is a polished Talent Acquisition vertical slice:

**Strategy → Measurement → Data Readiness → Analysis → Executive Story → Action**

The public `/demo` path works without sign-in. Strategy starts with a classified
library of 100+ People strategies and problems. Users can also write their own.
The site proposes metrics immediately from the catalog and optionally enriches
the summary with DeepSeek when `DEEPSEEK_API_KEY` is set. Measurement has a
separate library of 100+ People metrics; users can add catalog metrics or write
their own definitions. Targets can be confirmed or skipped.

The browser-local pipeline now performs:

- UTF-8 / UTF-16 / UTF-32 decode for HR extracts;
- table and grain inference for recruiting, snapshots, hire extracts, and rosters;
- canonical People field mapping and PII redaction in the in-memory sample;
- completeness, duplicate, date-order, and privacy checks;
- strategy answerability assessment;
- deterministic recruiting or headcount / workforce-mix analysis;
- evidence-linked Executive Story and Action generation.

Raw People rows stay in browser memory and are not sent to the application
server. Numbers are calculated in code; AI only explains.

## Test data

`sample_data/` contains public synthetic IBM recruiting and employee-outcome
datasets, plus optional local VDM headcount extracts. Source notes and
encoding/PII warnings are in `sample_data/README.md`. Large VDM snapshots are
gitignored.

End-to-end tests upload files through the same file input a user sees, then
complete:

**Strategy → Measurement → Upload → Mapping → Analysis → Story → Action**

Recruiting files produce Time to Hire. Snapshot / roster extracts produce
Headcount or Workforce mix and explicitly do not treat those numbers as Time
to Fill.

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

Copy `.env.example` to `.env.local` only if you want later DeepSeek or Supabase wiring. The demo does not require either key.
