# P1 R6 closeout — owner ops (not executed in this repo)

Maintenance: only C2 and C3 remain for the agent. C4 is owner-only. Restarting development later starts with nightly E1, not new layers.

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

## C4 — why, and how you run it (not the agent)

`/lab` is gone, but two leftovers can still be reached from the public internet, and staging still lets the **anon** key read some tables. That is a security/ops cleanup, not a product feature.

Fail-closed: do not run this from this repo. Do not DDL QuantReview production (`fyvivwgyisrtmehzjqlv`) or staging (`kgxbomcmgkwlmzyevqjw`) via the agent.

1. **Hetzner Formulator (port 5567).** SSH to the box. `docker ps` and stop the container publishing `5567` (compose service `formulator`, image `people-analytics-formulator:0.8`). Disable `restart: unless-stopped` so it does not come back on reboot.
2. **DNS / TLS.** In the DNS host for `peopleanalyticsai.net`, delete `app.peopleanalyticsai.net` (A/AAAA/CNAME). Remove the certificate that served that name (Caddy / nginx / certbot / Hetzner). Check `https://app.peopleanalyticsai.net` no longer resolves or no longer serves the app.
3. **Staging anon SELECT.** Open the QuantReview **staging** project (`kgxbomcmgkwlmzyevqjw`). Confirm the QuantReview app still works **without** the anon key reading these tables. If a QuantReview screen breaks, stop. If not, in the Supabase SQL editor as a privileged role, `REVOKE SELECT` on:
   - `public.people_mart_workforce_overview`
   - `public.people_dim_worker`
   - `public.people_metric_definition`
   - `public.people_serving_snapshot`
   - and, separately, `public.panorama_daily` (QuantReview table — confirm first)

Do not `DROP` tables. Do not touch `people_consume_ai_quota`. Detail: `docs/phase4/phase4_f3_revoke_list.md`.
