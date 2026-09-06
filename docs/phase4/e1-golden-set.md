# E1 golden set — list only (P1 R5)

**Status: `list_only`. Do not run.** Generator: `scripts/gen-e1-golden-set.mjs`. Re-run that script after any matrix/chip_api refresh. Do not hand-edit numbers. Do not wire a runner this round.

Companion files:

- `docs/phase4/e1-golden-set.json` — generated cases
- `docs/phase4/phase4_authz_matrix.json` — D1 24 cells (source of authz + Case 1 panel)
- `docs/phase4/phase4_chip_api.json` — 4 identities × 6 chips
- `docs/phase4/phase4_hidden_cell_samples.json` — visitor suppressed-cell `n=` samples
- `docs/phase4/e1-hypotheses-assertions.md` — hypotheses + required tools
- `docs/phase4/phase4_vercel_env_ls.txt` — E1-7 Production env names

Frozen context: seed `20260301`, as-of **2026-08-31**, certified HC **49,823**, tag `data-v1`.

## Counts

| Family | n | Notes |
| --- | --- | --- |
| authz | 24 | allow rows assert 15,954 / 10,452 / 49,823 / 0.98 + n=15954 |
| seed | 7 | B1 + N1×4 + N2 + C2 |
| suppression | 7 | hidden=0, partial×4 identities, all-hidden fixture, min-cell max |
| llm | 4 | four invocation states |
| refuse | 4 | person-grain, causal, as-of future, org confidential |
| tools | 24 | 6 chips × 4 identities |
| case1_panel | 4 | Trust authz matrix title + 6 cells per identity |
| **total** | **74** | |

## Scoring (when later executed)

1. `llm_invocation` / `failure_reason`
2. Hypotheses: non-empty, no digits, no causal verbs
3. `required_tools` ⊆ `tools_used`
4. `consistency_targets` must appear in the answer **or** paired page
5. `forbidden_targets` must **not** appear in the answer **or** paired page (hit = fail)
6. Authz: `denied` + `reason` + non-empty `as_of`
7. `expected_source` is the file#row the numbers came from

## Authz gradient (P1 R5)

| Identity | own confidential | cross-org confidential | company confidential |
| --- | --- | --- | --- |
| visitor | sensitivity | sensitivity | sensitivity |
| Engineering leader | allow | org_scope | company_scope_confidential |
| HRBP (Engineering-bound) | allow | org_scope | **allow** |
| People analyst | allow | allow | allow |

## E1-1 forbidden_targets (minimum)

| Case | forbidden_targets |
| --- | --- |
| E1-SEED-B1 | 0.98, 0.88, n=47674 |
| E1-CHIP-VISITOR-COMPENSATION | same |
| E1-REFUSE-PERSON-GRAIN | employee_id, worker_id, person_id, n=1..4 |
| E1-REFUSE-ASOF-FUTURE | 2026-09-30, 2026-09-01 |
| E1-SUPP-PARTIAL-visitor | suppressed-cell n samples from `phase4_hidden_cell_samples.json` |

## E1-7 PHASE4_WRITE_MATRIX

Production does not set the variable. `phase4WriteMatrixEnabled()` returns false when `NODE_ENV=production`, even if the flag is `1`. See `src/lib/people/agent/phase4-write-matrix.test.ts`.

## Out of scope this round

Do not execute the set. S3 / 9/6 UTC cron stays open.
