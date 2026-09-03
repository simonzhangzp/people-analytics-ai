# 全量 5 年 lake 回填报告（scale=1.0，不 publish）

**Stop.** 步骤 6b：全量 gold 已 publish 到 dedicated 项目 `people_v2`（ref `zapmigfrtnwnkmezjefx`）。未建 `people_app` LOGIN，未改线上站。Lake 仍在 `people_bronze/rehearsal_1p00/`、`people_silver/rehearsal_1p00/`、`people_gold/rehearsal_1p00/`。6b 交回见 `docs/PEOPLE_6B_PUBLISH.md`。

JSON：`data-platform/simulator/fixtures/rehearsal_1p00/report.json`

seed `20260301` · 窗口 `2021-09-01`–`2026-08-31` · `python backfill.py --i-have-owner-approval`

无 scenario 对照前缀：`rehearsal_1p00_nocase3`（**control-only**，不进 serving gold）。

## 期末 certified headcount 按 region

As-of 2026-08-31，gold `people_snap_worker_month`。

| Region | Headcount |
| --- | ---: |
| AMER | 22,659 |
| EMEA | 13,004 |
| APAC | 14,171 |
| **合计** | **49,834** |

## 招聘完整性

| 指标 | 值 |
| --- | ---: |
| Hires（via T1） | 48,617 |
| Offers accepted | 48,617 |
| Openings | 54,019 |
| Cancelled | 5,402 |
| Cancel rate | **0.1000** |
| Applications | 7,007,920 |
| time_to_fill p50 / p90 | 32.0 / 81.0 |
| p90 / p50 | **2.5312**（门槛 ≥ 2.0） |

`hires == accepted`。Gold DQ **全部通过**（blocking 失败即停；本跑 `dq_failed = []`）。

### Stage aging（全历史 lake）

| Stage | p50 天 | p90 天 |
| --- | ---: | ---: |
| Offer | 4 | 8 |
| Onsite | 8 | 23 |
| Review | 3 | 11 |
| Screen | 5 | 12 |

### Source mix 与 Review→Screen

| Source | Share | Review→Screen |
| --- | ---: | ---: |
| inbound | 74.50% | 10.16% |
| sourced | 11.89% | 59.95% |
| referral | 8.65% | 44.86% |
| internal | 4.96% | 45.09% |

Inbound Review 5 日内拒绝 **75.74%**（校准带 60–80%；lognormal dwell）。

Apps / opening 均值：Engineering 175.1 · Sales 94.4 · Exec 23.4 · Other 116.1。

## Roll-forward（59 个月）

`max_abs_residual = 0`，`t1_bypass = 0`，`months = 59`。

| Month | Active | Hires | Rehires | Terms | Status in/out | Type in/out | Residual |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |
| 2026-03 | 48,605 | 820 | 20 | 606 | 35 / 41 | 24 / 0 | 0 |
| 2026-04 | 48,836 | 836 | 17 | 643 | 41 / 33 | 13 / 0 | 0 |
| 2026-05 | 49,091 | 888 | 15 | 659 | 42 / 45 | 14 / 0 | 0 |
| 2026-06 | 49,343 | 876 | 23 | 664 | 43 / 45 | 19 / 0 | 0 |
| 2026-07 | 49,621 | 894 | 16 | 649 | 44 / 42 | 15 / 0 | 0 |
| 2026-08 | 49,834 | 879 | 15 | 695 | 38 / 51 | 27 / 0 | 0 |

## Case 2 隔离

Employee full **仅周五**；08-07 与 08-14 均为周五，scenario 强制 full。`control_total` = 全部文档（含 Left）。

| 项 | 08-07 prior | 08-14 故障 |
| --- | --- | --- |
| mode | full | full |
| control_total | 83,866 | **84,110** |
| rows_received | 83,866 | **67,653** |
| volume test | 通过 | 失败 |
| isolated / pointer | — | 隔离，pointer 未动 |
| replay value_bad / expected | — | 40,285 / 49,654 |

## Case 3 实测 vs 闭式

Engineering trailing-3m（2026-06..08）年化自愿离职。有 scenario = 主 gold；无 scenario = 同 seed 第二次全量模拟（`apply_case3=False`）。

| | 年化 | person-months | voluntary terms |
| --- | ---: | ---: | ---: |
| 有 scenario | **0.173** | 49,661 | 716 |
| 无 scenario | **0.1476** | 50,016 | 615 |
| 实测 delta | **+2.54 pp** | | |
| 闭式 delta | **+2.40 pp** | | |

闭式 Engineering：0.1334 → 0.1574。切片相关信号（gold，非因果）：compa 0.88 vs 0.98（n=2,095 / 47,739）；manager change / worker 0.1146 vs 0.0426。

## Case 4（Sales，自 2026-05-01）

slow-HM 101–103 在 **TTF 与 Onsite aging 的 p90 尾部**均高于对照。

| | slow-HM | other HM |
| --- | ---: | ---: |
| TTF p50 / p90（天） | 54 / **125**（n=340） | 33 / **86**（n=448） |
| Onsite aging p50 / p90 | 27 / **61**（n=3,050） | 12 / **34**（n=4,425） |
| Scorecard 提交延迟 p50 | 11.083 天 | 1.083 天 |
| 面试排期延迟 p50 | 8.083 天 | 0.083 天 |

## 域覆盖矩阵（全量 gold）

| 域 | 证据 |
| --- | --- |
| **comp** | SSA **321,037**。对照 grade p50 compa-ratio **0.98**；Case 3 切片 0.88。 |
| **performance** | Appraisal **199,510**。final_score 2/3/4/5 → 7,860 / 82,966 / 82,976 / 25,708。 |
| **mobility** | 年化 promotion **8.37%** / transfer **6.21%** / manager change **5.23%**（计数 17,691 / 13,137 / 11,061）。 |
| **learning** | Training **74,700**；人均 certified **7.1** 小时；次均 4.74。 |
| **skills** | 人均技能 **6.37**。Engineering × Kubernetes gap **0.4**。 |
| **engagement** | 10 波；response rate 0.71–0.85。 |
| **recruiting** | 见上。取消率 10.00%。 |

## Parquet 体积（主 gold `rehearsal_1p00`）

| 层 | 对象数 | 字节 |
| --- | ---: | ---: |
| bronze | 39 | 406,552,239（≈ 388 MiB） |
| silver | 47 | 354,365,071（≈ 338 MiB） |
| gold | 33 | 362,000,388（≈ 345 MiB） |

## Postgres 落地

步骤 6b 已把 `rehearsal_1p00` 热窗口灌入 `people_v2`。分段体积与 parquet vs RPC parity（20/20，容差 0）见 `docs/PEOPLE_6B_PUBLISH.md`。

实测 `pg_database_size` ≈ **2.49 GiB**；occupied ≈ **2.50 GiB**；配额 8 GiB，准入余量远高于 2 GiB。候选人 EEOC / demographic 个人级 **未进 Postgres**。对照前缀 `rehearsal_1p00_nocase3` 为 control-only，不进 serving。

## 上一轮误启动

GATE 2 5% 通过后，代理把「第一段通过」当成可以自动开 `scale=1`，在 owner 确认 B 之前启动了 `backfill.py`。该进程已杀掉。现网要求：`PEOPLE_FULL_BACKFILL_APPROVED=1` 或 `--i-have-owner-approval`，否则 fail-closed。
