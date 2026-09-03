# PeopleAnalyticsAI.net — 系统数据架构 v1

**Cursor 执行文档 · 2026-09-01 · 建议路径 `docs/PEOPLE_DATA_ARCHITECTURE.md`**

---

## 0. 定位、已锁定决策、硬约束

**三份文档的关系**

| 文档 | 作用 |
|---|---|
| `PEOPLE_AI_AGENT_ARCHITECTURE.md` | 目标架构：layers / pillars / agents（北极星） |
| `PEOPLE_SOURCE_CONTRACT_FIRST.md` | source contract 与 mapping 规范（L1 的"合同"） |
| **本文档** | 可执行的数据架构：每个对象的 grain、键、生效日期、来源、provenance、存放位置、构建顺序、治理执行方式、切流方案 |

**Cursor 阅读顺序：** SOURCE_CONTRACT_FIRST → 本文档 → AGENT_ARCHITECTURE。本文档未定义的表和字段一律不建；本文档与 SOURCE_CONTRACT_FIRST 冲突时以后者的 contract 为准并回报。

**已锁定决策**

| # | 决策 | 结论 |
|---|---|---|
| A | GlobalTech 数据集 | 重新生成：scenario-driven business event simulator；seeded、可重放；现网旧模型双轨运行到切流 |
| B | 人口统计 / EEOC | 纳入 v1；restricted；仅聚合（min cell 10）；候选人 EEOC 永不关联到员工记录 |
| C | Engagement | SYNTHETIC_EXTENSION；instrument 文档化；仅聚合（min cell 5） |
| D | 事实表位置 | monthly snapshot + 事件 / 事实进 Postgres；daily snapshot、Salary Slip、item 级问卷只留 lake |
| E | Metric 计算引擎 | 只在 Postgres；DuckDB 只做 bronze → silver → gold |
| F | 身份模型 | person ≠ worker ≠ candidate ≠ ATS user；全部经 crosswalk；禁止 name join |
| G | 维度历史 | worker 变化走事件；Department / Designation / Grade / Branch 走 SCD2（来自抽取 diff） |
| H | 治理 | Postgres 内执行（RLS + RPC 内策略）；demo 身份；新对象放独立 schema `people_v2` |

**硬约束**

- 所有对象 `people_*` 前缀，放 `people_v2` schema。v2 只写独立项目 **PeopleAnalyticsAI.net**（`zapmigfrtnwnkmezjefx`，Micro，Disk 8 GB）。QuantReview 生产（`fyvivwgyisrtmehzjqlv`）与 `quantreview-staging`（`kgxbomcmgkwlmzyevqjw`）一律 fail-closed；staging 上的空 `people_v2` / `people_app` / `people_definer` 留到步骤 9 清理。v1 现网 `public.people_*` 不动。
- Data API 不暴露 `people_v2`。v2 应用不使用 `anon` / `service_role` key。Hetzner publish 用 `people_publisher`（LOGIN，仅 `people_v2` USAGE/CREATE）走 session pooler 5432；Vercel 走 transaction pooler 6543；`sslmode=require`。`people_app` 保持 NOLOGIN 至步骤 7。凭证只在 env。
- `source_field` 一律以 pinned contract（Frappe HR v16.15.0 + ERPNext v16.0.0 DocType JSON；Greenhouse Harvest v3 OpenAPI）为准；本文档中标 `[核对]` 的字段名需对照 contract 确认后再写 mapping。
- 公开站点标注 synthetic dataset / not a real company；数据集页列出生效中的 scenario。
- 三个 STOP gate（§14）前不得执行破坏性操作。
- 不引用任何雇主内部材料。

---

## 1. 端到端数据流

```
scenario/*.yaml ──┐
                  ▼
   Business Event Simulator (seeded)                         [Hetzner · Python]
   world · population · recruiting · comp · perf · learning · skills · engagement
                  │  source-shaped payloads
                  ▼
   Emulated source systems:  frappe_hr · greenhouse_v3 · engagement_ext
   + real external files:    onet · bls · microsoft_learn
                  │  extract emulation (full / incremental) + manifest (control totals)
                  ▼
   BRONZE  people_bronze/<source>/<object>/extract_date=…      [Lake · Parquet · immutable]
                  │  DQ: manifest volume · schema vs contract · parse
                  ▼
   SILVER  crosswalks · SCD2 dims · worker events · facts       [Lake · DuckDB/dbt]
                  │  DQ: keys · RI · temporal · transaction completeness
                  ▼
   GOLD    monthly snapshots · marts · daily health aggregates  [Lake · DuckDB/dbt]
                  │  DQ: row-count anomaly · metric range tests (from metric YAML)
                  ▼
   PUBLISH → Postgres schema people_v2 (run_id; quarantine if DQ blocked)   [Supabase]
                  │
                  ▼
   SEMANTIC  metric YAML → generated RPC people_get_*  ·  meta / lineage / health
                  │
                  ▼
   POLICY    identity → RLS (marts) + RPC 内策略 (individual grain) + suppression + access log
                  │
                  ▼
   CONSUMERS  Next.js server (cases, explorer, analyst agent) · people-mcp · eval harness
```

**引擎与位置**

| 环节 | 引擎 | 位置 | 说明 |
|---|---|---|---|
| 模拟 + 抽取仿真 | Python | Hetzner | 产出 source-shaped JSON；抽取仿真写 bronze parquet + manifest |
| bronze → silver → gold | DuckDB（dbt-duckdb 可选） | Hetzner | 所有转换；不算 metric |
| publish | Python（COPY / upsert） | Hetzner → Supabase | 按 run_id 幂等 |
| metric / breakdown / skills 的 SQL | Postgres | Supabase `people_v2` | 唯一的 metric 执行点 |
| 大历史 / 高频明细 | Parquet | Lake | daily snapshot、Salary Slip、item 级问卷、24 个月以外的 stage 事件 |

---

## 2. 全局约定

### 2.1 命名

| 前缀 | 含义 | 例 |
|---|---|---|
| `people_dim_` | 维度（SCD2 时含 valid_from / valid_to / is_current） | `people_dim_org` |
| `people_evt_` | 业务事件（append-only） | `people_evt_worker` |
| `people_fact_` | 事务事实（一行一个业务对象 / 记录） | `people_fact_application` |
| `people_hist_` | 由事件重建的生效区间历史（as-of 查询用） | `people_hist_worker_attr` |
| `people_snap_` | 周期快照 | `people_snap_worker_month` |
| `people_mart_` | 预聚合 | `people_mart_workforce_monthly` |
| `people_xw_` | crosswalk | `people_xw_identity` |
| `people_ref_` | 参考 / 映射表（含 SYNTHETIC_EXTENSION） | `people_ref_comp_band` |
| `people_meta_` / `people_metric` / `people_policy_` / `people_access_log` / `people_agent_` / `people_eval_` / `people_quality_` / `people_serving_` | 治理与运行对象 | — |
| 后缀 `_restricted` | 物理隔离的 restricted 数据 | `people_dim_person_restricted` |

### 2.2 键

