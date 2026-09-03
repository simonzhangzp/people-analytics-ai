# Data architecture

Measured 2026-08-30. Naming rule updated 2026-08-30.

## Layers

1. **Object storage / server disk** — durable raw and historical files.
2. **Server** — generate, ingest, transform, test, upsert marts.
3. **Supabase** — serving and governance only.

Website-facing queries read curated Supabase tables. They must not scan lake
files during normal page loads.

Every People object starts with `people`. Details: `docs/NAMING.md`.

## Current capacity

| Resource | Fact |
| --- | --- |
| Hetzner `edgeai@37.27.107.154` | 436 GB disk, 47 GB used, **367 GB free**. 20 vCPU, 62 GiB RAM. No Docker. No People directory yet. |
| QuantReview on that host | `/home/edgeai` = 42 GB (`quantreview-backend` 22 GB, `quantreview-state` 15 GB) |
| People v2 serving Supabase | **PeopleAnalyticsAI.net** (`zapmigfrtnwnkmezjefx`), Micro, Disk 8 GB. Schema `people_v2`. |
| People v1 live site | `quantreview-staging` (`kgxbomcmgkwlmzyevqjw`) `public.people_*` — do not migrate or clean until step 9. |
| QuantReview production | `fyvivwgyisrtmehzjqlv` — fail-closed; never connect. |
| Vercel | no durable disk |
| `quantscan` 104.243.40.215 | SSH host key changed; not measured |

People serving still contains a leftover QuantReview `public` copy (~692 MB, including `panorama_daily`). Those tables stay unprefixed. Drop them only after a backup, if you want that 8 GB quota back.

## Placement

| Data | Layer |
| --- | --- |
| Synthetic HR extracts, incremental event files, raw ATS/LMS dumps | Lake (`people_bronze` / `people_silver`) |
| Greenhouse v3 / Frappe HR payloads, O*NET / BLS / Microsoft Learn | Lake (`people_bronze`). JSearch is not a People source. |
| dbt staging / intermediate / run artifacts | Server working set, rebuildable |
| Certified metrics, freshness, incidents, API quota | Supabase `people_metric_definition`, `people_source_freshness`, `people_api_usage` |
| `people_mart_workforce_overview` and other `people_mart_*` slices | Supabase serving |
| `people_dim_*` without names/emails, if a drill-down page needs it | Supabase serving, 50k rows is fine |
| Employee-month fact ledgers, movement events, survey rows, job descriptions | Lake only |

## Why this project, not QuantReview production

v2 serving is the dedicated PeopleAnalyticsAI.net project. QuantReview production stays untouched. Staging keeps v1 `public.people_*` until cutover. v2 objects live in `people_v2`, not `public`. Do not add an employee-month fact ledger to Postgres.

## Refresh

Lake files are written by scheduled jobs on the server. dbt reads the lake,
writes DuckDB models, then upserts **marts only** into Supabase. The Next.js
site queries those marts.
