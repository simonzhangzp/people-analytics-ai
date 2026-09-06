# F3 follow-up — /lab retired; staging GRANT is QuantReview ops

Production `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` were removed by owner. `/lab` and the workbench/strategy/ask/app/workspace surfaces are deleted; those URLs 301 to `/`.

This repo must not ALTER or DROP objects on QuantReview staging (`kgxbomcmgkwlmzyevqjw`). `people_consume_ai_quota` stays; we only stopped calling it.

## Staging anon SELECT still open (owner to confirm QuantReview app does not depend on anon reads, then revoke)

### `public.people_*` that returned rows to anon (2026-09-06 probe)

- `people_mart_workforce_overview`
- `people_dim_worker` (person-grain)
- `people_metric_definition`
- `people_serving_snapshot`

### QuantReview table that returned rows to anon

- `panorama_daily`

### Already 401 to anon (no revoke needed for read)

- `people_ai_usage`
- `people_workspaces`
- `people_datasets`

### 404 / not in staging public (no action)

- `people_snap_worker_month`
- `people_agent_trace`
- unprefixed `workspaces` / `datasets` / `metric_definitions`

## Owner ops (not executed here)

- Stop the Hetzner Data Formulator container on port 5567
- Remove DNS and certificates for `app.peopleanalyticsai.net` so the retired analysis server is not left on the public internet