- **规则：** canonical id = **master 系统不可变 id**（逻辑类型 text）+ **`source_system`**（写在 `people_meta_entity.master_source` / `canonical_model.yml`；行上的自然键列留在 SCD2 dim）。
- **例外：`person_id`。** 一人可对应多个源 id（candidate / Employee.name / 再入职新 `Employee.name`），因此 `person_id` 是 surrogate：`PER-` + `sha1(source_system \|\| source_object \|\| first_source_id)[:12]`。T1 / T6 分配（§3.3）。
- 其余实体用 master PK，不另造 `WRK-` / `ORG-` 前缀：`worker_id` = Employee.`name`；`org_id` = Department.`name`；`job_id` = Designation.`name`；`grade_id` = Employee Grade.`name`；`location_id` = Branch.`name`；Harvest 对象用其整数 id（列类型可 bigint，语义仍是源不可变 id）。
- SCD2 dim **保留自然键列**（`frappe_employee`、`frappe_department`、`gh_candidate_id`、`gh_opening_id` 等）。
- **BR-DQ-002（已知限制）：** Frappe `name` 在源里可 rename；rename 会断裂 canonical id。simulator **不产生 rename**。实网接入必须把 rename 当 identity 事件另案处理，不得静默改键。

### 2.3 时间

- 时间戳 `timestamptz`（UTC）；Frappe 的 date 字段无时区，按 UTC 日期。
- 生效区间 closed-open：`valid_from <= t < valid_to`；`valid_to null` = 当前。
- `month_end` = 该月最后一天；as-of 语义 = `month_end 23:59:59 UTC`；所有 metric 的 `as_of` 参数按 month_end 对齐（Tier 1 日常问题不需要月内精度）。
- 事件的 `event_date`（业务生效日）与 `recorded_at`（源系统 creation / modified）分开，支持迟登记。
- 历史回填期（切流前 5 年）dim 的 SCD2 粒度为月；切流后为日（§3.6）。

### 2.4 Provenance（存于 `people_meta_attribute.provenance`，不是数据表列）

`SOURCE_NATIVE` / `SOURCE_NESTED` / `CANONICAL_KEY` / `DERIVED`（须引用 business rule id）/ `SYNTHETIC_EXTENSION`（须在 §5.10 登记）/ `SOURCE_GAP`。`UNJUSTIFIED` 不允许出现在 `people_v2`。

**`SOURCE_GAP`（GATE 1 批准）**

- 规范列可以存在且 **值为 null**。
- **simulator 不得填充**该列。
- **metric YAML 不得依赖**该列。
- 必须写入 `people_meta_attribute`（`provenance = SOURCE_GAP`，连同 sensitivity / pii_class）。

当前缺口：`people_dim_learning_resource.duration_minutes`、`people_dim_learning_resource.roles`（Microsoft Learn catalog 现抽取无此键；内部 Training Event 无 `roles[]`）。

### 2.5 敏感度

`public` / `internal` / `confidential` / `restricted`。restricted 数据物理隔离到 `_restricted` 表，serving 角色无 SELECT 权限，只能经聚合 RPC 读取（§9）。

---

## 3. Scenario-driven Business Event Simulator

### 3.1 结构

```
data-platform/simulator/
  scenario/
    baseline.yaml              # 世界参数与行为基线
    scenarios/*.yaml           # 注入的情节（Case 2/3/4 的"剧情"）
  world.py                     # org 树、地点、职位、职级、薪酬带、日历
  population.py                # persons、workers、生命周期 hazard（离职/晋升/调动）
  recruiting.py                # openings → applications → stages → interviews → offers → hires
  comp.py  performance.py  learning.py  skills.py  engagement.py
  emit_frappe.py               # 输出 Frappe DocType JSON（含 creation / modified / docstatus）
  emit_greenhouse.py           # 输出 Harvest v3 对象 JSON（含 created_at / updated_at）
  emit_engagement.py           # 输出 engagement_ext 对象
  extract.py                   # 抽取仿真：full / incremental、manifest、scenario 注入的抽取故障
  run_manifest.py              # run_id、seed、scenario 版本、产出统计
```

- 单一 `simulator_seed`；scenario 文件带 `version`；同 seed + 同 scenario 版本 → 字节级一致输出。
- 时间以"业务日"推进；首次运行回填 5 年历史；之后每日增量一步。
- Scenario 只能改变行为参数或抽取机制，**永远不直接改 bronze / silver / gold**。

### 3.2 Baseline（`baseline.yaml`，数值可调）

| 维度 | 基线 |
|---|---|
| 组织 | 1 家公司 GlobalTech；4 个 BG；~25 部门；~150 团队；Department 树 4 层 |
| 地点 | Branch 从真实城市参考表生成：~30 城市 / 10 国 / 3 区域（AMER / EMEA / APAC） |
| 职位 | Designation 从 O*NET-SOC 职业标题抽取 ~120 个；job_family 由 SOC major group 派生 |
| 职级 | Grade G1–G10；level_rank = 数字 |
| 人口 | 5 年累计 ~80K workers；期末 active ~50K；rehire ~2% |
| 离职 | 年化 voluntary 10–14%（按 org / location / tenure 分段）；involuntary 2–3% |
| 流动 | promotion 8% / 年；transfer 6% / 年；standalone manager change 5% / 年 |
| 薪酬 | 年度 comp cycle（每年 4 月）；每次调整新一条 Salary Structure Assignment |
| 绩效 | 年度 Appraisal Cycle；final_score 1–5，分布可配 |
| 学习 | Training Event ~1,000 场 / 年；参与率按 org 配置 |
| 技能 | 每人 5–12 项 Employee Skill Map，从该职位对应 O*NET 元素按重要度抽样 |
| 招聘 | openings ≈ hires + 10% 取消；每 opening 12–20 applications；stage 序列 Application Review → Phone Screen → Onsite → Offer；每 stage 停留时长分布；offer acceptance 80–90% |
| Engagement | 半年一波；12 题 / 4 维；response rate 70–85% |

### 3.3 事务规则（原子；缺任何一部分即 bug，DQ 会拦）

| 事务 | 步骤（全部在同一业务日产出） |
|---|---|
| T1 Hire | Harvest `offer.status=accepted` → `application.status=hired`（hired_at）→ `opening.status=closed`，`opening.application_id` 指向该 application → crosswalk CND→PER（新人则新建 PER）→ Frappe `Employee` 新建（`date_of_joining = offer.starts_at`；department / designation / grade / branch 来自 opening）→ `Salary Structure Assignment`（from_date = joining）→ WRK 新建 |
| T2 Transfer | Frappe `Employee Transfer`（transfer_date；子表 Employee Property History 行：department / branch / reports_to 等变更）→ `Employee` 更新（modified） |
| T3 Promotion | Frappe `Employee Promotion`（promotion_date；子表行：designation / grade）→ 新 `Salary Structure Assignment` |
| T4 Comp cycle | 新 `Salary Structure Assignment`（from_date = 4 月 1 日） |
| T5 Separation | `Employee.status = Left`、`relieving_date`、`reason_for_leaving`（受控词表，§5.10）+ `Employee Separation` 文档（离职流程） |
| T6 Rehire | 新 `Employee` 记录；crosswalk 映射到既有 PER；新 WRK |
| T7 Manager change（独立） | 直接修改 `Employee.reports_to` → 由抽取 diff 捕获 |
| T8 Recruiter = employee | Harvest `user.employee_id = Employee.name` → crosswalk（唯一允许的 user→person 匹配方式） |
| T9 Appraisal | 每 cycle 每 active worker 一条 `Appraisal` |
| T10 Survey wave | 每波每 respondent 一组 responses（engagement_ext） |
| T11 Recruiting 内部 | application 创建 → stage 进入 / 退出 → interview → scorecard → reject 或 offer |

