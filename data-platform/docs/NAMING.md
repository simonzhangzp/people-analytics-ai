# People object naming

Every People Analytics database object, lake path, RPC, and pipeline dataset
starts with `people`.

Examples:

- `people_mart_workforce_overview`
- `people_metric_definition`
- `people_workspaces`
- `people_workbench_metrics` (workbench JSON; not the warehouse catalog)
- `people_consume_ai_quota()`
- `data-platform/lake/people_bronze/`

Do not create unprefixed People tables in the shared Supabase project.
QuantReview leftovers in `public` (`panorama_daily` and related) stay
unprefixed on purpose.

Apply People v2 DDL only to PeopleAnalyticsAI.net (`zapmigfrtnwnkmezjefx`).
Refuse QuantReview production (`fyvivwgyisrtmehzjqlv`) and
`quantreview-staging` (`kgxbomcmgkwlmzyevqjw`).
