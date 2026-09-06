# E1 golden set — approved to run (P1 R6)

Generator: `scripts/gen-e1-golden-set.mjs`. Runner: `scripts/run-e1-golden-set.mjs`.
Review approved the 101-case list. Do not hand-edit numbers. Do not relax refuse / adversarial / session / chip_diff.

The original **74** cases are unchanged (same ids). R6 appends **27** cases (101 total).

## Counts

| Family | n | Notes |
| --- | --- | --- |
| authz | 24 | unchanged |
| seed | 7 | unchanged |
| suppression | 11 | prior 7 + E1-10 four all-hidden / empty / no 0.0% / critic |
| llm | 4 | unchanged |
| refuse | 10 | prior 4 + E1-11 six |
| tools | 24 | unchanged |
| case1_panel | 4 | unchanged |
| session | 6 | E1-8 sequential chips |
| chip_diff | 6 | E1-9 pairwise hypotheses |
| adversarial | 5 | E1-11 inject / diff-probe / personal filter |
| **total** | **101** | **+27 vs R5** |
