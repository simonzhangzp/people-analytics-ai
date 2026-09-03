# 步骤 6a-1：对象清单对账

对照 `people_source_contracts/odcs/INDEX.yaml`（51 份）、`docs/PEOPLE_DATA_ARCHITECTURE.md` §5.1–5.9 / §6，以及 6a-2 重建后的 lake 对象。**不进入步骤 6b publish。**

Lake 前缀：`rehearsal_0p05`（实测）/ `rehearsal_1p00`（serving gold）/ `rehearsal_1p00_nocase3`（control-only，不进 serving）。

6a-2 全量相对步骤 5 第二段：hires/apps/TTF/Case 2/Case 4 不变；期末 certified **50,020**（was 50,026，Δ −6）；Case 3 实测 **+2.55 pp**（was +2.52 pp）。

---

## (a) 51 份 ODCS contract × 实际 bronze

`source_object` 中的空格在 lake 文件夹名里写成 `_`（如 `Employee Grade` → `Employee_Grade`）。

| # | source_system | source_object | 状态 | 说明 |
| ---: | --- | --- | --- | --- |
| 1 | frappe_hr | Employee | emitted | full 版本流 + Case 2 `extract_date` 分区 |
| 2 | frappe_hr | Department | emitted | 6a-2 full 主数据 |
| 3 | frappe_hr | Designation | emitted | 6a-2 full 主数据 |
| 4 | frappe_hr | Employee Grade | emitted | 6a-2 full 主数据 |
| 5 | frappe_hr | Branch | emitted | 6a-2 full 主数据 |
| 6 | frappe_hr | Employment Type | emitted | 6a-2 full 主数据 |
| 7 | frappe_hr | Employee Transfer | emitted | 事务 T3 |
| 8 | frappe_hr | Employee Property History | emitted | 晋升/调动/经理变更子表 |
| 9 | frappe_hr | Employee Promotion | emitted | 事务 T2 |
| 10 | frappe_hr | Employee Separation | emitted | 事务 T5 |
| 11 | frappe_hr | Salary Structure Assignment | emitted | 薪酬分配 |
| 12 | frappe_hr | Salary Structure | emitted | 主数据 GT-PROF-USD |
| 13 | frappe_hr | Salary Component | not emitted | 不合成工资条组件；slip 只在 lake 的架构目标尚未进模拟 |
| 14 | frappe_hr | Salary Slip | not emitted | 同上；Postgres 只发 `people_mart_comp_monthly`（非 paid slip mart） |
| 15 | frappe_hr | Salary Detail | not emitted | 同上 |
| 16 | frappe_hr | Appraisal Cycle | emitted | |
| 17 | frappe_hr | Appraisal | emitted | |
| 18 | frappe_hr | Training Program | emitted | 6a-2 full 主数据 |
| 19 | frappe_hr | Training Event | emitted | |
| 20 | frappe_hr | Training Event Employee | emitted | |
| 21 | frappe_hr | Training Result | emitted | |
| 22 | frappe_hr | Training Result Employee | emitted | |
| 23 | frappe_hr | Training Feedback | not emitted | 模拟不产生反馈文档 |
| 24 | frappe_hr | Employee Skill Map | emitted | |
| 25 | frappe_hr | Employee Skill | emitted | |
| 26 | frappe_hr | Skill | emitted | 6a-2 full 主数据 |
| 27 | greenhouse_v3 | candidate | emitted | |
| 28 | greenhouse_v3 | application | emitted | |
| 29 | greenhouse_v3 | application_stage | emitted | |
| 30 | greenhouse_v3 | job | emitted | 6a-2 Harvest job |
| 31 | greenhouse_v3 | opening | emitted | |
| 32 | greenhouse_v3 | job_interview_stage | emitted | 每 job × 4 canonical stages |
| 33 | greenhouse_v3 | job_hiring_manager | emitted | |
| 34 | greenhouse_v3 | department | emitted | 显式 GH↔Frappe 映射源 |
| 35 | greenhouse_v3 | office | emitted | |
| 36 | greenhouse_v3 | user | emitted | T8 `employee_id` |
| 37 | greenhouse_v3 | source | emitted | |
| 38 | greenhouse_v3 | referrer | not emitted | Harvest 仅 application.`referrer_id`；无独立 referrer 对象可合成 |
| 39 | greenhouse_v3 | interview | emitted | |
| 40 | greenhouse_v3 | scorecard | emitted | |
| 41 | greenhouse_v3 | offer | emitted | T1 |
| 42 | greenhouse_v3 | rejection_reason | emitted | |
| 43 | greenhouse_v3 | eeoc | emitted | 应用粒度；哈希派生，不碰模拟 RNG |
| 44 | greenhouse_v3 | demographic_answer | emitted | 同上（`demographic_*` 合同仅此一份） |
| 45 | engagement_ext | survey_instrument | emitted | E5 |
| 46 | engagement_ext | survey_wave | emitted | |
| 47 | engagement_ext | survey_response | emitted | item 级；Postgres 只发聚合 / restricted 视 A7 |
| 48 | microsoft_learn | catalog | 有意 lake-only | 外部钉选，本轮不合成 |
| 49 | onet | Occupation Data.txt | 有意 lake-only | 外部钉选，本轮不合成 |
| 50 | onet | Essential Skills.txt | 有意 lake-only | 外部钉选，本轮不合成 |
| 51 | bls | timeseries | 有意 lake-only | 外部钉选，本轮不合成 |

