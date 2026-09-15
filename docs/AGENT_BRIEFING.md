# Agent briefing — PeopleAnalyticsAI.net

**As of 2026-09-14.** Snapshot of what is live, what is frozen, and how to brief another model. Deeper specs stay in the files listed at the end. If this file and a long architecture doc disagree on *shipped* scope, this file plus architecture **§11** win over architecture **§6**.

Public site: https://peopleanalyticsai.net  
Repo: PeopleAnalyticsAI (this tree). Serving project: `zapmigfrtnwnkmezjefx`.

---

## 0. Paste this to another AI

```text
Read docs/AGENT_BRIEFING.md first, then only the files it lists. Do not scan the whole repo.

This is a recruiter-facing portfolio + working demo at https://peopleanalyticsai.net — not an HR SaaS and not customer data. Synthetic GlobalTech, frozen data-v1, as-of 2026-08-31, certified Headcount 49,823. Always say it is not a real company.

Task: build a mental model (site, data flow, why it exists, three cases, 10–15 min recruiter walk). Default to read-only. Do not edit, deploy, or connect to QuantReview. Do not start product work unless the owner explicitly asks.

Hard rules:
- Every People object starts with people_*. People v2 DDL only on zapmigfrtnwnkmezjefx.
- Never touch QuantReview production fyvivwgyisrtmehzjqlv or staging kgxbomcmgkwlmzyevqjw. Do not DROP leftover public.people_* or panorama_daily.
- /lab /ask /workbench /demo /strategy /app /workspace and Formulator are retired (301 to /). Do not revive file upload.
- Maintenance: do not start new layers. Restarting development later starts with nightly automatic E1, not skills registry / Signal Agent / sandbox / Tier 3 / data-v2.
- Numbers come from SQL and templates. The model picks tools and writes hypotheses only. Public site is aggregate-only. Visitor min_cell = 50.
- Shipped scope = architecture §11 and this briefing. Architecture §6 is the roadmap. Do not present unbuilt items as live.

When done, reply in 简体中文:
1) what is live vs not
2) data path from contract to page
3) recruiter click order (10–15 min)
4) remaining uncertainties
```

---

## 1. What this is (and is not)

Simon Zhang’s public case for **People Analytics systems**: HR domain knowledge, data science, and enterprise data governance sit **in front of** AI.

Core claim: strong AI does not fix weak enterprise data — and ungoverned agents make weak data worse.

It is **not**: a customer warehouse, a KPI wall, ChatGPT-over-SQL, or the retired file-analysis experiment (`/lab`, Data Formulator on port 5567, `app.peopleanalyticsai.net`).

---

## 2. Frozen facts (do not invent new ones)

| Item | Value |
| --- | --- |
| Dataset | Synthetic GlobalTech · tag `data-v1` |
| Simulator seed | `20260301` |
| Window | 2021-09-01 → **2026-08-31** |
| Certified Headcount | **49,823** |
| Site acceptance tag | `phase4-p1-r6` |
| E1 run | `12cc1068-ed1b-48f1-9e36-959813a1fe49` · **100 / 101** · blocking families all pass |
| Only E1 miss | `E1-LLM-ATTEMPTED-OK` = `skipped_by_budget` (LLM usage rate 0 on that run) |
| Visitor `min_cell` | 50 |
| Demo identities | `demo-external-viewer` · `demo-leader-engineering` · `demo-hrbp` · `demo-people-analyst` |
| MCP | `https://peopleanalyticsai.net/api/mcp` · public demo token · aggregate only · maps to visitor |

Lake parquet is not in git. QuantReview is a different product; this repo is fail-closed against its databases.

---

## 3. Public surface

Primary nav: Home, Enterprise Demo, Architecture, Perspective, About.  
Footer also: Connect via MCP, Dataset.