### 3.4 Scenario schema 与 v1 情节

```yaml
scenario_id: engineering_apac_attrition_rise      # Case 3
version: 1
kind: behavior                                   # behavior | extract_fault | reference_change
effective: {from: 2026-03-01, to: null}
target:
  org_path: "globaltech.engineering.*"
  location_region: APAC
  tenure_months: [12, 36]
effect:
  hazard_multiplier: {voluntary_separation: 1.8}
  reason_mix: {"Resignation - Better opportunity": 0.7, "Resignation - Personal": 0.3}
narrative: "Case 3 evidence: rise concentrated in APAC engineers with 1–3y tenure"
```

```yaml
scenario_id: apac_hris_feed_incomplete            # Case 2
version: 1
kind: extract_fault
effective: {from: 2026-08-14, to: 2026-08-14}
target: {source_system: frappe_hr, source_object: Employee, filter: {branch_region: APAC}}
effect:
  extract_rows_received_pct: 0.35                # manifest 的 control_total 仍报全量
narrative: "Case 2: data issue, not workforce change"
```

```yaml
scenario_id: hiring_slowdown_hm_latency           # Case 4（后期）
version: 1
kind: behavior
effective: {from: 2026-05-01, to: null}
target: {org_path: "globaltech.sales.*"}
effect: {stage_dwell_multiplier: {Onsite: 1.6}, offer_acceptance_delta: -0.08}
narrative: "Case 4: stage aging driven by hiring-manager latency"
```

### 3.5 与真实参考数据的绑定（让 crosswalk "由构造保证"）

| 合成对象 | 来源词表 | 结果 |
|---|---|---|
| Designation | O*NET-SOC 职业标题 | `people_xw_job` 1:1 到 SOC code；BLS OES 工资可按 SOC 对接 |
| Skill（Frappe） | O*NET Skills / Knowledge / Technology Skills 元素 | `people_xw_skill` 1:1 |
| Branch | 真实城市 / 国家参考表 | country / region 不是随机 |
| job_skill_target | O*NET 该职业的元素 importance / level | skill gap 有依据 |

### 3.6 抽取仿真

- Frappe：dims（Department / Designation / Employee Grade / Branch）每日 full；文档型 DocType 按 `modified > last_extract_ts` 增量；**Employee 仅每周五 full**（ODCS `full_extract_dow = Friday`，`control_total` = 全部文档含 Left），**其余日 incremental**。
- Harvest：按 `updated_after` 增量；每周 full。
- 每次抽取写 manifest：`control_total`（源内计数）与 `rows_received`；scenario `extract_fault` 只影响 `rows_received`，不影响 `control_total`——这就是 Case 2 可检测的原因。
- Case 2 scenario `apac_hris_feed_incomplete` **强制** `2026-08-14` 的 Employee 抽取为 `extract_mode=full`（即使日历已是周五 full）。
- **BR-DQ-003（absence semantics）：** full 抽取中缺席的记录 **不**视为删除/离职，除非该次抽取 **通过 volume test**（`rows_received / control_total ≥ 0.99`）**且** 连续两次 full 缺席。volume test 失败 → run **隔离**，`people_serving_pointer` **不动**。
- `people_replay_metric_value.value_bad` = 收到行中 **`status=Active` 的 naive 计数**（不做 certified 类型过滤）。`value_expected` = 上一 **certified headcount**（pointer 指向的抽取 as-of）。`control_total` / `rows_received` 仍写在 extract manifest。certified 路径不得因 Case 2 关闭任何 APAC worker。
- Employee full extract **无 status 过滤**。`control_total` = 源内全部 Employee 文档（含 Left）。在职数为派生指标（BR-WF-001）。BR-DQ-003 缺席 = 文档从抽取中消失，不是 `status=Left`。
- Postgres 中 `fact_application` / `evt_application_stage` / `fact_interview` / `fact_scorecard` 热窗口为 **12 个月**；全量在 lake；漏斗 mart 全历史。
- 历史回填：60 个月末 full 抽取（dims 的 SCD2 月粒度）+ 全部文档（事件自带日期）；切流后每日。
- 回填前确认独立项目配额（8 GB − 2 GiB 闸）。准入用 occupied + measured × 1.3，且准入后余量必须 ≥ 2 GiB。candidate EEOC / demographic 个人级永不进 Postgres。若带上 survey 个人级后余量不足 2 GiB，A7：survey 个人级只留 lake。日常 apply 在回填后改用实测/落地预估。

---

## 4. Source Contracts 与 Bronze 清单

### 4.1 Frappe HR（v16.15.0 + ERPNext v16.0.0）`[字段以 pinned DocType JSON 为准]`

| DocType | canonical 用途 | 源键 | 抽取 | 关键字段 `[核对]` |
|---|---|---|---|---|
| Employee | person / worker / 当前属性 / 离职 | `name` | 增量 + 周 full | employee_name, gender, date_of_birth, date_of_joining, status, company, department, designation, branch, **grade**（HRMS custom field）, **employment_type**（HRMS custom field Link Employment Type）, reports_to, relieving_date, reason_for_leaving, modified |

Employee **生效 schema** = ERPNext `employee.json` + `hrms/setup.py get_custom_fields()["Employee"]`（钉扎为 `custom_fields.json` / `employee_effective.fields.json`）。`grade` 与 `employment_type` 不是 ERPNext 原生列，但是 HRMS 安装时写入的 custom fields，provenance = SOURCE_NATIVE。

**BR-DQ-001：** 上表中 `is_submittable=1` 的 DocType（Transfer / Promotion / Separation / SSA / Salary Structure / Salary Slip / Appraisal / Training Event / Result / Feedback）只映射 `docstatus = 1`；`docstatus = 2` 作为 reversal 事件，不是第二条正向事件。子表继承父文档 docstatus。Employee / Department / Designation / Grade / Branch / Appraisal Cycle / Skill Map **不是** submittable。

**BR-DQ-002：** Frappe `name` rename 会断裂 canonical id。simulator 不产生 rename。

**BR-DQ-003：** full 抽取缺席 ≠ 离职；见 §3.6。
| Department | dim_org（树） | `name` | 日 full | department_name, parent_department, company, is_group, disabled |
| Designation | dim_job | `name` | 日 full | designation_name, description |
| Employee Grade | dim_grade | `name` | 日 full | default_salary_structure, default_base_pay |
| Branch | dim_location | `name` | 日 full | branch |
| Employee Transfer + 子表 Employee Property History | evt_worker(transfer) + evt_worker_change | `name` | 增量 | employee, transfer_date, transfer_details[property, current, new, fieldname], docstatus |
| Employee Promotion + 子表 | evt_worker(promotion) + change | `name` | 增量 | employee, promotion_date, promotion_details[...], docstatus |
| Employee Separation | evt_worker(separation) 的流程证据 | `name` | 增量 | employee, resignation_letter_date, boarding_status, docstatus |
| Salary Structure Assignment | fact_comp_assignment | `name` | 增量 | employee, salary_structure, from_date, base, variable, currency, docstatus |
| Salary Structure / Salary Component | ref | `name` | 日 full | — |
| Salary Slip + 子表 Salary Detail | lake only（mart_comp_paid_monthly） | `name` | 增量 | employee, start_date, end_date, gross_pay, net_pay, earnings[], deductions[] |
| Appraisal Cycle | dim_appraisal_cycle | `name` | 日 full | cycle_name, start_date, end_date, status |
| Appraisal | fact_appraisal | `name` | 增量 | employee, appraisal_cycle, final_score, total_score, self_score, status |
| Training Program / Training Event + 子表 / Training Result + 子表 / Training Feedback | dim_learning_resource(internal) / fact_training_participation | `name` | 增量 | event_name, training_program, start_time, end_time, employees[employee, attendance, status], employees[hours, grade] |
| Employee Skill Map + 子表 Employee Skill / Skill | fact_worker_skill / dim_skill | `name` | 增量 | employee, employee_skills[skill, proficiency, evaluation_date] |

