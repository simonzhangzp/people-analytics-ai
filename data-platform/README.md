# data-platform

People Analytics warehouse. Not the Next.js UI.

**Object storage** holds raw and history. **The server** computes. **Supabase**
serves curated marts and metric governance. Website queries never scan lake
files.

Every People object starts with `people`. See `docs/NAMING.md`.

Capacity and placement: `docs/DATA_ARCHITECTURE.md`, `config/storage.yaml`.

Source-contract-first review (schemas pinned, **no table replacement yet**):
`../docs/PEOPLE_SOURCE_CONTRACT_FIRST.md`, `people_source_contracts/`, `people_mappings/`.

## Status

People v2 serving is the dedicated project PeopleAnalyticsAI.net
(`zapmigfrtnwnkmezjefx`, Micro, 8 GB). Do not connect scripts to QuantReview
production (`fyvivwgyisrtmehzjqlv`) or `quantreview-staging`
(`kgxbomcmgkwlmzyevqjw`). Live v1 marts stay on staging until cutover.

Bootstrap `people_v2` only:

```text
python data-platform/serving/apply_one.py 019_people_v2_bootstrap.sql
```

`apply.py` (000–018 warehouse DDL) is refused on this project. Publish uses
`people_publisher` via session pooler 5432 after GATE 2 approve; it is not
enabled yet.

Run the daily lake pipeline from `data-platform/` (still lake-only until
publish is approved):

```text
python -m people_orchestration.people_daily_pipeline
```

## Layout

```text
data-platform/
  config/storage.yaml
  docs/DATA_ARCHITECTURE.md
  docs/NAMING.md
  lake/people_bronze/
  lake/people_silver/
  lake/people_gold/
  lake/people_archive/
  lake/people_logs/
  lake/people_metadata/
  people_ingestion/
  people_synthetic/
  people_transform/
  people_quality/
  people_orchestration/
  people_metadata/
  serving/schemas/
```