| URL | Why it exists |
| --- | --- |
| `/` | One-line positioning + certified snapshot facts |
| `/enterprise-demo` | Three cases, one click each |
| `/enterprise-demo/trust` | Case 1 — can I trust this number? |
| `/enterprise-demo/incident` | Case 2 — Headcount drop: pipeline fault vs business |
| `/enterprise-demo/attrition` | Case 3 — Engineering attrition; follow-up ask |
| `/enterprise-demo/metrics` | Metric Explorer |
| `/architecture` | How certified numbers are produced |
| `/perspective` | Why governance is the People AI problem |
| `/about` | Who built it |
| `/dataset` | Synthetic declaration, scenarios, freshness card |
| `/connect` | 15 read-only MCP tools |

Retired URLs 301 to `/`. Do not demo them.

**Three cases (recruiter spine)**

1. **Can I trust this number?** Source → quality tests → definition → lineage → certified metric.  
2. **Why did Headcount suddenly drop?** Scenario `apac_hris_feed_incomplete` (2026-08-14 extract fault). Incidents do not move the certified pointer.  
3. **Why is Engineering attrition increasing?** Scenario `engineering_apac_attrition_rise`. Evidence vs hypotheses; skill coverage is aggregate. Dataset also contains Case 4 (`hiring_slowdown_hm_latency`) with **no page** in this release.

---

## 4. Runtime (a click or a question)

Browser → **Vercel Next.js** → Postgres RPCs `people_get_*` (role `people_app`, pooler 6543) → **Supabase `people_v2`**. Pages never scan lake files.

Ask and MCP share the same **15 tools** (no free-form SQL, no `list_skills` / `run_skill`):

`list_metrics` · `get_metric` · `get_metric_trend` · `get_metric_breakdown` · `get_metric_definition` · `list_entities` · `describe_entity` · `get_join_paths` · `get_glossary_term` · `get_lineage` · `get_source_health` · `get_quality_tests` · `get_quality_incidents` · `get_serving_snapshot` · `get_skill_coverage`

- **Tier 1:** deterministic metric questions.  
- **Tier 2:** exploratory; model may plan once; on failure the skeleton stays (headline/facts/tools unchanged).  
- **Refuse:** person-level, injection, suppression bypass, SQL.  
- **Critic:** numbers vs tool results, causal verbs, suppression.  
- LLM budget: `people_try_consume_llm` — successful calls count `per_ip_daily`; attempts count even on failure. Org scope comes from the identity row, not from the prompt.

Policy: SQL tables + FORCE RLS. `effective_min_cell = max(metric_min_cell, identity_min_cell)`. Engineering leader and HRBP are bound to Engineering; visitor and analyst are not.

---

## 5. Data flow (how numbers are made)

```text
Pinned source contracts (Frappe HR / Greenhouse Harvest v3 shape, plus public O*NET, BLS, Microsoft Learn)
    → mapping (human-reviewed) → canonical People model
    → lake people_bronze / people_silver / people_gold   (files; history; employee-month ledgers stay here)
    → quality tests (fail → incident, do not silently change dashboards)
    → publish marts only into people_v2
    → metric YAML → generated people_get_* RPCs
    → site / MCP / eval
```

Identity matching: `transaction` | `employee_id` | `manual` only. **No name or email join.**

Website-facing queries read curated serving tables. Do not add an employee-month fact ledger to Postgres.

`docs/PEOPLE_SOURCE_CONTRACT_FIRST.md` still pins source versions, but GATE 1 identity/table-name choices are **superseded** by `docs/PEOPLE_DATA_ARCHITECTURE.md`.

---

## 6. Recruiter walk (10–15 minutes)

Say up front: synthetic, not a real company. Then three beats: **trusted number → incident you must not publish as a workforce change → analysis that separates evidence from explanation.** Do not open a chat box first. Do not mention `/lab`.