### 4.2 Greenhouse Harvest v3 `[以 pinned OpenAPI 为准]`

| 对象 | canonical 用途 | 源键 | 关键字段 `[核对]` |
|---|---|---|---|
| candidates | dim_candidate | id | created_at, updated_at, recruiter, coordinator, applications[] |
| applications | fact_application | id | candidate_id, applied_at, rejected_at, status, source, referrer_id, rejection_reason, job_id, current_stage |
| application_stages | evt_application_stage | (application_id, job_interview_stage_id, entered_at) | entered_at, exited_at, current |
| jobs / openings | dim_requisition（requisition = opening） | opening.id | opened_at, closed_at, status, application_id, close_reason, departments[], offices[], hiring_team |
| job_stages | dim_stage | id | job_id, name, priority |
| departments / offices | xw_org / xw_location | id | name, parent_id |
| users | xw_identity（经 employee_id） | id | employee_id, disabled |
| sources | dim_source | id | name, type |
| scheduled_interviews | fact_interview | id | application_id, start, end, status, interview, interviewers[] |
| scorecards | fact_scorecard | id | application_id, interview_step, submitted_by, submitted_at, overall_recommendation |
| offers | fact_offer | id | application_id, version, created_at, sent_at, resolved_at, starts_at, status |
| rejection_reasons | dim_rejection_reason | id | name, type |
| demographic_questions / answer_options / answers | fact_candidate_demographic_restricted | answer id | application_id, question_id, answer_option_id, free_form_text |
| eeoc | fact_candidate_eeoc_restricted | application_id | race, gender, veteran_status, disability_status, submitted_at |

### 4.3 engagement_ext（SYNTHETIC_EXTENSION，见 `docs/ENGAGEMENT_INSTRUMENT.md`）

| 对象 | 内容 |
|---|---|
| survey_instrument | 12 题、4 维（Engagement / Manager / Growth / Wellbeing）、5 点 Likert、反向计分标记、版本 |
| survey_wave | wave_id、开始 / 结束、目标人群、response rate |
| survey_response | response_id、wave_id、worker_id、item_id、score（item 级只留 lake） |

### 4.4 外部真实源（已在 bronze，保持）

O*NET（db 版本固定）、BLS（series 列表固定）、Microsoft Learn（catalog）。全部标记 `trust: data_only`。

### 4.5 Bronze 布局与 manifest

```
people_bronze/<source_system>/<object>/extract_date=YYYY-MM-DD/run_id=<id>/part-*.parquet
列：_source_system, _source_object, _source_version, _source_id, _extract_id, _extract_ts,
    _row_hash, payload(JSON 字符串), 以及提升到顶层的键与 modified/updated_at
```

`people_meta_extract_run`：extract_id, run_id, source_system, source_object, extract_date, mode(full|incremental), control_total, rows_received, status, started_at, finished_at, scenario_ids[]。

---

## 5. Silver 规范模型

所有 silver 表在 lake 以 parquet 构建，§7 标注哪些发布到 Postgres。

### 5.1 Crosswalks

| 表 | 列 | 规则 |
|---|---|---|
| `people_xw_identity` | person_id, worker_id(nullable), source_system, source_object, source_id, valid_from, valid_to, match_method(transaction \| employee_id \| manual) | 只允许三种匹配：T1/T6 事务、Harvest user.employee_id、人工登记。**禁止 name / email 匹配** |
| `people_xw_org` | org_id, frappe_department, gh_department_id, valid_from, valid_to | GH department ≠ Frappe department，必须显式映射 |
| `people_xw_location` | location_id, frappe_branch, gh_office_id, city, country, region | city / country / region 来自参考表 |
| `people_xw_job` | job_id, frappe_designation, onet_soc_code, job_family | job_family = SOC major group（DERIVED，BR-WF-005） |
| `people_xw_skill` | skill_id, frappe_skill, onet_element_id | 由构造保证 1:1 |

### 5.2 SCD2 维度（来自每日 / 每月 full 抽取的 diff）

| 表 | 关键列 | provenance 要点 |
|---|---|---|
| `people_dim_org` | org_id, org_name, parent_org_id, company, is_group, org_path(ltree), depth, bg, valid_from, valid_to, is_current | org_path / depth / bg = DERIVED（BR-ORG-001） |
| `people_dim_job` | job_id, job_name, onet_soc_code, job_family, valid_from, valid_to, is_current | job_family DERIVED（BR-WF-005） |
| `people_dim_grade` | grade_id, grade_name, level_rank, default_salary_structure, valid_from, valid_to, is_current | level_rank = SYNTHETIC_EXTENSION（§5.10 E2） |
| `people_dim_location` | location_id, branch_name, city, country, region, valid_from, valid_to, is_current | city/country/region 来自 `people_ref_city`（E3） |
| `people_dim_date` | date, month_end, is_month_end, fiscal_*(可选) | — |
| `people_dim_appraisal_cycle` | cycle_id, cycle_name, start_date, end_date, status | SOURCE_NATIVE |
| `people_dim_stage` | stage_id, gh_job_id, stage_name, priority, canonical_stage(Review\|Screen\|Onsite\|Offer) | canonical_stage DERIVED（BR-TA-001） |
| `people_dim_source` / `people_dim_rejection_reason` | id, name, type | SOURCE_NATIVE |
| `people_dim_skill` | skill_id, skill_name, onet_element_id, element_type | — |
| `people_dim_learning_resource` | resource_id, source(internal\|microsoft_learn), title, url, level, duration_minutes, roles[], products[] `[核对 Learn schema]` | — |
| `people_dim_survey_wave` / `people_dim_survey_item` | 见 §4.3 | SYNTHETIC_EXTENSION（E5） |

### 5.3 Person / Worker / 事件 / 历史

**`people_dim_person`**：person_id, first_seen_at, first_seen_source。不含任何 PII。

**`people_dim_person_restricted`**：person_id, full_name, gender, date_of_birth（Employee，SOURCE_NATIVE）。restricted。

**`people_dim_worker`**（一段雇佣关系一行）

| 列 | 来源 | provenance |
|---|---|---|
| worker_id | 派生 | CANONICAL_KEY |
| person_id | xw_identity | CANONICAL_KEY |
| frappe_employee | Employee.name | SOURCE_NATIVE |
| hire_date | Employee.date_of_joining | SOURCE_NATIVE |
| termination_date | Employee.relieving_date | SOURCE_NATIVE |
| termination_reason_raw | Employee.reason_for_leaving | SOURCE_NATIVE |
| termination_category | ref_separation_reason_map | DERIVED（BR-RET-001：voluntary / involuntary / other） |
| employment_type | Employee.employment_type | SOURCE_NATIVE |
| is_rehire | person 已有先前 worker | DERIVED（BR-WF-006） |
| hired_via_application_id | T1 事务 | CANONICAL_KEY（nullable：历史回填期前的员工无 ATS 记录） |

