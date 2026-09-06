# Phase 4 verification rules

These rules exist because P1 R1/R2 failed when cover copy, screenshots, and self-check files disagreed.

## Status is evidence, not intent

1. An item stays `open` until a reviewer can observe the claimed behaviour in a dated artifact (API JSON, screenshot, SQL result, or tagged deploy). Changing code is not a pass.
2. Do not write 「通过」 in a cover note while the same item is still `open`.
3. `docs/phase4/phase4_reverify_problems.json` lists every unresolved item named in the cover, plus leftovers that are still blocking. Schema:

```json
[
  {
    "id": "N1",
    "status": "open|closed",
    "summary": "one sentence",
    "evidence": "path or trace_id",
    "blocking": true
  }
]
```

4. An empty array is allowed only when the cover also says there are no open items.
5. Every round ships `docs/phase4/phase4_chip_api.json` (4 identities × 6 chips). Screenshots cannot catch hardcoded identity words.

## How to close an item

- **N1**: 24-grid locations headlines use that identity’s `identity_label` and the matching `min_cell`.
- **N2**: visitor chip-04 denied with `{identity_label}`; leader/HRBP/analyst Engineering median allowed; one leader non-Engineering deny with `reason: org_scope`.
- **B2-a**: full response diff (headline / facts / hypotheses / tools) in `phase4_llm_invocation_matrix.json` `b2a_diff`. Architecture first screen states: the model chooses tools; SQL/templates generate values and fact sentences; hypotheses are the only model-authored text; planner failure leaves headline/facts/tools unchanged. E1 scores hypotheses and required tools, not headline/facts similarity.
- **B2-b**: `failure_reason` is one of `upstream_timeout | upstream_error | upstream_refusal | internal_code_error | schema_violation`. A thrown `ReferenceError` is `internal_code_error`.
- **F1**: annotated tag is on the remote, and the cover states tag ↔ `dpl_`.
- **S2 chart ticks**: mid-tick is `[yMin, mid, yMax]` from the full series min/max plus pad. Screenshot compression is not a second scale. Record in this file, not in copy audit.
- **S3 / cron**: close only when `people_healthcheck_status().consecutive_days >= 3` and the Dataset FRESHNESS card shows streak + last serving check from that RPC. Do not insert missing `people_serving_run` rows. 9/5 is missing; 9/4 was GATE 3 (19:09 UTC), 9/6 is Vercel Cron (`10:00:00Z`).
- **C2**: leader + company-level confidential (`job_family` null) returns `denied` / `company_scope_confidential`; leader + company headcount is allowed. Leader + Sales headcount is allowed; leader + Sales confidential is `org_scope`. HRBP is Engineering-bound: Sales confidential is `org_scope`; company-level confidential is allowed.

## After any DDL migration

Re-run the FORCE RLS verification and the people_app negative SELECT check
before the deploy is considered verified. Record the table count and
unforced/force_missing in the round's problems file.

E1 golden set is list-only until this file's D1–D5 items and S3 are closed, and review approves the R6 additions. Do not run the set before that approval.
