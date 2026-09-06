# P1 R6 closeout — owner ops (not executed in this repo)

## C4 — do not run from this repository

Fail-closed: no DDL on QuantReview production (`fyvivwgyisrtmehzjqlv`) or staging (`kgxbomcmgkwlmzyevqjw`).

1. **Hetzner:** stop the Data Formulator container on port **5567**.
2. **DNS / TLS:** remove `app.peopleanalyticsai.net` so the retired analysis server is not left on the public internet.
3. **Staging anon SELECT:** confirm the QuantReview app does **not** depend on the anon key reading `panorama_daily` (or the `public.people_*` tables below). Then revoke. Detail: `docs/phase4/phase4_f3_revoke_list.md`.

### `public.people_*` that returned rows to anon

- `people_mart_workforce_overview`
- `people_dim_worker` (person-grain)
- `people_metric_definition`
- `people_serving_snapshot`

### QuantReview table (confirm separately)

- `panorama_daily`

## C2 — DeepSeek URL

Delete Production `DEEPSEEK_BASE_URL` so the code default `https://api.deepseek.com` is used. After the UTC day cut, a **new IP** should ask one free-form question (`Why is Engineering voluntary attrition increasing?`) and capture `llm_used=true` with non-null `tokens_in` / `tokens_out`. Then rerun only the E1 llm family + garbage stub:

```text
E1_ONLY_FAMILIES=llm E1_MERGE_PRIOR=1 GIT_TAG=phase4-p1-r6 PHASE4_BASE=https://peopleanalyticsai.net node scripts/run-e1-golden-set.mjs
```

Do not rerun all 101 cases.

## C3 — S3 freshness

Do not insert missing `people_serving_run` rows. Flip the Dataset FRESHNESS card only when `people_healthcheck_status().consecutive_days >= 3` and **Last serving check** is read from that RPC. Need successful crons on **2026-09-07** and **2026-09-08** (9/5 is already missing).
