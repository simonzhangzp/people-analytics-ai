# 全量 5 年 lake 回填报告（scale=1.0）

**6c 已 publish** 到 PeopleAnalyticsAI.net。交回见 [`docs/PEOPLE_6C_METRICS.md`](PEOPLE_6C_METRICS.md)。本页是 lake 回填证据（seed 20260301）。未做步骤 7，未改线上站。

JSON：`data-platform/simulator/fixtures/rehearsal_1p00/report.json`

seed `20260301` · 窗口 `2021-09-01`–`2026-08-31` · `python backfill.py --i-have-owner-approval`

无 scenario 对照前缀：`rehearsal_1p00_nocase3`（**control-only**，不进 serving gold）。

## 期末 certified headcount 按 region

As-of 2026-08-31，gold `people_snap_worker_month`。

| Region | Headcount |
| --- | ---: |
| AMER | 22,714 |
| EMEA | 13,008 |
| APAC | 14,311 |
| **合计** | **50,033** |

## 招聘完整性

| 指标 | 值 |
| --- | ---: |
| Hires（via T1） | 48,831 |
| Offers accepted | 48,831 |
| Openings | 54,353 |
| Cancelled | 5,426 |
| Cancel rate | **0.0998** |
| Applications | 7,018,166 |
| time_to_fill p50 / p90 | 32.0 / 81.0 |
| p90 / p50 | **2.5312**（门槛 ≥ 2.0） |

`hires == accepted`。Gold DQ **全部通过**（blocking 失败即停；本跑 `dq_failed = []`）。

### Stage aging（全历史 lake）

| Stage | p50 天 | p90 天 |
| --- | ---: | ---: |
| Offer | 4 | 8 |
| Onsite | 8 | 23 |
| Review | 3 | 11 |
| Screen | 5 | 11 |

### Source mix 与 Review→Screen

| Source | Share | Review→Screen |
| --- | ---: | ---: |
| inbound | 74.53% | 10.14% |
| sourced | 11.90% | 60.08% |
| referral | 8.63% | 44.75% |
| internal | 4.95% | 45.16% |

Inbound Review 5 日内拒绝 **75.79%**（校准带 60–80%；lognormal dwell）。

Apps / opening 均值：Engineering 174.1 · Sales 94.1 · Exec 23.0 · Other 116.4。

## Roll-forward（59 个月）

`max_abs_residual = 0`，`t1_bypass = 0`，`months = 59`。

| Month | Active | Hires | Rehires | Terms | Status in/out | Type in/out | Residual |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |
| 2026-03 | 48,753 | 875 | 14 | 633 | 46 / 50 | 24 / 0 | 0 |
| 2026-04 | 49,007 | 867 | 15 | 639 | 37 / 42 | 16 / 0 | 0 |
| 2026-05 | 49,220 | 893 | 16 | 710 | 42 / 44 | 16 / 0 | 0 |
| 2026-06 | 49,539 | 918 | 29 | 643 | 47 / 58 | 26 / 0 | 0 |
| 2026-07 | 49,830 | 896 | 17 | 652 | 48 / 47 | 29 / 0 | 0 |
| 2026-08 | 50,033 | 862 | 13 | 679 | 39 / 53 | 21 / 0 | 0 |

## Case 2 隔离

Employee full **仅周五**；08-07 与 08-14 均为周五，scenario 强制 full。`control_total` = 全部文档（含 Left）。

| 项 | 08-07 prior | 08-14 故障 |
| --- | --- | --- |
| mode | full | full |
| control_total | 84,107 | **84,317** |
| rows_received | 84,107 | **67,690** |
| volume test | 通过 | 失败 |
| isolated / pointer | — | 隔离，pointer 未动 |
| replay value_bad / expected | — | 40,382 / 49,859 |

## Case 3 实测 vs 闭式

Engineering trailing-3m（2026-06..08）年化自愿离职。有 scenario = 主 gold；无 scenario = 同 seed 第二次全量模拟（`apply_case3=False`）。

| | 年化 | person-months | voluntary terms |
| --- | ---: | ---: | ---: |
| 有 scenario | **0.1829** | 47,178 | 719 |
| 无 scenario | **0.1404** | 47,692 | 558 |
| 实测 delta | **+4.25 pp** | | |
| 闭式 delta | **+2.40 pp** | | |

闭式 Engineering：0.1334 → 0.1574。切片相关信号（gold，非因果）：compa 0.88 vs 0.98（n=2,093 / 47,940）；manager change / worker 0.1027 vs 0.0454。

## Case 4（Sales，自 2026-05-01）

slow-HM 101–103 在 **TTF 与 Onsite aging 的 p90 尾部**均高于对照。

| | slow-HM | other HM |
| --- | ---: | ---: |
| TTF p50 / p90（天） | 58 / **118**（n=342） | 33 / **71**（n=443） |
| Onsite aging p50 / p90 | 25 / **61**（n=2,792） | 13 / **35**（n=4,295） |
| Scorecard 提交延迟 p50 | 11.083 天 | 1.083 天 |
| 面试排期延迟 p50 | 8.083 天 | 0.083 天 |

## 域覆盖矩阵（全量 gold）

| 域 | 证据 |
| --- | --- |
| **comp** | SSA **321,017**。对照 grade p50 compa-ratio **0.98**；Case 3 切片 0.88。 |
| **performance** | Appraisal **199,281**。final_score 2/3/4/5 → 7,966 / 82,952 / 83,055 / 25,308。 |
| **mobility** | 年化 promotion **8.27%** / transfer **5.41%** / manager change **5.36%**（计数 17,513 / 11,470 / 11,359）。 |
| **learning** | Training **74,700**；人均 certified **6.98** 小时；次均 4.68。 |
| **skills** | 人均技能 **6.36**。Engineering × Governance gap **1.0**。 |
| **engagement** | 10 波；response rate 0.70–0.83。 |
| **recruiting** | 见上。取消率 9.98%。 |

## 管理树（6c-1）

As-of 2026-08-31 certified：span_of_control 均值 **8.27**（门槛 5–9）；is_manager **12.07%**（门槛 10–15%）；max_depth **8**（≤7）。

| 层级 depth | n |
| --- | ---: |
| 0 | 113 |
| 1 | 95 |
| 2 | 153 |
| 3 | 264 |
| 4 | 337 |
| 5 | 253 |
| 6 | 228 |
| 7 | 221 |
| 8 | 209 |

recruiter_load（as-of 人均 open req）**4.0**；skill_coverage **0.574**。

## Parquet 体积（主 gold `rehearsal_1p00`）

| 层 | 对象数 | 字节 |
| --- | ---: | ---: |
| bronze | 44 | 611,067,742（≈ 583 MiB） |
| silver | 47 | 459,961,955（≈ 439 MiB） |
| gold | 33 | 354,580,126（≈ 338 MiB） |

## Postgres 落地

parquet × 2.8 估算已删除。磁盘以 5% gold 灌入 `people_v2` 的 `pg_total_relation_size` × 20 为准（步骤 6a-3）。准入公式：`occupied + measured × 1.3 ≤ quota − 2 GiB`。对照前缀 `rehearsal_1p00_nocase3` 为 control-only，不进 serving。

## 上一轮误启动

GATE 2 5% 通过后，代理把「第一段通过」当成可以自动开 `scale=1`，在 owner 确认 B 之前启动了 `backfill.py`。该进程已杀掉。现网要求：`PEOPLE_FULL_BACKFILL_APPROVED=1` 或 `--i-have-owner-approval`，否则 fail-closed。