**`people_evt_worker`**（append-only）

| 列 | 说明 |
|---|---|
| event_id, worker_id, person_id | 键 |
| event_type | hire \| rehire \| transfer \| promotion \| manager_change \| comp_change \| status_change \| separation |
| event_date | 业务生效日（transfer_date / promotion_date / from_date / relieving_date / 抽取日） |
| recorded_at | 源 creation / modified |
| source_system, source_object, source_id, extract_id | 溯源；`source_object = 'Employee (extract diff)'` 表示由 T7 类直接修改捕获 |

**`people_evt_worker_change`**：event_id, property(department \| designation \| grade \| branch \| reports_to \| employment_type \| status \| base \| variable), old_value, new_value, old_canonical_id, new_canonical_id。镜像 Employee Property History 子表行（SOURCE_NESTED）或抽取 diff（DERIVED，BR-WF-007）。

**`people_hist_worker_attr`**（由 hire 初始态 + 事件流重建；as-of 查询唯一入口）

worker_id, valid_from, valid_to, org_id, job_id, grade_id, location_id, manager_worker_id, employment_type, status, source_event_id。不变量：同一 worker 的区间不重叠、无缝隙、首段 valid_from = hire_date。

### 5.4 薪酬

**`people_fact_comp_assignment_restricted`**：comp_assignment_id, worker_id, from_date, to_date(DERIVED = 下一条 from_date), salary_structure, base, variable, currency, source_ssa。restricted。

Salary Slip 只在 lake（`people_silver_salary_slip`）；Postgres 只发布 `people_mart_comp_paid_monthly`（org × country × month 聚合）。

**`people_ref_comp_band`**（E1）：grade_id, country, currency, band_min, band_mid, band_max, valid_from, valid_to。compa_ratio = base / band_mid（BR-COMP-001）。

### 5.5 绩效

**`people_fact_appraisal`**：appraisal_id, worker_id, cycle_id, final_score, total_score, self_score, status, submitted_at。confidential（个人粒度不直接可读，见 §9）。

### 5.6 学习与技能

- `people_fact_training_participation`：worker_id, training_event_id, resource_id, attendance, status, hours, grade, event_start
- `people_fact_worker_skill`：worker_id, skill_id, proficiency(1–5), evaluation_date, source_skill_map
- `people_ref_job_skill_target`：job_id, skill_id, target_proficiency, onet_importance（DERIVED，BR-SK-001）

### 5.7 招聘

| 表 | 关键列 | 备注 |
|---|---|---|
| `people_dim_requisition` | requisition_id, gh_job_id, gh_opening_id, job_id, org_id, location_id, hiring_manager_person_id, recruiter_person_id, opened_at, closed_at, status, close_reason, hired_application_id | requisition = opening；hiring team 经 xw_identity |
| `people_dim_candidate` | candidate_id, gh_candidate_id, person_id(nullable，T1 后填), created_at, first_source_id | 应聘多职位 = 多 application |
| `people_fact_application` | application_id, candidate_id, requisition_id, applied_at, status(active \| rejected \| hired), rejected_at, hired_at, source_id, **referrer_person_id**, rejection_reason_id, rejection_type, current_stage_id | Harvest 仅有 `referrer_id`，无独立 credited user。列名不是 credited_to（BR field check）。 |
| `people_evt_application_stage` | application_id, stage_id, entered_at, exited_at, is_current | **不存 duration**；time_in_stage 在 gold / metric 派生 |
| `people_fact_interview` | interview_id, application_id, stage_id, start_at, end_at, status, interviewer_person_ids[] | — |
| `people_fact_scorecard` | scorecard_id, application_id, interview_id, submitted_by_person_id, submitted_at, overall_recommendation | — |
| `people_fact_offer` | offer_id, version, application_id, requisition_id, created_at, sent_at, resolved_at, starts_at, status(unresolved \| accepted \| rejected \| deprecated) | T1 的触发点 |
| `people_dim_recruiter` | person_id, specialization, supported_region, supported_job_family, valid_from, valid_to | SYNTHETIC_EXTENSION（E4） |

### 5.8 Engagement（E5）

`people_fact_survey_score_restricted`：worker_id, wave_id, dimension, score_mean, items_answered。item 级留 lake。仅经聚合 RPC 读取，min cell 5。

### 5.9 人口统计（决策 B）

- `people_fact_candidate_demographic_restricted`：application_id, question_id, answer_option_id, free_form_text, submitted_at
- `people_fact_candidate_eeoc_restricted`：application_id, race, gender, veteran_status, disability_status, submitted_at
- 规则（BR-GOV-001）：候选人 demographic / EEOC **永不**与 worker / person 关联；员工层面的 gender / DOB 只来自 HRIS（`people_dim_person_restricted`）。
- **禁止 join path**（`people_meta_join_path` denied）：`people_fact_candidate_eeoc_restricted` / `people_fact_candidate_demographic_restricted` → `people_fact_application` → `people_dim_candidate` → `people_dim_person` / `people_dim_worker` **全部 denied**。对抗用例：`data-platform/evals/golden/gov001_denied_eeoc_person_join.yaml`。
- fairness / pay-equity RPC **只允许**维度：requisition / org / location / job_family。min cell 10。不作为普通 breakdown。

### 5.10 SYNTHETIC_EXTENSION 登记表（每项必须出现在 `people_meta_attribute`）

| id | 对象 | 理由 | 真实世界来源 |
|---|---|---|---|
| E1 | `people_ref_comp_band` | Frappe HR 无薪酬带对象；compa-ratio 必需 | 薪酬系统 / 市场调研 |
| E2 | `people_dim_grade.level_rank` | Frappe Employee Grade 无排序 | 职级体系文档 |
| E3 | `people_ref_city`（city / country / region） | Frappe Branch 只有名称 | 地址主数据 |
| E4 | `people_dim_recruiter` 属性 | Harvest user 只有身份与权限 | TA 运营配置 |
| E5 | engagement_ext 全部对象 | 无开源 HRIS 含调研模块 | 调研平台 |
| E6 | `people_ref_separation_reason_map` 的词表 | Frappe reason_for_leaving 为自由文本，simulator 采用受控词表 | 离职原因主数据 |
| E7 | GlobalTech org 树的名称与结构 | 合成公司 | — |

E8（`employment_type` 词表）**已撤回**：HRMS custom field `Employee.employment_type` 存在，provenance = SOURCE_NATIVE。

---

## 6. Gold：快照与 Marts

### 6.1 `people_snap_worker_month`（grain：worker × month_end；只含该月内曾 active 的 worker）

