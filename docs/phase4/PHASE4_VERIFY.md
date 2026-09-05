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
- **B2-a**: full response diff (headline / facts / hypotheses / tools). If headlines match, architecture must say E1 does not score that text.
- **B2-b**: `failure_reason` is one of `upstream_timeout | upstream_error | upstream_refusal | internal_code_error | schema_violation`. A thrown `ReferenceError` is `internal_code_error`.
- **F1**: annotated tag is on the remote, and the cover states tag ↔ `dpl_`.
- **S3 / cron**: wait for the 9/6 UTC run; do not fake `ok=false` on production before that date.

E1 golden set stays paused except the three negative seeds in `docs/phase4/e1-negative-seed.json` (B1, N1, N2).