1. Home — certified Headcount 49,823, as-of 2026-08-31.  
2. Enterprise Demo — the three questions.  
3. Case 1 Trust — definition drawer, tests, lineage.  
4. Case 2 Incident — incomplete feed ≠ attrition.  
5. Case 3 Attrition — breakdown + hypotheses; optional follow-up.  
6. Architecture — SQL produces values; the model writes hypotheses; min_cell rule.  
7. Dataset — simulator + scenarios.  
8. Connect — same tools in Cursor.  
9. Perspective + About — why, and who.

If they ask “would this work at 5k–50k employees?”: the snapshot is already ~50k headcount. A real company replaces the simulator and four demo identities with their HRIS/ATS and SSO; it does not start with NL-to-SQL. Sequence: contract → identity → a few certified metrics → org RLS → incident process → then bounded ask/MCP.

---

## 7. Live vs not (interview boundary)

**Live:** frozen `data-v1` serving; certified metrics; four identities + RLS; three cases; Metric Explorer; 15 MCP tools; E1 101 written to `people_eval_run` / `people_eval_result`; Trust scorecard; `/lab` gone; C4 leftover Formulator/DNS/staging-anon reads closed (2026-09-06).

**Not live (do not demo as shipped):** skills registry / `SKILL.md`; Signal Agent / briefs / Signals page; Case 4 page; `people_get_metric_sandbox`; Tier 3 multi-agent; data-v2 thaw; nightly automatic E1; successful LLM-upstream path on the last E1 run (`llm_usage_rate` 0); overlapping-query suppression; access-log product UI; person-level output (public site **never**).

**Owner waits documented 2026-09-06 (not re-queried for this briefing):** C2 = UTC day cut + new IP + delete Production `DEEPSEEK_BASE_URL`, then llm-family rerun only. C3 = Dataset FRESHNESS flips only after healthcheck `consecutive_days >= 3` (rows for 9/4 and 9/6; **do not backfill 9/5**).

Restarting development: **nightly automatic E1 first**, not new layers.

---

## 8. Constraints (fail closed)

| Do | Do not |
| --- | --- |
| Prefix `people_*` | Rename/drop QuantReview leftovers (`panorama_daily`, unprefixed `public` objects) |
| People v2 on `zapmigfrtnwnkmezjefx` only | Connect apply/publish scripts to `fyvivwgyisrtmehzjqlv` or `kgxbomcmgkwlmzyevqjw` |
| Single-column case studies | Generic dashboards, three-column workbench, public file upload |
| Distinguish proposal / assumption / certified definition / missing evidence | Causal language unless a skill supports it |
| Keep `AIGP/` local | Commit `AIGP/` or `.env*` |

Cursor rules (always apply): `.cursor/rules/people-maintenance.mdc`, `people-naming.mdc`, `people-strategy.mdc`.

---

## 9. Read next (only if needed)

| File | Use |
| --- | --- |
| `README.md` | Local run |
| `docs/PEOPLE_AI_AGENT_ARCHITECTURE.md` | §0–2 principles, §8 decisions, **§11 shipped** |
| `docs/PEOPLE_DATA_ARCHITECTURE.md` | Canonical grains, RLS, publish |
| `data-platform/README.md` and `data-platform/docs/DATA_ARCHITECTURE.md` | Lake vs serving placement |
| `src/lib/people/demo-cases.ts` | Case copy |
| `docs/PEOPLE_PHASE4_HANDOFF.md` | MCP / budget short handoff |
| `docs/PEOPLE_DATA_V1.md` | Freeze tag / seed |
| `docs/phase4/e1-scorecard.md` | Last eval numbers |
| `docs/phase4/phase4_p1_r6_closeout.md` | C2 / C3 / C4 |

Skip unless the owner names that job: `apps/formulator/**`, GATE review novels, `PEOPLE_REHEARSAL_0P0*.md`, `PEOPLE_6A/6B/6C_*.md`, field-provenance CSV, QuantReview, `AIGP/`.
