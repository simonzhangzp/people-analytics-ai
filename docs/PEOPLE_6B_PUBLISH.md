# People 6b publish 交回

Dedicated 项目 **PeopleAnalyticsAI.net**（`zapmigfrtnwnkmezjefx`）。未建 `people_app` LOGIN，未改线上站。

## 必修 1：manager change 已恢复

同 seed `20260301` 全量 gold（`rehearsal_1p00`）：

| 对照 | 6a | 本轮 |
| --- | ---: | ---: |
| 期末 certified HC | 50,020 | **49,834** |
| Hires = accepted | 48,617 | **48,617** |
| TTF p90/p50 | 2.5312 | **2.5312** |
| Case 2 08-14 | 84,110 / 67,653 | **84,110 / 67,653** |
| manager change 年化 | 0 | **5.23%**（11,061 次） |
| Case 3 mgr / worker | — | **0.1146 vs 0.0426 ≈ 2.69×**（2–4×） |
| Case 3 自愿离职 Δ | +2.55 pp | **+2.54 pp** |

HC 少 186 人：入职当日 mobility 两条 Employee 版本曾因相同 `modified` 时间戳把 hist 区间排乱。本轮按 `emit_seq` / 文件行序固定 SCD2；hires / TTF / Case 2 与 6a 一致。DQ `hist ↔ evt_worker_change` 为 0。

## 必修 2：候选人个人级不进 Postgres

`people_fact_candidate_eeoc_restricted` 与 `people_fact_candidate_demographic_restricted` 未 COPY（`postgres: false` / `LAKE_ONLY_NEVER`）。`people_fact_survey_score_restricted` 已进 Postgres（1,368,464 行）。A7 仍为 as_designed：准入后余量 > 2 GiB。

已知缺口：1.0 `_flush_recruiting` 清空内存 applications 后再写 EEOC，bronze `eeoc` 为空，因此 `people_mart_applicant_flow` 为 0 行。`emit_bronze.py` 已改为从月分区 application parquet 生成 EEOC/demographic；需下次 emit 才会灌满 mart。治理演示（个人级不进 serving）仍然成立。

## 四段 publish（`pg_database_size`）

| 段 | before | after | Δ |
| --- | ---: | ---: | ---: |
| dims_xw | 12,913,811 | 212,599,311 | 199.7 MiB |
| facts_events | 212,599,311 | 1,195,109,523 | 937.0 MiB |
| snapshots | 1,195,109,523 | 2,481,769,619 | 1,227.1 MiB |
| marts | 2,481,769,619 | 2,486,496,403 | 4.5 MiB |

终态：`database_bytes` **2,486,873,235**（≈ 2.32 GiB）；occupied **2,502,146,869**。配额 8 GiB，allowed = quota − 2 GiB = 6 GiB。JSON：`data-platform/simulator/fixtures/rehearsal_1p00/publish_6b.json`。

热窗口从 2025-09-01：application 1,435,110；application_stage 1,974,082。`people_snap_worker_month` 2,622,628。

## Meta / RPC

- `021_people_v2_governance.sql` + `load_people_v2_meta.py` 已灌库。
- `people_v2.people_get_metric(text, date)` GRANT 仅 `people_publisher` / `people_definer`。

## Parquet vs RPC parity（as_of 2026-08-31，容差 0）

20 / 20 通过。`data-platform/simulator/fixtures/rehearsal_1p00/parity_6b.json`。

| metric_id | value |
| --- | ---: |
| headcount | 49,834 |
| hires（当月 certified） | 894 |
| average_headcount | 42,293.55 |
| voluntary_attrition_rate | 0.14472047196693022 |
| time_to_fill_days | 34 |
| offer_acceptance_rate | 0.8294168842471714 |
| applications_per_opening | 26.566763546159684 |
| span_of_control | 1.657484214436053 |
| quality_of_hire | 0.5013736263736264 |
| training_hours_per_worker | 7.098767909459 |
| recruiter_load | 0 |

`recruiter_load = 0`：gold `people_snap_recruiter_month.open_requisitions` 在 as_of 月均为 0（`is_open` 与 `recruiter_id` 对齐问题，不是 COPY 丢数）。RPC 与 parquet 一致。5% 排练里 interviews/hires 非 0；全量 snap 的 open 计数需下次修正 join。

## 未做

- 步骤 7：`people_app` LOGIN、RLS、demo 身份
- 步骤 8：线上站
- 未 commit / 未 push