**禁止旁路（已删）：** `canonical/identity`、`canonical/manager_change`、`engagement_ext/people_ref_comp_band`。`people_xw_identity` 只从 T1（accepted offer × `hired_via_application_id`）与 T8（`user.employee_id`）派生。测试：`simulator/tests/test_bronze_contracts.py`（bronze 中不存在非 contract 对象）。

计数：emitted **42** · not emitted **5** · 有意 lake-only **4** · 合计 **51**。

---

## (b) 架构 §5.1–5.9 canonical × 实际 silver/gold

| 架构对象 | 状态 | 备注 |
| --- | --- | --- |
| `people_xw_identity` | 一致 | T1 transaction + T8 employee_id；无 email/name；无 bronze 旁路 |
| `people_xw_org` | 一致 | Frappe Department ↔ GH department |
| `people_xw_location` | 一致 | Branch ↔ office |
| `people_xw_job` | 名称或粒度偏离 | `onet_soc_code` 为空（onet lake-only 未钉选） |
| `people_xw_skill` | 名称或粒度偏离 | `onet_element_id` 为空（同上） |
| `people_dim_org` | 一致 | `org_path` 为 ltree 风格标签（空格/`-` → `_`） |
| `people_dim_job` | 一致 | job_family DERIVED |
| `people_dim_grade` | 一致 | `level_rank` = E2 |
| `people_dim_location` | 一致 | |
| `people_dim_date` | 一致 | month_end 脊 |
| `people_dim_appraisal_cycle` | 一致 | |
| `people_dim_stage` | 一致 | canonical_stage Review/Screen/Onsite/Offer |
| `people_dim_source` | 一致 | |
| `people_dim_rejection_reason` | 一致 | |
| `people_dim_skill` | 名称或粒度偏离 | onet 列空 |
| `people_dim_learning_resource` | 名称或粒度偏离 | 仅 internal Training Program；无 microsoft_learn catalog；`roles`/`products` 空 |
| `people_dim_survey_wave` | 一致 | E5 |
| `people_dim_survey_item` | 一致 | E5 |
| `people_dim_person` | 一致 | 无 PII |
| `people_dim_person_restricted` | 名称或粒度偏离 | `full_name` 占位为 person_id；gender/DOB 空（模拟不产 PII） |
| `people_dim_worker` | 名称或粒度偏离 | 现网列含 region/job_family/via_t1（构建所需）；架构列 `frappe_employee` 已补 |
| `people_evt_worker` | 一致 | hire/rehire/transfer/promotion/manager_change/comp_change/separation |
| `people_evt_worker_change` | 一致 | Property History |
| `people_evt_promotion` / `transfer` / `manager_change` | 一致 | **视图**，底层 `people_evt_worker` |
| `people_fact_separation` | 一致 | 视图，并入 evt_worker |
| `people_hist_worker_attr` | 名称或粒度偏离 | 含 as-of 键 org/job/grade/location/manager；`source_event_id` 空；另保留构建用 hire_date 等 |
| `people_fact_comp_assignment_restricted` | 一致 | 视图；`to_date` 尚未按 BR-COMP-002 封口 |
| `people_ref_comp_band` | 一致 | E1，silver 生成，非 bronze |
| `people_fact_appraisal` | 名称或粒度偏离 | 缺 total_score / self_score / submitted_at |
| `people_fact_training_participation` | 名称或粒度偏离 | 缺 resource_id / attendance / status / grade / event_start（hours 有；event_start 在 learning mart 从 bronze join） |
| `people_fact_worker_skill` | 名称或粒度偏离 | 缺 evaluation_date / source_skill_map；多 job_family 构建列 |
| `people_ref_job_skill_target` | 一致 | |
| `people_dim_requisition` | 名称或粒度偏离 | 缺 job_id/org_id/location_id/recruiter_person_id；HM 为 Harvest user id |
| `people_dim_candidate` | 名称或粒度偏离 | `person_id` 未在 T1 后回填；first_source_id 空 |
| `people_fact_application` | 名称或粒度偏离 | 缺 rejected_at/hired_at/referrer_person_id/rejection_* ；多 source_name 构建列 |
| `people_evt_application_stage` | 名称或粒度偏离 | 多 canonical_stage/stage_name 构建列（架构不存 duration，遵守） |
| `people_fact_interview` | 名称或粒度偏离 | 列名 `starts_at`/`ends_at` 对架构 `start_at`/`end_at`；缺 interviewer_person_ids[] |
| `people_fact_scorecard` | 名称或粒度偏离 | 缺 interview_id / submitted_by_person_id / overall_recommendation |
| `people_fact_offer` | 一致 | |
| `people_dim_recruiter` | 一致 | E4；user 204 |
| `people_fact_survey_score_restricted` | 一致 | worker×wave×dimension；item 级留 lake |
| `people_fact_candidate_eeoc_restricted` | 一致 | application 粒；无 person/worker |
| `people_fact_candidate_demographic_restricted` | 一致 | 同上 |
| `people_ref_city` | 一致 | E3 |
| `people_ref_separation_reason_map` | 一致 | E6 |
| `people_silver_salary_slip` | 缺失 | 对应 not-emitted Salary Slip；有意 |
| `people_snap_worker_month_restricted` | 缺失 | §6.1 个人薪酬/绩效/敬业；本轮未建（compa 走 mart_comp min cell 10） |