| 列 | provenance / 规则 |
|---|---|
| worker_id, person_id, month_end | 键 |
| org_id, org_path, job_id, job_family, grade_id, level_rank, location_id, country, region, manager_worker_id, employment_type | as-of month_end，来自 `people_hist_worker_attr` + dims |
| status_at_month_end, is_active_at_month_end | DERIVED（**BR-WF-001**：population = f(Employee.status, Employment Type.name)。Active/Suspended 计入；Inactive/Left 不计。Employment Type Full-time/Part-time/Probation（及自定义 Regular）进 certified headcount；Intern/Apprentice/Contract 单列。**待 owner 确认**。同时 hire_date ≤ month_end 且 termination_date 为空或 > month_end。） |
| hire_date, tenure_months, tenure_band | DERIVED（BR-WF-004：<1y / 1–3y / 3–5y / 5–10y / 10y+） |
| hired_in_month, terminated_in_month, termination_category, is_regrettable | DERIVED；is_regrettable = voluntary 且最近 final_score ≥ 4（BR-RET-002，阈值在 business_rules.yaml） |
| promoted_in_month, transferred_in_month, manager_changed_in_month, comp_changed_in_month | 来自 `people_evt_worker` |
| is_manager, direct_report_count | DERIVED（月末有直接下属） |
| skill_count, critical_skill_coverage | DERIVED（BR-SK-001） |
| run_id, built_at | 血缘 |

**`people_snap_worker_month_restricted`**（同键）：base_pay, currency, band_mid, compa_ratio, last_appraisal_score, engagement_last_wave_score。

SQL 骨架（DuckDB 构建）：

```sql
with m as (select month_end from people_dim_date where is_month_end),
w as (
  select w.*, m.month_end,
         date_trunc('month', m.month_end) as month_start
  from people_dim_worker w join m
    on w.hire_date <= m.month_end
   and (w.termination_date is null or w.termination_date >= date_trunc('month', m.month_end))
),
attr as (
  select w.worker_id, w.month_end, h.org_id, h.job_id, h.grade_id, h.location_id,
         h.manager_worker_id, h.employment_type, h.status
  from w join people_hist_worker_attr h
    on h.worker_id = w.worker_id
   and h.valid_from <= w.month_end and (h.valid_to is null or h.valid_to > w.month_end)
)
select w.worker_id, w.person_id, w.month_end, attr.*,
       (h.status in ('Active','Suspended')
        and h.employment_type in ('Full-time','Part-time','Probation','Regular')
        and (w.termination_date is null or w.termination_date > w.month_end)
       ) as is_active_at_month_end,
       datediff('month', w.hire_date, w.month_end) as tenure_months,
       w.hire_date between w.month_start and w.month_end as hired_in_month,
       w.termination_date between w.month_start and w.month_end as terminated_in_month
       -- 其余 DERIVED 列按 business_rules.yaml 生成
from w join attr using (worker_id, month_end);
```

### 6.2 招聘快照

- `people_snap_requisition_month`：requisition × month_end：is_open, days_open, applications_active, per canonical_stage 计数, offers_outstanding
- `people_snap_recruiter_month`：recruiter person × month：open_requisitions, active_applications, interviews_scheduled, offers_sent, hires, avg_req_load, candidate_load（对应 SOURCE_CONTRACT_FIRST §21）

### 6.3 Marts（预聚合；1-way 与选定 2-way 维度；小于 min cell 的行在构建时抑制并标记）

| mart | grain | 指标 |
|---|---|---|
| `people_mart_workforce_monthly` | (org \| location \| job_family \| grade \| tenure_band \| employment_type) × month | headcount, avg_headcount, hires, terms_vol, terms_invol, terms_regrettable, promotions, transfers, manager_changes |
| `people_mart_workforce_monthly_2d` | org × location × month；org × tenure_band × month | 同上 |
| `people_mart_mobility_monthly` | org × month | promotion_rate 分子分母、internal_mobility |
| `people_mart_recruiting_monthly` | (org \| location \| job_family) × month | openings_opened / filled / cancelled, applications, offers_sent / accepted, ttf_p50 / p90 |
| `people_mart_stage_aging_monthly` | canonical_stage × org × month | time_in_stage p50 / p90（= exited_at − entered_at） |
| `people_mart_recruiter_load_monthly` | recruiter × month | 来自 snap_recruiter_month |
| `people_mart_comp_monthly` | org × grade × country × month | n, compa_ratio p25 / p50 / p75（min cell 10） |
| `people_mart_learning_monthly` | org × month | training_hours, participants, completion |
| `people_mart_skill_coverage_monthly` | org × job_family × month | coverage ratio, gap top-N |
| `people_mart_engagement_wave` | org × wave × dimension | n, mean, favorable_pct（min cell 5） |
| `people_mart_source_health_daily` | source_system × object × date | control_total, rows_received, freshness_hours, tests_failed |

任意其他维度组合走 `people_get_metric_breakdown` 在 snapshot 上实时计算并抑制（§9.4）。

---

## 7. Postgres `people_v2`：发布对象与容量

| 对象 | 层 | 估算行数 | 发布到 Postgres | 说明 |
|---|---|---|---|---|
| xw_* 全部 | silver | < 500K | 是 | — |
| dim_* 全部（含 SCD2，不含 dim_candidate） | silver | < 200K | 是 | dim_candidate 见下行 |
| dim_person / dim_worker | silver | 78K / 80K | 是 | — |
| dim_person_restricted | silver | 78K | 是（隔离） | — |
| evt_worker / evt_worker_change | silver | ~400K / ~800K | 是 | — |
| hist_worker_attr | silver | ~600K | 是 | as-of 入口 |
| fact_comp_assignment_restricted | silver | ~320K | 是（隔离） | — |
| fact_appraisal | silver | ~250K | 是 | — |
| fact_training_participation / fact_worker_skill | silver | ~400K / ~640K | 是 | — |
| dim_requisition | silver | ~57K | 是 | filled ≈ window hires；cancelled ≈ 10% of openings |
| dim_candidate / fact_application | silver | candidates 随申请；applications **~600 万行（仅 lake 全量）** | **热窗口：最近 12 个月**（两表都是） | `people_mart_funnel_*` 全历史。校准：Greenhouse 2023 / Ashby 2024 apps-per-req；Jobvite 2023 source mix |
| evt_application_stage | silver | 随 application 热窗口按 ~2× 计 | **热窗口：最近 12 个月** | 全量在 lake；stage aging mart 全历史 |
| fact_interview / fact_scorecard | silver | 热窗口内随漏斗 | **热窗口：最近 12 个月** | 全量在 lake |
| fact_offer | silver | ~70–90K | 是 | 体积小，全量发布 |
| fact_survey_score_restricted | silver | ~1.6M | 是（隔离） | item 级在 lake |
| fact_candidate_*_restricted | silver | ~1.4M | **否（lake only）** | 最敏感的候选人数据不进 serving 层，只有抑制后的聚合 `people_mart_applicant_flow`（min cell 10）出现。这是治理演示，不是磁盘妥协。 |
| snap_worker_month (+ _restricted) | gold | ~3M | 是 | — |
| snap_requisition_month / snap_recruiter_month | gold | ~1M / ~30K | 是 | — |
| mart_* 全部 | gold | < 2M | 是 | — |
| daily worker snapshot / salary slip / survey item | — | 91M / 4.8M / 4.8M | 否 | lake only |

