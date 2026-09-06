# E1 golden set — list only (P1 R4)

**Status: `list_only`. Do not run.** Review this list before any eval execution. Do not change the eval runner in this round. Freeze the baseline only after D1–D5 and S3 are closed.

Companion files:

- `docs/phase4/e1-golden-set.json` — 49 cases
- `docs/phase4/e1-negative-seed.json` — B1 / N1 / N2 / C2 seeds (C2 reason is `company_scope_confidential`)
- `docs/phase4/e1-hypotheses-assertions.md` — hypotheses rules + required tools
- `docs/phase4/phase4_authz_matrix.json` — D1 24-cell source for the authz family

Frozen context: seed `20260301`, as-of **2026-08-31**, certified HC **49,823**, tag `data-v1`.

## Counts

| Family | n | Source |
| --- | --- | --- |
| authz | 24 | D1 matrix, 4 identities × 6 cells |
| seed | 7 | B1, N1×4 identities, N2, C2 |
| suppression | 4 | hidden=0, partial hide, all-hidden fixture, effective_min_cell max |
| llm | 4 | skipped_by_design / skipped_by_budget / attempted_ok / attempted_failed |
| refuse | 4 | person-grain, causal-in-hypotheses, as-of after freeze, org confidential |
| tools | 6 | one chip each |
| **total** | **49** | |

## Scoring (when later executed)

E1 does **not** score `attempted_ok` vs `attempted_failed` by headline/facts similarity. Those two states share headline, facts, and tools (`b2a_diff`). Score:

1. `llm_invocation` and `failure_reason`
2. Hypotheses: non-empty, no digits, no causal verbs (`hypotheses-eval.ts`)
3. `required_tools` ⊆ `tools_used` (extra allow-listed tools are fine)
4. `consistency_targets` must appear in the answer or on the paired page
5. Authz: `denied` + `reason` + non-empty `as_of`

`min_cell` as a **deny reason** is reserved for cell suppression, not `people_get_metric_for`. The 24 RPC cells therefore never return `reason=min_cell`. Threshold comparison is `effective_min_cell = max(metric_min_cell, identity_min_cell)` (`E1-SUPP-MINCELL-MAX`).

## Authz 24 (`E1-AUTHZ-01` … `24`)

Policy (Architecture §8.9):

| Identity | own_org HC | own_org compa | other_org HC | other_org compa | company HC | company compa |
| --- | --- | --- | --- | --- | --- | --- |
| visitor | allow | **sensitivity** | allow | **sensitivity** | allow | **sensitivity** |
| Engineering leader | allow | allow | **allow** | **org_scope** | allow | **company_scope_confidential** |
| HRBP | allow | allow | allow | allow | allow | allow |
| People analyst | allow | allow | allow | allow | allow | allow |

Cell mapping: own_org = Engineering, other_org = Sales, company_level = `job_family` null; non_confidential = `headcount`; confidential = `compa_ratio_median`.

Reason must match the check that fired (`check_fired` in the matrix). One reason must not cover two situations.

## Seeds

Same four production failures as `e1-negative-seed.json`. N1 is expanded to four identity rows so hardcoded “visitor min_cell” cannot hide. C2 must **not** accept `org_scope` for company-level confidential.

## Suppression

- `E1-SUPP-HIDDEN0` — People analyst tenure. Production fact: `No cells hidden at this grain (min_cell 5).` Fail if “among cells visible” appears.
- `E1-SUPP-PARTIAL` — visitor locations `44 of 104` at grain `location × tenure × grade`.
- `E1-SUPP-FULL` — **fixture only**. Production visitor tenure is not fully hidden. Drive `composeTenure` with every band below min_cell. Pass sentence: all tenure bands hidden; only the Engineering total is visible. Fail if withheld/error.
- `E1-SUPP-MINCELL-MAX` — leader compensation: YAML 10 vs identity 20 → effective 20, source `identity`. Trace must show all three fields.

## LLM four states

| Case | How to obtain |
| --- | --- |
| skipped_by_design | any chip |
| skipped_by_budget | free-form on a budget-exhausted IP; F3 notice exact |
| attempted_ok | `PHASE4_WRITE_MATRIX=1` or after budget reset; not assumed on production |
| attempted_failed | inject `ReferenceError` in the planner; `failure_reason=internal_code_error`; **no stack on the user surface** |

`attempted_failed` is the `internal_code_error` case. Do not add a fifth live network call.

## Refuse

- Person-grain (`employee_id` / named employees) → `refuse_reason=personal_data`, empty tools, **no aggregate substitute**.
- Causal question → facts remain descriptive; banned causal verbs fail hypotheses-eval.
- September 2026 (after freeze) → state freeze at 2026-08-31 / data-v1; do not invent a later month.
- Leader Sales compensation → `org_scope`, not `company_scope_confidential`.

## Tools (D4)

| Chip | Required tools |
| --- | --- |
| Which locations matter most? | `get_metric`, `get_metric_breakdown` |
| What should we investigate next? | `get_metric`, `get_metric_breakdown` |
| Show me the tenure breakdown | `get_metric`, `get_metric_breakdown` |
| What about compensation? | `get_metric` |
| Which critical skills have the largest gaps? | `get_skill_coverage` |
| How is voluntary attrition defined? | `get_metric_definition` |

Locations without `get_metric_breakdown` is an automatic fail.

## Out of scope this round

Do not execute the set. Do not wire a nightly runner. S3 / 9/6 UTC cron stays open. Baseline freeze waits for D1–D5 + S3 + list approval.