---

## (c) 架构 §6 gold × 实际 gold

架构招聘快照 × 2 + 已有 worker snap；marts × 11；另 `people_mart_applicant_flow`（EEOC 聚合，min cell 10，构建时抑制）。`people_mart_funnel_monthly` 为漏斗校准保留，不在 §6.3 十一表内。

| 架构对象 | 状态 | 备注 |
| --- | --- | --- |
| `people_snap_worker_month` | 名称或粒度偏离 | 有 region/tenure/job_family/is_certified；缺 org_id、org_path、promoted_in_month 等 DERIVED 旗标（mobility 改走 evt_worker mart） |
| `people_snap_requisition_month` | 一致 | requisition × month_end；缺 per-canonical_stage 计数 |
| `people_snap_recruiter_month` | 名称或粒度偏离 | 单一 recruiter user 204 上聚合；interviews_scheduled/hires 本轮为 0 |
| `people_mart_workforce_monthly` | 一致 | |
| `people_mart_workforce_monthly_2d` | 名称或粒度偏离 | 现为 region×job_family×month（架构 org×location / org×tenure） |
| `people_mart_mobility_monthly` | 一致 | |
| `people_mart_recruiting_monthly` | 名称或粒度偏离 | 现为 month 级 offer 计数；缺 org/location/job_family 与 ttf |
| `people_mart_stage_aging_monthly` | 名称或粒度偏离 | 缺 org；仅 canonical_stage × month |
| `people_mart_recruiter_load_monthly` | 一致 | 来自 snap_recruiter_month |
| `people_mart_comp_monthly` | 一致 | org 用 region；min cell 10 |
| `people_mart_learning_monthly` | 一致 | |
| `people_mart_skill_coverage_monthly` | 名称或粒度偏离 | 仅期末月；缺 org |
| `people_mart_engagement_wave` | 名称或粒度偏离 | 缺 org；min cell 5 |
| `people_mart_source_health_daily` | 名称或粒度偏离 | Case 2 两日 Employee stub；transform 早于 extract 写出 |
| `people_mart_applicant_flow` | 一致 | job_family × race × gender；HAVING n≥10；join 停在 requisition，不连 person/worker |
| `people_mart_funnel_monthly` | 额外 | 校准用，非 §6.3 |
| `people_mart_comp_paid_monthly` | 缺失 | 依赖 Salary Slip，有意未建 |

---

## 磁盘与准入（6a-3 实测）

parquet × 2.8 已删除。5% gold/silver 按 `canonical_model.yml` + `gold_model.yml` 生成的 DDL 与索引灌入 `zapmigfrtnwnkmezjefx.people_v2`（`people_publisher`），热窗口表仅最近 12 个月，随后清空。

| 项 | 字节 |
| --- | ---: |
| 5% 表合计 `pg_total_relation_size` | 221,528,064（≈ 211.3 MiB） |
| 其中 restricted 三表 | 123,232,256 |
| ×20 全量 as-designed | **4,430,561,280（4.126 GiB）** |
| A7 阈值 | 4.5 GiB = 4,831,838,208 |
| **A7 结论** | **as_designed**（restricted 按原设计进 Postgres） |
| `supabase_measured_people_v2_bytes` | 4,430,561,280 |
| 准入 `measured × 1.3` | 5,759,729,664 |
| occupied（清空后量级） | ≈ 26 MiB |
| 准入公式 | occupied + measured × 1.3 ≤ quota − 2 GiB → **通过**（约 651 MiB 余量相对 8 GiB − 2 GiB） |

逐表 5% 与 ×20 全量估算见 `data-platform/simulator/fixtures/rehearsal_0p05/landing_5pct.json`。最大三表（×20）：`people_fact_candidate_demographic_restricted` 1.48 GiB、`people_fact_candidate_eeoc_restricted` 0.85 GiB、`people_snap_worker_month` 0.54 GiB。Marts 均已灌入。灌入后 `people_v2` 用户对象已清空。