预计 Postgres 占用随热窗口与 marts 变化（含索引；`fact_application` / `evt_application_stage` / `fact_interview` / `fact_scorecard` / `dim_candidate` 一律 12 个月热窗口）。Lake 上 application 全量约 **600 万行**。Serving 项目配额 8 GB；`apply.py` **fail-closed**：quota 缺失即拒绝；仅当 `database + WAL + system + expected_backfill_delta ≤ quota − 2 GiB` 才放行。publish 分四段（dims/xw → facts/events → snapshots → marts），每段后核对 `pg_database_size`，超预算即停。**候选人 EEOC / demographic 个人级永不进 Postgres**——站点只消费已抑制的 `people_mart_applicant_flow`。这是治理演示的一部分，不是容量妥协。`people_fact_survey_score_restricted` 仍进 Postgres（engagement 的 org 切分需要）；仅当准入后余量 < 2 GiB 时 A7 把 survey 个人级也留在 lake。Hetzner 用 session pooler 5432 + `people_publisher`；Vercel 用 transaction pooler 6543。RPC 内 `set_config` 必须 `is_local = true`。凭证只在 env。

**治理与运行对象（同 schema）**：`people_meta_entity`、`people_meta_attribute`（含 provenance、sensitivity、pii_class）、`people_meta_relationship`、`people_meta_join_path`、`people_contract`、`people_metric`、`people_metric_version`、`people_metric_health`、`people_glossary`、`people_business_rule`、`people_lineage`、`people_quality_test`、`people_quality_result`、`people_quality_incident`、`people_serving_run`、`people_serving_pointer`、`people_replay_metric_value`、`people_policy_role`、`people_policy_rule`、`people_policy_demo_identity`、`people_access_log`、`people_suppression_log`、`people_skill_registry`、`people_skill_eval`、`people_model_registry`、`people_model_run`、`people_agent_trace`、`people_agent_tool_call`、`people_signal`、`people_brief`、`people_eval_case`、`people_eval_run`、`people_eval_result`。列定义在各自 Phase 的 PR 中给出，必须引用本文档的 grain 与键。

---

## 8. Semantic Layer 绑定：v1 Metric 清单

Metric YAML schema 见 AGENT_ARCHITECTURE §4.2.2；RPC 由 YAML 生成。

| metric_id | grain 表 | numerator | denominator | allowed_dimensions | min_cell | sensitivity |
|---|---|---|---|---|---|---|
| headcount | snap_worker_month | count(is_active_at_month_end) | — | org, location, job_family, grade, tenure_band, employment_type | 5 | internal |
| average_headcount | snap_worker_month | avg over months | — | 同上 | 5 | internal |
| hires | evt_worker(hire, rehire) | count | — | 同上 | 5 | internal |
| voluntary_attrition_rate | snap_worker_month | terminated_in_month ∧ category=voluntary | average_headcount | 同上 + manager_l2 | 5 | internal |
| involuntary_attrition_rate | snap_worker_month | category=involuntary | average_headcount | 同上 | 5 | internal |
| regrettable_attrition_rate | snap_worker_month | is_regrettable | average_headcount | 同上 | 5 | confidential |
| promotion_rate | snap_worker_month | promoted_in_month | average_headcount | org, location, job_family, grade | 5 | internal |
| internal_mobility_rate | snap_worker_month | transferred_in_month | average_headcount | 同上 | 5 | internal |
| manager_turnover_rate | snap_worker_month | terminated ∧ is_manager | avg managers | org, location | 5 | internal |
| span_of_control | snap_worker_month | direct_report_count | managers | org, location, grade | 5 | internal |
| time_to_fill_days | dim_requisition + fact_offer | median(offer.resolved_at(accepted) − opened_at) | — | org, location, job_family | 5 | internal |
| time_in_stage_hours | evt_application_stage | median(exited_at − entered_at) | — | canonical_stage, org, job_family | 5 | internal |
| offer_acceptance_rate | fact_offer | accepted | sent (resolved) | org, location, job_family | 5 | internal |
| applications_per_opening | fact_application / dim_requisition | applications | openings | org, job_family, source | 5 | internal |
| quality_of_hire | snap_worker_month + fact_appraisal | hired_via_application ∧ 12 个月留任 ∧ 首次 final_score ≥ 3.5 | hires 12 个月前 | org, job_family, source | 10 | confidential |
| recruiter_load | snap_recruiter_month | open_requisitions | recruiters | region, job_family | 3（非个人聚合） | internal |
| compa_ratio_median | snap_worker_month_restricted | median(compa_ratio) | — | org, grade, country | 10 | restricted |
| engagement_score | fact_survey_score_restricted | mean(score) | respondents | org, location, dimension, wave | 5 | confidential（E5 标注） |
| training_hours_per_worker | fact_training_participation | sum(hours) | average_headcount | org, job_family | 5 | internal |
| skill_coverage | fact_worker_skill + ref_job_skill_target | workers 达标 | workers | org, job_family | 5 | internal |

每个 metric 的 `lineage` 列出到 bronze object 的完整路径；`health` 由 §10 推导。

---

## 9. 治理执行

### 9.1 分类标签

`people_meta_attribute` 每列：sensitivity、pii_class(none \| pii \| sensitive_pii)、tags[]（comp \| performance \| demographic \| health_leave）。restricted 表在 §5 已物理隔离。

### 9.2 身份与调用方式

- Postgres 登录角色 `people_app`：非超级用户、**不 bypass RLS**；仅 GRANT SELECT on marts / dims / xw、EXECUTE on `people_get_*`。restricted 与个人粒度表对其无 SELECT。
- 调用方只有可信服务端：Next.js server（经 Supavisor transaction pooler）与 `people-mcp`。浏览器不直连；v2 不使用 anon key。
- Demo 身份（`people_policy_demo_identity`）：`{identity_id, role, org_scope ltree[], sensitivity_max, grain_max='aggregate', label}`。角色：`external_viewer`（站点访客，默认）、`leader`、`hrbp`、`people_analyst`。
- 所有 RPC 签名以 `p_identity_id text` 开头；`people_assert_identity(p_identity_id)` 从表读取身份并 `set_config('people.role' / 'people.org_scope' / 'people.sensitivity_max', …, true)`（事务级）。org scope 来自身份记录，**不来自参数或对话**。

### 9.3 两级执行

1. **聚合表（marts、dims）**：RLS 策略读 `current_setting`：
   ```sql
   create policy mart_read on people_v2.people_mart_workforce_monthly for select using (
     current_setting('people.role', true) in ('people_analyst','external_viewer')
     or (current_setting('people.org_scope', true))::ltree[] @> org_path
   );
   ```
   restricted 敏感度的 mart 行（如 comp）另加 `sensitivity <= current_setting('people.sensitivity_max')`。
2. **个人粒度表（snap_*、evt_*、fact_*、*_restricted）**：`people_app` 无 SELECT；只有 `security definer` 的聚合 RPC（owner 为 `people_definer`，固定 `search_path`）读取，函数内部：断言身份 → 按 org_scope 过滤 → 按 sensitivity 门控 → 聚合 → 抑制（9.4）→ 写 access log。候选人 EEOC / demographic 个人级不在 serving schema 中，因此也不存在可被 RPC 误读的行；公平性与漏斗只走 `people_mart_applicant_flow`。

### 9.4 抑制算法（`people_get_metric_breakdown` 内）

1. 计算各 cell 的分母计数 n。
2. n < `min_cell_size`（metric YAML；restricted 为 10）→ value 置 null，`suppressed=true`。
3. 补充抑制：同一父级下若恰有一个被抑制 cell 且父级总计可见 → 再抑制次小 cell。
4. 差分防护（v1.1）：`people_access_log` 中同 session 同 metric、filter 集只差一个谓词且差集 n < min_cell → 拒绝并记录。
5. 写 `people_suppression_log`（trace_id, metric_id, dimension, cells_suppressed, rule）。

