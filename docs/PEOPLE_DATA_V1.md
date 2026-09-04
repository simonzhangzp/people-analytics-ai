# People data-v1 冻结交回

**Stop.** simulator 冻结为 git tag `data-v1`。GATE 3 前不再改 simulator。任何引擎/scenario/baseline 改动即新数据版本。serving 仅 PeopleAnalyticsAI.net（`zapmigfrtnwnkmezjefx`）。Lake parquet **不进 git**。

seed **`20260301`** · 窗口 `2021-09-01`–`2026-08-31` · 主前缀 `rehearsal_1p00` · 对照 `rehearsal_1p00_nocase3`（不进 serving）。

Lake 闸：`python data-platform/simulator/backfill.py --i-have-owner-approval`（本轮对照 gold 用已有 bronze transform；闸门 `--resume-from-lakes`）。`blocking = []`。

JSON：`data-platform/simulator/fixtures/rehearsal_1p00/report.json`、`publish_data_v1.json`、`parity_data_v1.json`、`metrics_parquet_data_v1.json`、`role_metric_matrix.json`、`gold_sha256.json`。

## Lineage（打 tag 后以 tag 的 commit sha 为准）

| 项 | 值 |
| --- | --- |
| seed | `20260301` |
| tag `data-v1` commit | `32c89f7b0838e0a687194763bd2469697627df67` |
| 回填当时 `simulator_code_sha`（HEAD 于 lake 闸门） | `4668c2c2d59ddd7365b5dffb9dfdebc48614cde2` |
| baseline sha256 | `e3ee34e26d64cb3a439f2c5457d33090c3ae218190af8956bdb4de8b81928e25` |
| Case 3 scenario | `engineering_apac_attrition_rise` v2 |
| gold snap_worker_month sha256 | `a1de36711be6eac2aef4509a01a0b60fb52f48f908c531aec9a84b5c26c6f137` |
| 第二位置副本 | `D:\People_Lake_Replica\`（无 Hetzner storage-box 凭证；未进 git） |

`people_v2.people_serving_run` run_id=`data-v1`；pointer `current_certified` as_of `2026-08-31`，**仅在 policy verify 通过后移动**。

## D2 分解表（Engineering trailing-3m 自愿离职，有 scenario）

| 桶 | n |
| --- | ---: |
| slice hazard（APAC × Engineering × &lt;1y / 1–3y） | 222 |
| manager_departure | **0** |
| other | 454 |
| 合计 | 676 |

经理离职贡献 = 0，因此 Case 3 `manager_change_cluster` 保持 reorg 驱动 T7（不离职）。

## Case 3 delta 与闭式差

| | 年化 | person-months | voluntary terms |
| --- | ---: | ---: | ---: |
| 有 scenario | 0.1698 | 47,782 | 676 |
| 无 scenario（`rehearsal_1p00_nocase3`） | 0.1432 | 48,003 | 573 |
| 实测 delta | **+2.66 pp** | | |
| 闭式 delta | **+2.40 pp** | | |
| \|实测 − 闭式\| | **0.26 pp**（闸 ≤ 0.50） | | |

## D3 manager change 三类计数与切片倍率

全历史 `people_evt_manager_change`：

| change_reason | n |
| --- | ---: |
| reorg | 263,046 |
| manager_departure | 34,315 |
| transfer | 14,783 |
| 合计 | 312,144 |

切片（2025-10-01 起，as-of 2026-08-31 certified；含月末树认证写入）：

| reason | slice | control |
| --- | ---: | ---: |
| reorg | 3,486 | 65,336 |
| manager_departure | 300 | 6,319 |
| transfer | 84 | 2,735 |

**2–4× 只对 reorg 子类、排除月末 `last_day`（树认证 emit）：**

| | n_workers | reorg 变更（非月末） | per worker |
| --- | ---: | ---: | ---: |
| slice | 2,149 | 212 | 0.0987 |
| control | 47,674 | 1,909 | 0.0400 |
| 倍率 | | | **2.47×**（闸 2–4×） |

三类全部计入年化 manager change（含月末树修复 reorg，年化 147.64%）。未改事件三类定义。

## D4 recruiter_load 与 Little's-law

| 项 | 值 |
| --- | ---: |
| as-of recruiters | **110** |
| as-of recruiter_load | **7.9455**（range 5–30） |
| openings | 55,351，**全部** `recruiter_id` 非空 |
| as-of open requisitions | 874 |
| trailing-12m hires | 10,489 → 月均 874.08 |
| TTF p50 | 33.0 天 = 1.0841 月 |
| Little's expected open | 947.6 |
| abs_gap / rel_gap | 73.6 / **0.0777**（闸 rel_gap ≤ 0.5） |

`people_dim_recruiter` serving 行数 24（Greenhouse 用户维）；负荷与分配以 `people_snap_recruiter_month` 的 110 人为准。

## D4 / D6 培训人均小时

| 项 | 值 |
| --- | ---: |
| training 行 | 990,000（~9k 场/年 × ~22 人 × 5 年） |
| 次均小时 | 5.0 |
| 全窗 hours / 期末 HC | 99.26（约 5 年累计） |
| trailing-12m `training_hours_per_worker` | **20.41**（range 8–60；目标 ~20） |

来源：ATD State of the Industry ~15–25 小时/人/年；baseline `learning.hours_per_worker_year: 20`。

## D5 树完整性

As-of 2026-08-31 certified：

| 项 | 值 | 闸 |
| --- | ---: | --- |
| orphan_manager_at_month_end | **0** | = 0 |
| CEO 根 | **1** | = 1 |
| max_depth | **8** | ≤ 8（baseline `org.max_depth`） |
| span_max | **15** | ≤ 15 |
| span_mean | 8.47 | 5–9（metric 5–10） |
| is_manager | 11.81%（5,884 / 49,823） | 10–15% |

层级分布（certified BFS）：

| depth | n |
| --- | ---: |
| 0 | 1 |
| 1 | 13 |
| 2 | 169 |
| 3 | 1,934 |
| 4 | 9,779 |
| 5 | 10,119 |
| 6 | 10,205 |
| 7 | 10,212 |
| 8 | 7,391 |

## 21 metric 新值（as-of 2026-08-31，parquet = RPC，tolerance 0）

| metric_id | 值 | expected_range | in_range |
| --- | ---: | --- | --- |
| headcount | 49,823 | [40000, 60000] | 是 |
| average_headcount | 48,437.08 | [30000, 55000] | 是 |
| hires | 10,261 | [5000, 25000] | 是 |
| rehires | 228 | [0, 3000] | 是 |
| voluntary_attrition_rate | 0.1396 | [0.08, 0.22] | 是 |
| involuntary_attrition_rate | 0.0262 | [0.01, 0.10] | 是 |
| regrettable_attrition_rate | 0.0340 | [0.00, 0.12] | 是 |
| promotion_rate | 0.0830 | [0.04, 0.14] | 是 |
| internal_mobility_rate | 0.0512 | [0.02, 0.20] | 是 |
| manager_turnover_rate | 0.1417 | [0.08, 0.22] | 是 |
| span_of_control | 8.467 | [5, 10] | 是 |
| time_to_fill_days | 33 | [10, 90] | 是 |
| time_in_stage_hours | 96 | [48, 720] | 是 |
| offer_acceptance_rate | 0.8415 | [0.50, 0.95] | 是 |
| applications_per_opening | 123.21 | [60, 250] | 是 |
| quality_of_hire | 0.5263 | [0.30, 0.80] | 是 |
| recruiter_load | 7.945 | [5, 30] | 是 |
| compa_ratio_median | 0.98 | [0.70, 1.30] | 是 |
| engagement_score | 3.666 | [2.5, 4.5] | 是 |
| training_hours_per_worker | 20.41 | [8, 60] | 是 |
| skill_coverage | 0.5718 | [0.30, 0.95] | 是 |

## Publish 分段体积（people_v2，publisher 可见；WAL 对 postgres 可读约 4 GiB 属 COPY 残留）

| 段 | db bytes before → after | delta |
| --- | ---: | ---: |
| dims_xw | 14,003,347 → 220,261,523 | 206,258,176 |
| facts_events | 220,261,523 → 1,562,930,323 | 1,342,668,800 |
| snapshots | 1,562,930,323 → 2,920,139,923 | 1,357,209,600 |
| marts | 2,920,139,923 → 2,926,472,339 | 6,332,416 |

落地后 `pg_database_size` ≈ **2.93 GiB**。配额 8 GiB − 2 GiB headroom = 6.44 GiB。EEOC/demographic 个人级未进 Postgres。

## Lake 体积（主世界 `rehearsal_1p00`）

| 层 | 字节 |
| --- | ---: |
| bronze | 630,185,339（≈ 601 MiB） |
| silver | 493,589,296（≈ 471 MiB） |
| gold | 353,761,937（≈ 337 MiB） |

## S7

- `serving/policy/*.yaml` 生成 GRANT/RLS；每表 swap 后 `apply_table`；post-publish `verify()` 失败则 **pointer 不动**。
- `people_app` LOGIN（密码只写 `D:\EdgeAI_Strategy\.env`，不进 git）。
- demo 四身份；`people_get_metric_for` / `_breakdown` 为 VOLATILE（写 access log）；抑制记 `people_suppression_log`。
- 角色 × 21 metric 矩阵：见 `role_metric_matrix.json`。

## 审核备注（未达或需知情）

1. D1 字节级重跑自动化是 **scale=0.02、两个月窗口、跑两次**（`test_gold_byte_reproducible.py`，已绿）。未在冻结前再做两次全窗 5% 重跑对照（耗时；5% 全窗字节一致与 1.0 gold 本就不可比）。
2. 第二位置是本机 `D:\People_Lake_Replica`，不是 Hetzner storage box（环境无凭证）。
3. `people_evt_manager_change` 在 serving 是 **view**（worker + worker_change.reason），gold parquet 不直接 COPY 进表。
4. postgres 角色不能 CHECKPOINT；step7 用 durable db+system 过闸，未把 4 GiB WAL 算进 publisher 占用。
