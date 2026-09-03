# 5% 五年演练报告（bronze → silver → gold，不 publish）

**Stop.** 步骤 5 第一段（含 lognormal dwell 重跑）已通过。第二段全量见 `docs/PEOPLE_REHEARSAL_1P00.md`。本跑 `scale=0.05`、`seed=20260301`、窗口 `2021-09-01`–`2026-08-31`。路径：**bronze parquet → people_mappings → silver parquet → gold parquet（DuckDB，仅 lake）**。下表为 lognormal 重跑数字（JSON：`rehearsal_0p05/report.json`）。未 publish。

JSON：`data-platform/simulator/fixtures/rehearsal_0p05/report.json`  
Lake：`people_bronze/rehearsal_0p05/`、`people_silver/rehearsal_0p05/`、`people_gold/rehearsal_0p05/`

BR **v1 certified**（`effective_from: 2026-09-02`）。#1–#6 已锁定。

| 项 | Gold 值 |
| --- | --- |
| 累计 worker spells | 4278（×20 ≈ 85.6K） |
| 期末 certified headcount | **2501**（×20 ≈ 50.0K） |
| 发布 | false |
| DQ | **全部通过**（RI、temporal、事务完整性、roll-forward residual=0） |
| Case 2 隔离 | 通过（control_total 含 Left） |

## 期末 certified headcount 按 region

As-of 2026-08-31，gold `people_snap_worker_month`。

| Region | Headcount |
| --- | ---: |
| AMER | 1130 |
| EMEA | 660 |
| APAC | 711 |
| **合计** | **2501** |

## 招聘（gold；事务完整性 + 漏斗校准）

| 指标 | 值 |
| --- | ---: |
| Hires（via T1，窗口内） | 2478 |
| Offers accepted | 2478 |
| Offers sent | 2926 |
| Offer acceptance | 0.8469 |
| Openings | 2753 |
| Cancelled | 275 |
| Cancel rate | **0.0999**（baseline 0.10） |
| Applications | 355,505 |
| Time-to-fill p50 / p90 | 32.0 / 81.3 天 |
| Stage aging p50 | Review 3 / Screen 5 / Onsite 8 / Offer 4 天 |

`hires == accepted offers`。取消 opening = `n_hire × 0.10 / 0.90`。

### Source mix 与 Review→Screen

| Source | Share | Review→Screen |
| --- | ---: | ---: |
| inbound | 74.49% | **10.16%**（目标 8–12%） |
| sourced | 11.92% | **60.1%**（目标 ~60%） |
| referral | 8.59% | 45.2%（目标 ~40%；T1 录用偏 referral） |
| internal | 5.00% | 44.8% |

Inbound 在 Review **5 日内拒绝**：**64.97%**（目标 60–70%）。

### Applications / opening 按 job_family

lognormal 中位数目标：Eng 150 / Sales 80 / Exec 20 / Other 100。实现值为均值（右偏）。

| Job family | Openings | Applications | Apps / opening |
| --- | ---: | ---: | ---: |
| Engineering | 970 | 167,113 | 172.3 |
| Sales | 555 | 53,477 | 96.4 |
| Exec | 91 | 1,955 | 21.5 |
| Other | 1190 | 139,093 | 116.9 |

### Applications / opening 按 source × job_family

Openings 按「该 family 下出现过该 source 的 requisition」计，因此 internal/sourced 的 opening 分母可略小于 family 合计。

| Job family | inbound | referral | sourced | internal |
| --- | ---: | ---: | ---: | ---: |
| Engineering | 124,786 / 970 = **128.6** | 13,997 / 969 = 14.4 | 20,078 / 970 = 20.7 | 8,252 / 957 = 8.6 |
| Sales | 39,692 / 555 = **71.5** | 4,732 / 555 = 8.5 | 6,322 / 553 = 11.4 | 2,731 / 534 = 5.1 |
| Exec | 1,420 / 91 = **15.6** | 226 / 90 = 2.5 | 220 / 78 = 2.8 | 89 / 51 = 1.7 |
| Other | 103,483 / 1,190 = **87.0** | 12,105 / 1,190 = 10.2 | 16,485 / 1,189 = 13.9 | 7,020 / 1,164 = 6.0 |

校准来源见 `baseline.yaml` `recruiting.calibration`：Greenhouse Recruiting Benchmarks 2023、Ashby 2024、Jobvite 2023、SHRM TA benchmarking。全量 lake applications 预计 **~600 万行**。

## 域覆盖矩阵（gold）