### 9.5 审计

`people_access_log`：ts, identity_id, role, session_id, trace_id, rpc, metric_id/skill_id, filters(jsonb), rows_returned, cells_suppressed, purpose_tag。保留 90 天（可配）。

---

## 10. 质量、事故与 Serving Pointer

### 10.1 DQ 测试清单（现有 ~30 条按层归位）

| 层 | 测试 |
|---|---|
| bronze | manifest `rows_received` vs `control_total`（volume）；payload schema vs data contract（schema drift）；JSON 解析 |
| silver | 主键唯一；not null；RI（worker→org/job/grade/location、application→candidate/requisition、offer→application）；temporal（valid_from < valid_to；区间无重叠无缝隙；hire_date ≤ termination_date；entered_at ≤ exited_at；event_date ≤ recorded_at + 容忍）；事务完整性（每个 hired application 有 accepted offer、closed opening、xw 记录与 worker；每个 separation 有 reason）；freshness |
| gold | 行数与上月偏差异常；metric YAML 的 range tests；snapshot 不变量（active 数 = 上月 + hires − terms ± 迟登记） |

### 10.2 隔离与 pointer

- 每次管道运行一个 `run_id`；`people_serving_run(run_id, run_ts, status certified \| quarantined \| superseded, scenario_versions, simulator_seed, tests_failed[])`。
- 任何 blocking 测试失败 → 该 run 的 gold 只写 lake 隔离区，**不**发布到 `people_v2` 主表；`people_serving_pointer(context current → 上一个 certified run_id)`。
- `people_metric_health(metric_id, run_id, status healthy \| degraded \| blocked, blocked_by_test_ids[], reason)` 由 lineage 自动推导：上游对象测试失败 → 下游 metric blocked。
- Case 2 回放：`people_serving_pointer(context incident_replay → quarantined run_id)`；`people_replay_metric_value(run_id, metric_id, as_of, value_bad, value_expected)` 与 `people_quality_incident`（expected_rows, received_rows, source_object, classification data_issue \| business_change, classified_by, closed_at）。分类由人确认后才允许解除阻断。

---

## 11. Pipeline 与调度（Hetzner，无 Docker）

```
daily (cron 02:00 UTC)
  1. simulator.step(day)            → source-shaped payloads
  2. extract.run()                  → bronze parquet + people_meta_extract_run
  3. dq.bronze()                    → blocking: volume / schema
  4. build.silver()  (DuckDB)       → xw / dims SCD2 / evt / hist / facts
  5. dq.silver()                    → blocking: keys / RI / temporal / transaction
  6. build.gold()    (DuckDB)       → snapshots (增量月) / marts / health aggregates
  7. dq.gold()                      → blocking: anomaly / metric range
  8. publish.postgres(run_id)       → 幂等 upsert；失败 → quarantine + pointer 不动
  9. health.derive()                → people_metric_health / people_serving_run
 10. lake.sync()                    → rsync 到 lake 目录；run manifest 落盘
weekly: full extract 校验；eval harness（Phase 4 起）
```

- 幂等：以 run_id + 自然键 upsert；重跑同一天覆盖同 partition。
- 回填：`simulator.backfill(5y)` 一次生成；bronze 按月末 partition 写入；silver / gold 全量构建；publish 全量。
- Lake 不是唯一事实来源：run manifest + scenario + seed 可在任何机器重放。

---

## 12. 三个 Case 在新模型上的读取路径

| Case | 读取 |
|---|---|
| 1 Can I trust this number? | `people_metric(headcount)` YAML → `people_get_metric` → `snap_worker_month` → `people_lineage` 到 `Employee` bronze → `people_quality_result` → `people_metric_health` → `people_serving_run.certified` |
| 2 Why did headcount drop? | `people_serving_pointer(incident_replay)` → `people_meta_extract_run`（control_total vs rows_received）→ 失败的 volume test → lineage 影响面 → `people_metric_health.blocked` → `people_replay_metric_value` → `people_quality_incident.classification` |
| 3 Why is Engineering attrition rising? | `voluntary_attrition_rate` trend → breakdown（location × tenure_band，抑制生效）→ `cohort_survival` skill 读 `snap_worker_month` → `attrition_driver_screen` 读 evt / appraisal / skill / learning（聚合）→ BLS 外部对照 → 数据集页显示 scenario `engineering_apac_attrition_rise` 已注入 |

---

## 13. 应用侧改动（切流时）

- `peopleServing.*` 改为 v2 客户端：直连 Postgres（`people_app` 角色，pooler），所有调用带 `identity_id`；默认 `external_viewer`。
- RPC 名称由 metric YAML 生成；旧 `people_get_*` 在 `public` 保留到切流后 30 天。
- 三个 case 页只改数据绑定与数字校对，不改叙事结构；数据集页新增 scenario 列表与 SYNTHETIC_EXTENSION 说明。
- `/lab` 不受影响（独立路径与数据）。

---

## 14. 构建顺序与 STOP Gates

| 步骤 | 内容 | Definition of Done |
|---|---|---|
| 1 | 在 `zapmigfrtnwnkmezjefx` 建 `people_v2` schema、`people_app`（NOLOGIN）/ `people_definer`（NOLOGIN）/ `people_publisher`（LOGIN）角色、ltree 扩展；撤销 Data API 角色对 schema 的权限 | 角色权限矩阵通过测试 |
| 2 | 写 contracts 与 mapping YAML（Frappe / Harvest / engagement_ext / external） | 每个 canonical 列有 mapping；provenance 无 UNJUSTIFIED；E1–E7 登记 |
| **GATE 1** | **人审 contracts + mappings + 5.10 登记表；不通过不建 silver** | — |
| 3 | simulator baseline + T1–T11 事务 + extract 仿真 + manifest | 单元测试：每事务产出完整对象集；seed 可重放 |
| 4 | scenario 三份 YAML；数据集页文案 | scenario 作用域与 narrative 与 case 一致 |
| **GATE 2** | **人审 baseline 参数与 scenario；不通过不回填** | — |
| 5 | 5 年回填 → bronze → silver → gold（lake） | 全部 DQ 通过；快照不变量成立 |
| 6 | publish 到 `people_v2`；meta / metric / lineage / health 落表 | 20 个 metric RPC 由 YAML 生成并与 mart 对账 |
| 7 | 治理：demo 身份、RLS、definer RPC、抑制、access log | 角色 × metric 矩阵测试通过；external_viewer 无法取得任何个人行 |
| 8 | 应用绑定 v2；三个 case 数字重新校对 | case 页复核 checklist 完成 |
| **GATE 3** | **人审切流：pointer、数字、页面；不通过不切** | — |
| 9 | 切流；旧对象 30 天后清理 | 旧 `people_*` 在 `public` 删除；文档更新 |

Phase 0–1 期间**不改网站首页与导航**。

---

## 15. 未定项（不阻塞本文档）

- `people-mcp` 部署位置与外部访客 token（Phase 4）
- 差分防护上线时机（v1.1）
- 是否引入 ESCO 作为第二技能分类
- Supabase 存储余量核实后的热窗口长度
