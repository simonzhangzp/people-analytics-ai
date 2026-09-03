# 2% 五年演练报告（仅 lake，不 publish）

**Stop.** 本跑 `scale=0.02`、`seed=20260301`、窗口 `2021-09-01`–`2026-08-31`。只写 rehearsal 前缀的 bronze/logs，**未** 发布到 `people_v2`，**未** 移动 serving pointer。Owner 审本页后再决定全量回填。

机器输出：`data-platform/simulator/fixtures/rehearsal_0p02/report.json`（湖内副本 `data-platform/lake/people_logs/rehearsal_0p02/report.json`）。

| 项 | 值 |
| --- | --- |
| 累计 worker spells | 1600（全量口径 ~80K × 0.02） |
| 期末 certified headcount（BR-WF-001） | **872** |
| 发布 | `false` |
| Case 2 隔离 | **通过**（`isolation_ok: true`） |

## 期末 headcount 按 region

Certified、as-of 2026-08-31。

| Region | Headcount | 占比 |
| --- | ---: | ---: |
| AMER | 360 | 41.3% |
| EMEA | 242 | 27.8% |
| APAC | 270 | 31.0% |
| **合计** | **872** | 100% |

## 年化自愿离职 2026：region × tenure_band

公式：`voluntary_terms / (person_months / 12)`。有 scenario（Case 3 开启）与关闭 Case 3 的对照。**本 seed 下两表逐格相同**。

| Region | Tenure | Vol terms | Person-months | 年化 | 无 Case 3 年化 | Extra terms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| AMER | <1y | 6 | 436 | 0.1651 | 0.1651 | 0 |
| AMER | 1–3y | 8 | 816 | 0.1176 | 0.1176 | 0 |
| AMER | 3–5y | 9 | 785 | 0.1376 | 0.1376 | 0 |
| AMER | 5–10y | 11 | 693 | 0.1905 | 0.1905 | 0 |
| EMEA | <1y | 1 | 328 | 0.0366 | 0.0366 | 0 |
| EMEA | 1–3y | 7 | 491 | 0.1711 | 0.1711 | 0 |
| EMEA | 3–5y | 4 | 506 | 0.0949 | 0.0949 | 0 |
| EMEA | 5–10y | 5 | 525 | 0.1143 | 0.1143 | 0 |
| APAC | <1y | 3 | 336 | 0.1071 | 0.1071 | 0 |
| APAC | 1–3y | 11 | 532 | 0.2481 | 0.2481 | 0 |
| APAC | 3–5y | 6 | 571 | 0.1261 | 0.1261 | 0 |
| APAC | 5–10y | 8 | 606 | 0.1584 | 0.1584 | 0 |

### Case 3 效应量

切片：APAC × 工程 × tenure `1–3y`，自 2026-03-01 起自愿 hazard ×1.8。

| 量 | 值 |
| --- | --- |
| 切片内 eligible 人月投掷次数 | 178 |
| **期望**额外离职人数 | `178 × 0.8 × monthly_vol_hazard` = **1.51** |
| **实现**额外自愿离职（全切片合计） | **0** |
| APAC × 1–3y 有/无 scenario 年化 | 皆 0.2481（11 / 532） |

2% 样本下期望只有约 1.5 人，实现 0 在 Poisson 下合理（`P(K=0) ≈ e^{-1.51} ≈ 0.22`）。**不能**用本跑否定 Case 3；全量回填才有检验力。

## 招聘漏斗（窗口累计）

| 指标 | 值 |
| --- | ---: |
| Hires（入职 worker 笔数） | 880 |
| Openings | 955 |
| Applications | 14,044 |
| Offers sent | 880 |
| Offers accepted | 752 |
| Offer acceptance | 0.8545 |

Hires 与 offers sent 同为 880：每月按入职目标发一封 offer。Accept 752 表示约 15% 拒 offer；对应 worker 仍按模拟入职路径记账（与 T1 正式入职事务不是同一粒度）。Openings 高于 hires：约 10% 取消的 req。

## 快照不变量

规则：`active_t = active_{t-1} + hires − terms`（certified 类型过滤）。迟登记离职 **28** 笔，允许偏差。

| Month end | Certified active | Identity | Delta |
| --- | ---: | ---: | ---: |
| 2026-03-31 | 810 | 801 | +9 |
| 2026-04-30 | 822 | 806 | +16 |
| 2026-05-31 | 834 | 826 | +8 |
| 2026-06-30 | 847 | 838 | +9 |
| 2026-07-31 | 859 | 857 | +2 |
| 2026-08-31 | 872 | 851 | +21 |

`max_abs_delta = 21`（约期末 2.4%）。末月 identity 851 vs 872：迟登记 + certified 类型过滤。不作为发布阻断；全量时再核 bronze 事件日 vs 记录日。

## 08-14 隔离证据（Case 2 / BR-DQ-003）

Employee = **增量 + 周五 full**。Scenario `apac_hris_feed_incomplete` **强制** 2026-08-14 `extract_mode=full`。

Lake：

- `data-platform/lake/people_bronze/rehearsal_0p02/frappe_hr/Employee/extract_date=2026-08-07/`（prior full，通过 volume test）
- `data-platform/lake/people_bronze/rehearsal_0p02/frappe_hr/Employee/extract_date=2026-08-14/`（故障 full，隔离）

| 检查 | 结果 |
| --- | --- |
| 08-14 mode | `full` |
| control_total | 940 |
| rows_received | 748 |
| volume test `748/940 ≥ 0.99` | **失败** |
| isolated | true |
| pointer_moved | **false**（停在 **2026-08-07**） |
| absence_closes_worker | false |
| 缺席 APAC 行 | 192 |
| certified 路径因本抽取关闭的 APAC worker | **[]** |
| replay `value_bad` | 748（naive 收到行数） |
| replay `value_expected` | 940（control_total / 上一 certified） |
| 08-07 prior full | 940 / 940，volume test 通过，未隔离 |

**结论：** 08-14 run 被隔离、pointer 不动、certified 路径没有 APAC worker 被当成离职关闭。符合 GATE 2 条件 1 的演练要求。

## 未做

- 未 publish、未写 `people_v2`、未跑全量 5 年回填。
- 未把 rehearsal 前缀提升为正式 `people_bronze/frappe_hr/...` 分区。
