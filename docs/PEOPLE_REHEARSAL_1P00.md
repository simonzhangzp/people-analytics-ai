# 全量 5 年 lake 回填报告（data-v1，scale=1.0）

**Stop.** simulator 已冻结为 tag `data-v1`。GATE 3 前不再改 simulator。serving 仅 PeopleAnalyticsAI.net。
全量 gold 在 lake：`people_bronze/rehearsal_1p00/`、`people_silver/rehearsal_1p00/`、`people_gold/rehearsal_1p00/`（不进 git）。

JSON：`data-platform/simulator/fixtures/rehearsal_1p00/report.json`

seed `20260301` · 窗口 `2021-09-01`–`2026-08-31` · `python backfill.py --i-have-owner-approval`

无 scenario 对照前缀：`rehearsal_1p00_nocase3`（**control-only**，不进 serving gold）。

## 期末 certified headcount 按 region

As-of 2026-08-31，gold `people_snap_worker_month`。

| Region | Headcount |
| --- | ---: |
| AMER | 22,588 |
| EMEA | 12,913 |
| APAC | 14,322 |
| **合计** | **49,823** |

## 招聘完整性

| 指标 | 值 |
| --- | ---: |
| Hires（via T1） | 49,029 |
| Offers accepted | 49,029 |
| Openings | 55,351 |
| Cancelled | 5,448 |
| Cancel rate | **0.0984** |
| Applications | 7,066,102 |
| time_to_fill p50 / p90 | 32.0 / 80.0 |
| p90 / p50 | **2.5**（门槛 ≥ 2.0） |

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
| inbound | 74.54% | 10.15% |
| sourced | 11.91% | 60.08% |
| referral | 8.60% | 44.76% |
| internal | 4.95% | 45.06% |

Inbound Review 5 日内拒绝 **75.77%**（校准带 60–80%；lognormal dwell）。

Apps / opening 均值：Engineering 171.8 · Sales 92.2 · Exec 21.0 · Other 116.3。

## Roll-forward（59 个月）

`max_abs_residual = 0`，`t1_bypass = 0`，`months = 59`。

| Month | Active | Hires | Rehires | Terms | Status in/out | Type in/out | Residual |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |
| 2026-03 | 48,597 | 895 | 17 | 618 | 56 / 42 | 11 / 0 | 0 |
| 2026-04 | 48,819 | 842 | 20 | 653 | 38 / 46 | 21 / 0 | 0 |
| 2026-05 | 49,043 | 889 | 17 | 705 | 44 / 42 | 21 / 0 | 0 |
| 2026-06 | 49,383 | 913 | 23 | 621 | 51 / 44 | 18 / 0 | 0 |
| 2026-07 | 49,624 | 853 | 18 | 625 | 37 / 58 | 16 / 0 | 0 |
| 2026-08 | 49,823 | 874 | 21 | 704 | 51 / 63 | 20 / 0 | 0 |

## Case 2 隔离

Employee full **仅周五**；08-07 与 08-14 均为周五，scenario 强制 full。`control_total` = 全部文档（含 Left）。

| 项 | 08-07 prior | 08-14 故障 |
| --- | --- | --- |
| mode | full | full |
| control_total | 84,303 | **84,508** |
| rows_received | 84,303 | **67,936** |
| volume test | 通过 | 失败 |
| isolated / pointer | — | 隔离，pointer 未动 |
| replay value_bad / expected | — | 40,255 / 49,688 |

## Case 3 实测 vs 闭式

Engineering trailing-3m（2026-06..08）年化自愿离职。有 scenario = 主 gold；无 scenario = 同 seed 第二次全量模拟（`apply_case3=False`）。

| | 年化 | person-months | voluntary terms |
| --- | ---: | ---: | ---: |
| 有 scenario | **0.1698** | 47,782 | 676 |
| 无 scenario | **0.1432** | 48,003 | 573 |
| 实测 delta | **+2.66 pp** | | |
| 闭式 delta | **+2.40 pp** | | |
| |实测−闭式| | **0.26 pp**（闸 ≤0.5） | | |

D2 自愿离职分解（Engineering trailing-3m，有 scenario）：

| 桶 | n |
| --- | ---: |
| slice hazard | 222 |
| manager_departure | 0 |
| other | 454 |
| 合计 | 676 |

闭式 Engineering：0.1334 → 0.1574。切片相关信号（gold，非因果）：compa 0.88 vs 0.98（n=2,149 / 47,674）；manager change / worker 0.2564 vs 0.2132。

## Case 4（Sales，自 2026-05-01）

slow-HM 101–103 在 **TTF 与 Onsite aging 的 p90 尾部**均高于对照。

| | slow-HM | other HM |
| --- | ---: | ---: |
| TTF p50 / p90（天） | 56 / **122**（n=310） | 34 / **84**（n=469） |
| Onsite aging p50 / p90 | 26 / **63**（n=2,772） | 13 / **34**（n=4,640） |
| Scorecard 提交延迟 p50 | 11.083 天 | 1.083 天 |
| 面试排期延迟 p50 | 8.083 天 | 0.083 天 |

## 域覆盖矩阵（全量 gold）

| 域 | 证据 |
| --- | --- |
| **comp** | SSA **321,579**。对照 grade p50 compa-ratio **0.98**；Case 3 切片 0.88。 |
| **performance** | Appraisal **199,421**。final_score 2/3/4/5 → 7,771 / 83,070 / 83,434 / 25,146。 |
| **mobility** | 年化 promotion **8.42%** / transfer **5.40%** / manager change **26.16%**（计数 17,797 / 11,408 / 55,303）。 |
| **learning** | Training **990,000**；人均 certified **99.26** 小时；次均 5.0。 |
| **skills** | 人均技能 **6.37**。Engineering × Governance gap **1.0**。 |
| **engagement** | 10 波；response rate 0.71–0.82。 |
| **recruiting** | 见上。取消率 9.84%。 |

## 管理树（6c-1）

As-of 2026-08-31 certified：span_of_control 均值 **8.47**（门槛 5–9）；is_manager **11.81%**（门槛 10–15%）；max_depth **8**（≤8）；span_max **15**（≤15）；orphan **0**；CEO 根 **1**。

| 层级 depth | n |
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

recruiter_load（as-of 人均 open req）**7.9455**；skill_coverage **0.5718**。

## Parquet 体积（主 gold `rehearsal_1p00`）

| 层 | 对象数 | 字节 |
| --- | ---: | ---: |
| bronze | 44 | 630,185,339（≈ 601 MiB） |
| silver | 47 | 482,742,467（≈ 460 MiB） |
| gold | 33 | 349,056,853（≈ 333 MiB） |

## Postgres 落地

parquet × 2.8 估算已删除。磁盘以 5% gold 灌入 `people_v2` 的 `pg_total_relation_size` × 20 为准（步骤 6a-3）。准入公式：`occupied + measured × 1.3 ≤ quota − 2 GiB`。对照前缀 `rehearsal_1p00_nocase3` 为 control-only，不进 serving。

## 上一轮误启动

GATE 2 5% 通过后，代理把「第一段通过」当成可以自动开 `scale=1`，在 owner 确认 B 之前启动了 `backfill.py`。该进程已杀掉。现网要求：`PEOPLE_FULL_BACKFILL_APPROVED=1` 或 `--i-have-owner-approval`，否则 fail-closed。