| 域 | 证据 |
| --- | --- |
| **comp** | SSA **16,152** 行。compa-ratio 按 grade p25/p50/p75 对照均为 **0.98**（G3–G10；切片见 Case 3）。 |
| **performance** | Appraisal **9,935**。final_score 分箱：2.0→409，3.0→4173，4.0→4142，5.0→1211。 |
| **mobility** | 年化 promotion **8.59%** / transfer **6.36%** / manager change **5.09%**（baseline 8/6/5）。计数 911 / 675 / 540。 |
| **learning** | Training participation **3,600**（T12）；人均 certified **6.52** 小时；次均 4.54 小时。 |
| **skills** | T13；人均技能 **6.37**。Engineering × Kubernetes gap **0.41**。 |
| **engagement** | 10 波；response rate 0.70–0.84。各维度均值约 3.63–3.69。 |
| **recruiting** | 见上。Opening 取消率已对齐 10%（此前 5/2580 是每月 Bernoulli 的实现错误）。 |

T12 Training Event/Result 与 T13 Employee Skill Map 已进 `TRANSACTIONS`。

## Case 3 / 4 信号（gold，只埋相关性）

As-of 2026-08-31 certified。

| 信号 | 切片 | 对照 |
| --- | --- | --- |
| Case 3 compa-ratio 中位数 | APAC × Eng × 0–3y：**0.88**（n=91） | **0.98**（n=2417） |
| Case 3 manager change / worker（自 2025-10-01） | **0.1538**（14/91） | **0.0364**（88/2417）≈ **4.2×** |
| Case 4 scorecard 提交延迟 p50（Sales Onsite，自 2026-05-01） | slow HM 101–103：**11.08 天**（n=152） | 其他 HM：**1.08 天**（n=216） |
| Case 4 面试排期延迟 p50 | **8.08 天** | **0.08 天** |

Case 3 闭式（全量参数，未跑全量模拟）：Engineering +2.4pp；APAC Eng 1–3y ×2.00。

## 快照 roll-forward（gold DQ，回填 residual = 0）

59 个月 `max_abs_residual = 0`，`t1_bypass = 0`。

| Month | Active | Hires | Rehires | Terms | Status in/out | Type in/out | Residual |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |
| 2026-03 | 2422 | 38 | 1 | 45 | 4 / 5 | 1 / 0 | 0 |
| 2026-04 | 2453 | 56 | 0 | 26 | 4 / 3 | 0 / 0 | 0 |
| 2026-05 | 2459 | 40 | 1 | 38 | 4 / 1 | 0 / 0 | 0 |
| 2026-06 | 2465 | 46 | 1 | 38 | 0 / 3 | 0 / 0 | 0 |
| 2026-07 | 2481 | 53 | 1 | 35 | 1 / 4 | 0 / 0 | 0 |
| 2026-08 | 2508 | 53 | 1 | 27 | 3 / 5 | 2 / 0 | 0 |

## Case 2 / BR-DQ-003

Employee full 抽取 **含 Left**。`control_total` = 全部 Employee 文档。在职数为派生。缺席 ≠ Left。

| 项 | 08-07 prior | 08-14 故障 |
| --- | --- | --- |
| mode | full | full（强制） |
| control_total（含 Left） | 4283 | **4293** |
| rows_received | 4283 | **3462** |
| volume test | 通过 | 失败 |
| isolated / pointer | — | 隔离，pointer 停在 08-07 |
| replay value_bad | — | **2025**（收到行中 status=Active naive） |
| replay value_expected | — | **2486**（上一 certified headcount） |
| 因抽取关闭的 APAC worker | — | [] |

累计 spells **4325**；08-14 control_total **4293**（含 Left 的全部文档，接近累计 spells，差额为 08-14 之后入职）。

## 运维

Serving 项目：**PeopleAnalyticsAI.net** `zapmigfrtnwnkmezjefx`（Micro，8 GB）。`apply.py` **fail-closed**：quota 缺失即拒绝；仅当 `database + WAL + system + expected_backfill_delta ≤ quota − 2 GiB` 才放行。本阶段不 publish。

Postgres 热窗口 12 个月：`fact_application` / `evt_application_stage` / `fact_interview` / `fact_scorecard` / **`dim_candidate`**。全量 applications 仅 lake（预计 ~600 万行）；漏斗 mart 全历史。

5% 在放行全量前已重跑验证：time_to_fill p50/p90 = **32.0 / 81.3**（p90/p50 = **2.54**）；Case 4 slow-HM TTF p90 96 vs 61 天，Onsite aging p90 65.4 vs 35 天。
