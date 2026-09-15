# P1 R6 closeout — owner ops (not executed in this repo)

Maintenance: only C2 and C3 remain. C4 was executed 2026-09-06 (evidence below). Restarting development later starts with nightly E1, not new layers.

## C2 — what “UTC day cut + new IP” means

LLM quota is per hashed client IP per **UTC calendar day**. On 2026-09-06 this IP already had 13 attempt rows (`per_ip_daily_attempts` limit 10), so free-form asks return `skipped_by_budget` and never reach DeepSeek.

- **Day cut:** 00:00 UTC (20:00 America/New_York). After that, the daily attempt counter resets.
- **New IP:** phone hotspot, another network, or VPN. Same laptop on the same home IP can still be blocked until the cut, and is the safer way to prove a clean attempt.
- **Your step:** in Vercel Production, delete `DEEPSEEK_BASE_URL` (code default is `https://api.deepseek.com`). After the cut, from the new IP, open a case page or POST `/api/people/ask` with `Why is Engineering voluntary attrition increasing?`. Send the agent the JSON if `llm_used` is true and `tokens_in` / `tokens_out` are non-null. The agent then reruns **only** the E1 llm family:

```text
E1_ONLY_FAMILIES=llm E1_MERGE_PRIOR=1 GIT_TAG=phase4-p1-r6 PHASE4_BASE=https://peopleanalyticsai.net node scripts/run-e1-golden-set.mjs
```

## C3 — what “wait until 9/8” means

Dataset FRESHNESS on `/dataset` flips only when `people_healthcheck_status().consecutive_days >= 3`. Cron is `0 10 * * *` UTC (`/api/cron/people-healthcheck`). Rows exist for **9/4** and **9/6**; **9/5 is missing** and must not be backfilled. Streak is currently **1**. After **9/7** and **9/8** both succeed, streak becomes 3; then screenshot the FRESHNESS card (streak and Last serving check from the RPC). If either day fails, report the reason — do not insert a row.

## C4 — done 2026-09-06 (security closeout, not product)

`/lab` is gone. This was leftover exposure: a possible public Formulator, `app.peopleanalyticsai.net`, and staging anon reads of `public.people_*`. QuantReview production was not touched. Tables were not dropped. `people_consume_ai_quota` remains.

1. **Hetzner Formulator (port 5567).** `edgeai@37.27.107.154`: no Docker, nothing listening on 5567, no formulator directory, caddy/nginx/docker inactive. Port 5567 on `quantscan` (`104.243.40.215`) refused; SSH skipped because the host key changed. Nothing to stop.
2. **DNS / TLS.** `app.peopleanalyticsai.net` is NXDOMAIN. Vercel aliases/certs cover apex + `www` only — no `app.` certificate. Nameservers are Cloudflare; no Cloudflare API token in local env, so the dashboard was not opened. With NXDOMAIN and nothing listening, the public site is already gone.
3. **Staging anon.** QuantReview code uses `panorama_daily`; it does not reference `people_mart_*`. On staging (`kgxbomcmgkwlmzyevqjw`) only, `REVOKE ALL` from `anon` on:
   - `public.people_mart_workforce_overview`
   - `public.people_dim_worker`
   - `public.people_metric_definition`
   - `public.people_serving_snapshot`
   REST re-probe: those four return **401**; `panorama_daily` still **200** (left for QuantReview). `people_consume_ai_quota` still present. Evidence: `docs/phase4/phase4_f3_anon_probe.json`.

`authenticated` still has table grants on those leftover `people_*` rows; that is not the public anon-key path. Do not `DROP`. Detail: `docs/phase4/phase4_f3_revoke_list.md`.
