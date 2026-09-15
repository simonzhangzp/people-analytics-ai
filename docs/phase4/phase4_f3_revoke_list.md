# F3 follow-up — /lab retired; staging GRANT is QuantReview ops

Production `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` were removed by owner. `/lab` and the workbench/strategy/ask/app/workspace surfaces are deleted; those URLs 301 to `/`.

C4 on 2026-09-06 revoked anon privileges on leftover staging `public.people_*` only. Do not ALTER QuantReview production (`fyvivwgyisrtmehzjqlv`). Do not `DROP` tables. `people_consume_ai_quota` stays.

## Staging anon after C4 (2026-09-06 re-probe)

### `public.people_*` now 401 to anon (revoked)

- `people_mart_workforce_overview`
- `people_dim_worker` (person-grain)
- `people_metric_definition`
- `people_serving_snapshot`

### QuantReview table left readable to anon (do not revoke)

- `panorama_daily` — QuantReview still reads this; still HTTP 200

### Already 401 to anon (no revoke needed for read)

- `people_ai_usage`
- `people_workspaces`
- `people_datasets`

### 404 / not in staging public (no action)

- `people_snap_worker_month`
- `people_agent_trace`
- unprefixed `workspaces` / `datasets` / `metric_definitions`

## C4 infra (verified empty / already removed)

- Hetzner `edgeai@37.27.107.154`: no Docker, port 5567 closed, no Formulator
- `app.peopleanalyticsai.net`: NXDOMAIN; Vercel has no `app.` cert
- Evidence: `docs/phase4/phase4_f3_anon_probe.json`
