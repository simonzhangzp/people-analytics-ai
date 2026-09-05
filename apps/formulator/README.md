# People Analytics Formulator

Docker overlay on [Microsoft Data Formulator](https://github.com/microsoft/data-formulator) 0.8 (MIT).

Pinned commit: `5477f0e236426dc8f74a498ec400414fba7fbc0f`.

The Next.js site at `peopleanalyticsai.net` remains the marketing, strategy, and architecture surface. This image is the analysis workspace intended for `app.peopleanalyticsai.net`.

Uploaded Excel and CSV files are stored in the `people_formulator_home` volume. They are not saved on the marketing site.

## People layer

`people_layer/knowledge/rules/` seeds eight always-apply rules (each body ≤ 350 characters, each description ≤ 100) covering:

- People domain
- employee identifiers
- snapshot dates
- `SUM(headcount)` on aggregated files
- immediate answers
- provisional voluntary attrition
- next diagnostic cuts
- executive story order

`entrypoint.py` patches Data Formulator's `KnowledgeStore` before the app starts.

## Run

Docker is required for this path.

```bash
copy apps/formulator/.env.example apps/formulator/.env
docker compose -f apps/formulator/docker-compose.yml up --build
```

Then set `NEXT_PUBLIC_FORMULATOR_URL=http://localhost:5567` (or `https://app.peopleanalyticsai.net` in production).

To clone the upstream source locally without Docker:

```bash
npm run formulator:bootstrap
```

## Tests

```bash
python apps/formulator/people_layer/test_rules.py
```
