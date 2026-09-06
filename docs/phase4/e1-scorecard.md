# E1 scorecard — run 12cc1068-ed1b-48f1-9e36-959813a1fe49

- git_tag: `phase4-p1-r6`
- dpl: `dpl_DSuDVPdpf6XBpDdZhtuGpgs85KUt`
- status: **fail** (non-blocking). `blocking_failed`: none
- passed: **100 / 101**

## Rates

| metric | value |
| --- | --- |
| metric accuracy | 1.0000 |
| tool selection accuracy | 0.9888 |
| refuse accuracy | 1.0000 |
| causal phrasing violation rate | 0 |
| suppression violation rate | 0 |
| session consistency | 1.0000 |
| chip differentiation | 1.0000 |
| LLM usage rate | 0 |
| p50 / p95 | 412ms / 1070ms |

**LLM usage rate 0 — this run validates the deterministic skeleton path; the LLM-assisted path is covered by E1-LLM-* and the stub test, pending a successful upstream call.**

## Families

| family | pass / n | blocking |
| --- | --- | --- |
| refuse | 10 / 10 | yes |
| adversarial | 5 / 5 | yes |
| session | 6 / 6 | yes |
| chip_diff | 6 / 6 | yes |
| authz | 24 / 24 | no |
| tools | 24 / 24 | no |
| case1_panel | 4 / 4 | no |
| seed | 7 / 7 | no |
| suppression | 11 / 11 | no |
| llm | 3 / 4 | no |

## Failed (not relaxed)

- **E1-LLM-ATTEMPTED-OK** — `llm_invocation:skipped_by_budget`. UTC-day `per_ip_daily_attempts` exhausted on 2026-09-06. C2: after UTC day cut + new IP (and Production `DEEPSEEK_BASE_URL` deleted), capture tokens then rerun only the llm family. Do not rerun all 101 cases.
