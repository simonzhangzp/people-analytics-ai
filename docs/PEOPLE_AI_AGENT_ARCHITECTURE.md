# PeopleAnalyticsAI.net — AI Agent 时代的 People Analytics 参考架构

**Cursor 项目文档 · v1 · 2026-09-01**
**建议路径：`docs/PEOPLE_AI_AGENT_ARCHITECTURE.md`**

---

## 0. 本文档的作用与约束

**作用**

- 定义 PeopleAnalyticsAI.net 的目标架构（5 layers + 2 pillars + agent 分类），作为后续所有重构的上位文档。
- 与 `docs/PEOPLE_SOURCE_CONTRACT_FIRST.md` 并列。那份文档仍是 L1（Data Foundation）的执行规范，本文档不改变其优先级，只是把它放进完整的层次里。
- 网站定位不变：recruiter / hiring-manager-facing portfolio + working demo。核心命题从 **"Strong AI does not fix weak enterprise data."** 扩展为 **"Strong AI does not fix weak enterprise data — and ungoverned agents make weak data worse."**

**继承的硬约束**

- 数据库对象一律 `people_*` 前缀；不触碰 QuantReview 遗留对象（如 `panorama_daily`）；不写 QuantReview 生产库。
- 公开站点必须标明 synthetic dataset / not a real company。
- destructive migration 前必须 STOP，等人审 source schema 与 mapping。
- 本文档和公开站点不引用任何雇主内部材料、项目名或数字；架构表述一律使用行业通用术语。

---

## 1. 设计原则（AI agent 工程 × HR 治理）

1. **Deterministic core, probabilistic edge.** 所有数字在 semantic layer / SQL / skill scripts 中计算；LLM 只负责意图理解、规划、解释、叙事。
2. **No contract = no field. No definition = no metric. No skill = no analysis.** agent 不能现场编统计，只能调用 registry 中已认证的 metric 与 skill。
3. **层是能力，agent 是工作流。** 不做"每层一个 agent"。能力通过 tools（MCP）暴露；agent 按要完成的工作（job-to-be-done）组织。
4. **三类 agent 严格分离：** build-time（起草 → 人审 → 固化）、run-time（回答用户）、ops（监控与事故）。
5. **授权永远是确定性的。** 策略在数据层执行（RLS + policy-as-code）；agent 以用户身份调用工具，不是授权点，也不能被 prompt 说服放宽。
6. **Governance 与 Observability / Evaluation 是横切 pillar，不是层。** 每一层都要接受这两个 pillar 的约束。
7. **Evidence 与 hypothesis 分开呈现；不对个人做自动决策。** 相关性不写成因果；行动建议永远交给人决定。
8. **每个输出可追溯：** `metric_id@version · snapshot · filters · skill@version · model@version · trace_id`。
9. **Synthetic values, real contracts.** schema、字段语义、实体关系、事件顺序来自真实 source contract；只有 who / when / which event / which valid value 是合成的。
10. **平台能力 > 展示面。** 网站只保留少数 case，但每一层至少留一个可点击的证据。
11. **人审点是产品功能。** mapping 审批、事故定性确认、metric 认证、行动决策等 human-in-the-loop 节点要显式设计，并在站点展示，而不是藏在后台。

---

## 2. 目标架构总览

```
┌────────────────────────────────────────────────────────────────────┐
│  L5  EXPERIENCE                                                     │
│      Case Studies · Metric Explorer · Analyst Chat (with trace)     │
│      Signal Briefs / Subscriptions · Trust Page · MCP Endpoint      │
├────────────────────────────────────────────────────────────────────┤
│  L4  AGENT RUNTIME                                                  │
│      Router (workflow / agent / multi-agent) · Orchestrator         │
│      Tool Registry (MCP) · Context Assembly · Memory                │
│      Critic / Verifier · Guardrails · Model Gateway · Trace Store   │
├────────────────────────────────────────────────────────────────────┤
│  L3  ANALYTICAL SKILLS & MODELS                                     │
│      Skill Registry (SKILL.md + scripts + evals)                    │
│      Statistical Model Library · Model Cards · Min-sample Rules     │
├────────────────────────────────────────────────────────────────────┤
│  L2  KNOWLEDGE & SEMANTIC                                           │
│      Ontology / Canonical Model · Metric Registry → Semantic Layer  │
│      Data Contracts & Catalog (join paths, freshness)               │
│      Glossary & Business Rules · Playbooks · External KBs           │
├────────────────────────────────────────────────────────────────────┤
│  L1  DATA FOUNDATION                                                │
│      Source Contracts · Business Event Simulator · Connectors       │
│      Bronze / Silver / Gold · Identity Crosswalk · Snapshots        │
└────────────────────────────────────────────────────────────────────┘
   ▲ Pillar A  GOVERNANCE & TRUST
   │   classification · policy engine · RLS · cell suppression ·
   │   purpose logging · Responsible People AI · audit
   ▲ Pillar B  OBSERVABILITY & EVALUATION
       lineage · freshness · DQ tests · agent traces ·
       golden-set evals · model monitoring
   —— 两个 pillar 横跨 L1–L5 ——
```

### 2.1 原五层设想 → 目标架构映射

| 原设想 | 目标架构位置 | 变化说明 |
|---|---|---|
| 1. API 数据层（内外部）+ pipeline quality agent | L1 Data Foundation + Pillar B（data observability）+ ops agent | pipeline quality 的主体是确定性 tests / freshness / lineage；agent 只做事故调查与定性 |
| 1. domain knowledge base + domain knowledge agent | L2 Knowledge & Semantic（glossary / business rules / playbooks） | 不需要独立 agent；作为 analyst agent 的检索上下文 |
| 1. API 接口 knowledge base（定义、join、刷新频率） | L2 Data Contracts & Catalog | 业界名称：data contract；必须机器可读 |
| 2. AI-ready metadata + interpreter agent + metadata quality agent | L2 Ontology + Semantic Layer；build-time Semantic Curator / Mapping Drafter；metadata tests 归 Pillar B | interpreter 是 build-time 起草者，人审后固化，不在查询路径上 |
| 3. 统计模型 / skill 库 + 历史表现 | L3 Skills & Models + Pillar B（model monitoring、skill evals） | 区分"分析有效性"与"agent 执行质量"两套指标 |
| 4. governance / 权限规则 + 权限 agent | Pillar A Governance & Trust（deterministic policy engine）+ Policy Explainer（只解释，不执行） | 权限不由 agent 决定 |
| 5. UI / dashboard + insights generator agent | L5 Experience + L4 Agent Runtime（新增）+ Analyst / Signal agents | 补上缺失的 runtime 层；insights 拆为 on-demand（Analyst）与 proactive（Signal） |

### 2.2 与通用 Enterprise Data Agent 架构的关系

业界通用的 enterprise data agent 架构通常分为：agentic interface（API / MCP / skills）、user interface、agent engine（workflow / agent / multi-agent）、admin console（connectors、semantic metadata、context、prompts、tools、model management、orchestration、permissions）、data / knowledge / model layers。其三个核心使命——把正确的数据放进 agent 上下文、让上下文足以理解业务含义、让 agent 掌握正确的分析框架——本质上就是 context engineering，本文档的 L2–L3 直接以这三条为设计目标。

People Analytics 版本需要额外补上通用架构没有的东西，这也是本站的差异化：

- People 数据特有的隐私与伦理规则（小单元抑制、敏感属性用途限制、个人层面不自动决策）
- 分析方法本身的有效性评估（不只是 agent 的 benchmark）
- 明确的 human-in-the-loop 决策边界
- 外部劳动力市场 / 技能 / 学习数据作为一等公民

---

## 3. Agent 分类

| Agent | 类型 | 触发 | 输入 / 工具 | 输出 | 人审点 | 站点展示 |
|---|---|---|---|---|---|---|
| Mapping Drafter | build-time | 新增或升级 source contract | source schema、样本、DocType / OpenAPI 文档、canonical model | source → canonical mapping YAML 草稿 + 每字段 provenance 分类 | mapping 必须人审后才 merge | Architecture 页：contract → mapping → canonical 链 |
| DQ Test Generator | build-time | mapping merge 后 | contract、mapping、历史分布 | 建议的 DQ tests（unique / not null / RI / temporal / business rule / volume） | 人审 | Trust 页：test 清单 |
| Semantic Curator | build-time | 新 metric、source 版本变化 | metric YAML、glossary、lineage | metric definition 草稿、glossary 条目、semantic drift 报告（source 升级导致定义失效） | metric owner 审批 | Metric Explorer |
| Data Ops Investigator | ops | freshness / volume / schema 异常或 test 失败 | source health、lineage、expected vs actual | 事故记录 + 定性（data issue vs business change）+ 影响面 + 建议阻断发布 | 定性由人确认后才解除阻断 | Case 2 |
| Analyst Agent | run-time | 用户提问 | semantic layer tools、skills、catalog、policy 上下文 | Answer Contract（见 4.4） | 建议行动由人决定 | Case 1 / 3 follow-up、Analyst Chat |
| Signal Agent | run-time（主动） | 定时 / 指标越阈 | certified metrics、skills（breakdown、cohort）、data health | Brief（observed / hypotheses / next questions / suggested actions） | 订阅者决定是否行动 | Signals 页、订阅 demo |
| Policy Explainer | run-time（非执行） | 访问被拒 / 结果被抑制 | policy decision log | 解释、访问申请 triage、审计摘要 | 审批仍由人 | 角色切换 demo |
| Critic / Verifier | run-time + eval | 每次 answer 生成后 | answer、semantic layer、policy 规则 | 校验：数字一致性、因果措辞、小单元、PII 泄露、引用完整 | — | Trust 页 scorecard |

规则：

- build-time agent 的产物默认 `status: draft`，人审后才进入 registry；草稿不进入 run-time 上下文。
- run-time agent 只能通过 Tool Registry 访问数据；不允许直连表，不允许 free-form SQL。
- ops agent 有权"建议阻断发布"，无权自行解除阻断。

---

## 4. 分层规格

### 4.1 L1 Data Foundation

**目标：** 在真实 source contract 约束下运行的、可重放的企业 HR / ATS / LMS 系统模拟，加上分层数据湖与 serving。

**组件**

| 组件 | 说明 | 状态 |
|---|---|---|
| Source Contract Repo | `frappe_hr`（Core HR / Org / Movement / Payroll / Performance / Internal Learning）、`greenhouse_v3`（Recruiting）、`microsoft_learn`、`onet`、`bls`；每个 source 固定 version / commit / schema | 已设计（Frappe HR v16.15.0 + ERPNext v16.0.0 DocType，Greenhouse Harvest v3 OpenAPI），未切流 |
| Data Contract 文件 | 每个 bronze object 一份，ODCS（Open Data Contract Standard）风格 YAML：owner、schema、主键 / 外键、PII class、刷新频率、freshness SLA、已知 quirks、版本。这是原设想中"API 接口 knowledge base"的机器可读形态 | 新增 |
| Business Event Simulator | 以业务事务为单位产出 contract-shaped payload；同一事务内的事件不可分别随机（Offer Accepted → Application Hired → Opening Filled → Candidate→Worker crosswalk → Employee Hire） | 需重构现有生成器 |
| Connectors → Bronze | 不可变原始 payload（DocType JSON / Harvest JSON / 官方文件） | O*NET / BLS / Learn 已符合；内部 HR / ATS 未 |
| Silver（canonical） | effective-dated、event + event_change；Recruiting 拆 Candidate / Application / application_stages；每字段有 provenance 标签（SOURCE_NATIVE / SOURCE_NESTED / CANONICAL_KEY / DERIVED / SYNTHETIC_EXTENSION / UNJUSTIFIED） | 79 / 338 字段 UNJUSTIFIED 待清理 |
| Gold | `people_fact_worker_monthly_snapshot`（worker × month-end，约 3M 行）、analytics marts；daily worker snapshot 只留 lake | 部分存在 |
| Identity Crosswalk | `people_identity_crosswalk`（canonical_person_id / canonical_worker_id ↔ source_system / source_object / source_id，effective dated）；禁止 name join | 已设计 |
| 存储分工 | Lake / Parquet（bronze、大历史）；Supabase / Postgres（serving + governance）；Hetzner（compute / orchestration） | 不变 |

**要建（顺序不变，见 PEOPLE_SOURCE_CONTRACT_FIRST.md §33）**

1. Source Contract Audit（每字段 provenance）
2. 固定 Frappe HR / Greenhouse 契约 → contract repo
3. source → canonical mapping YAML（No mapping = no canonical field）
4. identity crosswalk
5. 生成器重构为 business event simulator
6. 迁移现网数据（STOP：人审后才执行）
7. 新增：为每个 bronze object 写 data contract 文件（可由 Mapping Drafter agent 起草）

**站点证据：** Architecture 页展示一个对象（建议 `Employee Transfer` 或 `application_stages`）从 source contract → mapping YAML → canonical 字段 → 下游 metric 的完整链；每个字段带 provenance 标签；`time_in_stage` 显式标为 DERIVED（`exited_at − entered_at`）。

**不做：** 真实 Frappe / Greenhouse 部署；抓取非公开数据；在 Postgres 里放 daily worker snapshot。

---

### 4.2 L2 Knowledge & Semantic

**目标：** 让任何 agent（或任何人）只凭机器可读的产物就能回答："这个数字是什么意思、从哪来、能按什么切、多新、能和什么 join"。这一层是 agent 唯一的数据入口。

**三种上下文（对应 context engineering 的三个使命）**

| 类型 | 内容 | 存放 | 对应使命 |
|---|---|---|---|
| 结构化 | Ontology / canonical model、metric registry → semantic layer、data contracts & catalog | YAML（repo）+ `people_meta_*` / `people_metric*` 表 | 把正确的数据放进上下文 |
| 非结构化 | Glossary、business rules、（合成的）GlobalTech HR policy、分析 playbooks、外部知识（O*NET / ESCO / BLS / Learn） | markdown / YAML + 检索索引 | 让上下文足以理解业务含义 |
| 程序化 | Skills（见 L3） | `skills/` | 让 agent 掌握正确的分析框架 |

#### 4.2.1 Ontology / Canonical Model

实体（初版）：Person、Worker、Assignment、Position、Job、Org、Location、ManagerRelation、CompensationAssignment、PerformanceCycle、Requisition、Opening、Candidate、Application、ApplicationStageEvent、Interview、Scorecard、Offer、Hire、Recruiter、Skill、SkillTaxonomy（O*NET）、LearningResource（内部 + Microsoft Learn）、TrainingEvent、EngagementResponse。

每个实体一份 YAML：grain、keys、effective dating、attributes（含 PII class / sensitivity）、relationships、valid join paths、refresh cadence、source contract 引用。示例：

```yaml
entity: Application
grain: one row per candidate x requisition
keys:
  primary: application_id
  foreign: [candidate_id, requisition_id, recruiter_id]
effective_dating: applied_at .. coalesce(hired_at, rejected_at)
attributes:
  - {name: applied_at,          pii: none, sensitivity: internal,     provenance: SOURCE_NATIVE}
  - {name: source_id,           pii: none, sensitivity: internal,     provenance: SOURCE_NATIVE}
  - {name: rejection_reason_id, pii: none, sensitivity: confidential, provenance: SOURCE_NATIVE}
  - {name: time_in_process_days, pii: none, sensitivity: internal,    provenance: DERIVED}
relationships:
  - {to: Candidate,             type: many_to_one, join: candidate_id}
  - {to: Requisition,           type: many_to_one, join: requisition_id}
  - {to: ApplicationStageEvent, type: one_to_many, join: application_id}
  - {to: Offer,                 type: one_to_many, join: application_id}
valid_join_paths:
  - Application -> Candidate
  - Application -> Requisition -> Job / Org / Location / HiringManager / Recruiter
  - Application -> Offer -> Hire -> Worker (via people_identity_crosswalk)
refresh: daily
source_contract: greenhouse_v3.applications
```

#### 4.2.2 Metric Registry → Semantic Layer（metrics as code）

现有约 20 个 certified metrics 迁移为 YAML，每个 metric 一份；RPC（`people_get_metric*`）与 DQ tests 从 YAML 生成，YAML 是唯一事实来源。示例：

```yaml
metric_id: voluntary_attrition_rate
version: 2.0.0
status: certified            # certified | candidate | deprecated
owner: people_analytics
domain: retention
definition: >
  Voluntary terminations in the period divided by average month-end
  headcount in the period. Annualized = monthly rate x 12.
numerator: count(worker_event where event_type='termination' and reason_category='voluntary')
denominator: avg(headcount over month_end snapshots in period)
population: active workers
exclusions: [contingent, intern, acquisition_transfer_out]
time_logic: period = calendar month; trailing_12m available
grain: people_fact_worker_monthly_snapshot
allowed_dimensions: [org, location, level, tenure_band, job_family, manager_l2]
min_cell_size: 5
sensitivity: internal        # public | internal | confidential | restricted
business_rules: [BR-RET-001 voluntary_vs_involuntary, BR-WF-003 headcount_definition]
sources: [frappe_hr.Employee Separation, frappe_hr.Employee]
lineage: [people_silver_worker_event, people_fact_worker_monthly_snapshot, people_mart_retention_monthly]
tests: [denominator_positive, rate_between_0_1, period_complete]
sql: sql/voluntary_attrition_rate.sql
changelog:
  - {version: 2.0.0, date: 2026-09-01, change: "denominator moved to month-end snapshot avg"}
```

技术选型（由 owner 决定，见 §8）：自研 YAML → 生成 SQL / RPC（与现有 serving 最兼容）；或 dbt Semantic Layer / MetricFlow；或 Cube。可关注 Open Semantic Interchange（OSI）作为未来的语义模型交换格式。Cursor 在实施前核对各工具当前版本与许可。

#### 4.2.3 Data Contracts & Catalog

即原设想的"API 接口 knowledge base"。每个对象：字段与语义、主键 / 外键、合法 join path、刷新频率、freshness SLA、已知问题。机器可读，供 agent 判断"能不能把 X 和 Y join、数据够不够新"。

#### 4.2.4 Glossary & Business Rules

voluntary / involuntary / regrettable 的口径；headcount vs FTE；tenure bands；level bands；hire 的认定时点（offer accepted vs start date）；internal mobility 的定义；recruiting stage 的标准化。每条规则有 id、owner、version、生效日期，并被 metric YAML 引用。

#### 4.2.5 外部知识库

O*NET（skill / occupation taxonomy）、BLS（劳动力市场）、Microsoft Learn（外部学习资源）；可选 ESCO（欧洲技能 / 职业分类，免费）。所有外部内容标记 `trust: data_only`——只作数据，不作指令（防 prompt injection）。

**Build-time agents：** Mapping Drafter、Semantic Curator（见 §3）。

**现状：** metric registry 与 lineage 已在 serving 层；ontology、data contracts、glossary 尚未机器可读。

**站点证据：** Metric Explorer 页（只读）：选一个 metric，渲染其 YAML（定义、公式、population、exclusions、dimensions、min cell size、lineage、tests、version 历史）；一个小型 ontology 关系图（Candidate → Application → Requisition → Offer → Hire → Worker）。

---

### 4.3 L3 Analytical Skills & Models

**目标：** 把"正确的分析框架"变成版本化、可评估、可复用的代码；agent 只能选 skill，不能编统计。

#### 4.3.1 Skill Registry

采用 Agent Skills 风格的目录结构：

```
skills/
  cohort_survival/
    SKILL.md          # name, description(何时用), not_for(何时不用), inputs(引用 metric/entity),
                      # assumptions, min_sample, steps, pitfalls(如"只报告关联，不写因果"),
                      # output_schema, sensitivity(谁能跑), version
    run.py            # 或 run.sql；只读 semantic layer，不直连表
    evals/
      cases.yaml      # golden inputs -> expected outputs / tolerances
    CHANGELOG.md
```

首批 certified skills（8 个）：

| skill_id | 用途 | 关键约束 |
|---|---|---|
| metric_lookup | 取 certified metric 的值 / 趋势 | 必须带 definition 与 snapshot |
| trend_decomposition | 趋势拆分（季节、水平变化、异常点） | 先查 data health；事故期间显式标注 |
| segment_breakdown | 按维度切分 | 强制 min cell size 抑制 |
| cohort_survival | 留任曲线（Kaplan–Meier / Cox） | min_sample；输出置信区间 |
| attrition_driver_screen | 离职关联因素筛查 | 只报告关联强度；禁用因果词 |
| recruiting_funnel | 漏斗转化 | 基于 application_stages 事件 |
| stage_aging | 阶段停留时长 | `exited_at − entered_at`；不用预存 duration |
| data_incident_triage | 数据事故定性 | 输出 "data issue vs business change" + 影响面 |

后续：recruiter_load、compa_ratio_distribution、pay_equity_screen（restricted）、skill_gap、learning_recommendation、headcount_forecast、hm_responsiveness。

#### 4.3.2 Statistical Model Library

模型（初版）：attrition_risk（只输出聚合结果，站点不展示个人分数）、time_to_fill_forecast、engagement_driver、pay_equity_regression（restricted）。

每个模型一份 model card：purpose、training window、features（受保护属性不得作为特征，仅用于事后公平性审计）、performance（AUC / PR-AUC / MAE）、calibration、fairness metrics（按组、聚合）、drift monitors、retrain policy、known limits、approved uses。

#### 4.3.3 历史表现（原第 3 层"历史表现 / 稳定性 / 错误率"）

两套指标，分开存：

- 分析有效性：`people_model_run`（model_id、version、snapshot、performance、calibration、drift flags、backtest）
- 执行质量：`people_skill_eval`（skill_id、version、golden_case_id、pass / fail、error_type、latency）

低于阈值自动把 skill / model 标为 `degraded`，并在 agent 上下文中显示。

**站点证据：** Skill Registry 页（每个 skill：用途、约束、eval 通过率、最近一次 eval）；Case 3 增加 "How this analysis was computed" 面板（skill@version、输入 metric、min sample 检查结果）。

---

### 4.4 L4 Agent Runtime

**目标：** 把 `/api/people/ask` 从剧本匹配升级为有边界的 tool-using agent，并把平台能力以 MCP 暴露给外部 agent。

**组件**

| 组件 | 说明 |
|---|---|
| Router | 三档：Tier 1 workflow（识别为 certified metric 问句 → 直接 get_metric / trend，无 LLM 规划）；Tier 2 agent（"为什么 / 什么在驱动" → 规划 → breakdown + skills → 叙事）；Tier 3 multi-agent（跨域：TA + workforce + 外部市场，后期；agent 间可用 A2A） |
| Orchestrator | 计划 → 工具调用 → 证据收集 → Critic → 生成 Answer Contract |
| Tool Registry（MCP） | `people-mcp` server，包装现有 RPC 与 skills，带 scope |
| Context Assembly | 渐进式披露：默认只给紧凑 catalog（metric 名 + 一句定义），按需加载 metric YAML / skill / glossary；token 预算硬上限 |
| Memory | session；用户 profile（role、org scope——来自身份与 policy，绝不来自用户自述）；analysis-of-record（保存的 brief） |
| Critic / Verifier | 生成后校验：数字与工具结果一致、因果措辞门控、小单元抑制、PII 泄露、引用完整 |
| Guardrails | 输入分类（in-scope / out-of-scope / 个人层面请求 → 拒绝）；外部内容隔离（检索内容只作数据，不触发工具）；配额（沿用 `people_consume_ai_quota`） |
| Model Gateway | provider-agnostic；小模型做路由 / 分类，大模型做综合；每条 trace 记录 model + version |
| Trace Store | `people_agent_trace` / `people_agent_tool_call` |

**MCP tools（初版）**

```
metrics:   get_metric, get_metric_trend, get_metric_breakdown (auto-suppression),
           get_metric_definition, list_metrics
semantic:  list_entities, describe_entity, get_join_paths, get_glossary_term
lineage:   get_lineage
quality:   get_source_health, get_quality_tests, get_quality_incidents, get_serving_snapshot
skills:    list_skills, describe_skill, run_skill
policy:    explain_access_decision   (只解释，不授权)
```

Scopes：`metrics:read`、`semantic:read`、`lineage:read`、`quality:read`、`skills:run`。外部访客使用只读 demo token（aggregate only，n ≥ 5）。

**Answer Contract（所有 run-time agent 输出必须符合）**

```json
{
  "question": "Why is Engineering voluntary attrition increasing?",
  "route": "tier2_agent",
  "as_of": "2026-08-31",
  "serving_snapshot": "current",
  "plan": ["check data health", "metric trend", "segment breakdown", "cohort_survival", "attrition_driver_screen"],
  "tool_calls": [{"tool": "get_metric_trend", "args": {"metric_id": "voluntary_attrition_rate", "filters": {"org": "Engineering"}}, "trace_ref": "tc_01"}],
  "evidence": [
    {"id": "ev_01", "metric_id": "voluntary_attrition_rate", "version": "2.0.0",
     "filters": {"org": "Engineering"}, "period": "2026-08", "value": 0.142, "health": "healthy"}
  ],
  "observed": ["Engineering voluntary attrition rose from 9.8% to 14.2% (trailing 12m) over 6 months."],
  "hypotheses": [
    {"statement": "Increase concentrated in 1–3 year tenure band in APAC",
     "supporting_evidence": ["ev_02", "ev_03"],
     "would_confirm": "cohort_survival by tenure_band x location; external market comparison"}
  ],
  "next_questions": ["Is the increase regrettable attrition or all voluntary?"],
  "suggested_actions": [{"action": "Retention review for APAC 1–3y engineers", "owner_role": "hrbp", "decision_required": true}],
  "suppressed_cells": 2,
  "policy_decisions": ["breakdown by manager_l2 suppressed: n<5 in 2 cells"],
  "confidence": "medium",
  "skills_used": ["cohort_survival@1.2.0", "attrition_driver_screen@1.0.1"],
  "model": "provider/model@version",
  "trace_id": "tr_..."
}
```

**现状：** RPC 工具已存在；ask 为剧本匹配；无 trace、无 critic、无 MCP。

**站点证据：** Analyst Chat（可展开 trace：plan → tool calls → evidence）；"Connect via MCP" 页（配置示例 + 可用 tools + scope 说明）。

---

### 4.5 L5 Experience

**保留：** 单栏 case-study 站点；三个旗舰 case；不做通用 dashboard；`/lab` 继续 noindex。

**新增页面（每层一个证据）**

| 页面 | 证明的层 |
|---|---|
| Architecture：contract → mapping → canonical → metric 链 | L1 |
| Metric Explorer + 小型 ontology 图 | L2 |
| Skill Registry（含 eval scorecard） | L3 |
| Analyst Chat（带 trace）+ Connect via MCP | L4 |
| Signals（自动 brief + 订阅 demo） | L5 / Signal Agent |
| Governance（角色切换：同一问题，不同角色看到不同结果） | Pillar A |
| Trust（最新 eval scorecard + data health） | Pillar B |

**Case 路线：** Case 1–3 保留；治理 demo 与 signal demo 作为 case 内的交互，不新增 case；Case 4 "Why is hiring slowing down?" 在 TA source model 切流后再做。

**开源工具：** 公开站保持 Next.js，不引入第二个 BI 产品。若需要 BI-as-code 页面（SQL + markdown），可评估 Evidence；Superset / Metabase 只考虑用于 `/lab`。

**Perspective 页：** 增加 "Human-AI Collaboration in People Analytics" 一节，讲清人审点的设计（mapping 审批、事故定性、行动决策）。

---

### 4.6 Pillar A — Governance & Trust

**目标：** People 数据的策略是代码，且在数据层执行；agent 不能绕过。

#### 4.6.1 分类

- 数据层级：public / internal / confidential / restricted
- 属性标签（在 ontology attribute 上）：`pii`、`sensitive_pii`（gender、ethnicity、age、disability、health / leave）、`comp`、`performance`、`demographic`
- 粒度：individual / aggregate

#### 4.6.2 访问模型

roles × scope × sensitivity × grain。Demo 角色（合成身份）：

| role | scope | 可见 | 不可见 |
|---|---|---|---|
| external_viewer（站点访客） | 全公司 aggregate | certified metrics，n ≥ 5 | 个人、comp / performance 明细、demographic 切分 |
| leader | 自己 org 子树 | aggregate + band 级 comp | 其他 org、个人 |
| hrbp | 负责的 org 子树 | aggregate + band 级 comp + 受限 skills | 其他 org |
| people_analyst | 全公司 aggregate | 全部 certified skills，含 pay_equity_screen | 个人层面输出 |

执行：Postgres RLS（按 role / org scope）+ policy 表或 policy-as-code（OPA / Cedar，见 §8）；agent 以用户 JWT 调用 RPC；org scope 来自身份，不来自对话。

#### 4.6.3 聚合与抑制规则

- min cell size 默认 5（可配置，写在 metric YAML）
- 补充抑制：当某单元被抑制但可由总计反推时，一并抑制
- 差分防护：记录会话内查询，检测"仅差一个 filter 值"的重叠查询（如 "Org X" 与 "Org X 排除 Location Y"），命中则抑制或拒绝
- 个人层面输出只允许在 authorized role + 明确 purpose 下，且站点公开版永不提供

#### 4.6.4 用途限制与审计

每次工具调用记录：user、role、purpose tag、metric / skill、filters、是否抑制、trace_id → `people_access_log`；保留期策略；被拒 / 被抑制时由 Policy Explainer 给出解释。

#### 4.6.5 Responsible People AI（设计约束，非法律意见；适用性由法务确认）

- 不对个人做自动决策；模型输出只用于聚合洞察（GDPR Art. 22 精神）
- 雇佣 / 员工管理类 AI 在 EU AI Act 中属高风险类别（Annex III）→ 文档化、可追溯、人类监督、bias 审计作为默认设计
- 招聘相关自动化工具的 bias audit（如 NYC Local Law 144 的要求）→ model card 中的 fairness 部分
- 薪酬相关分析（pay_equity_screen）restricted；EU Pay Transparency Directive 落地后此类指标的口径需版本化
- 受保护属性不作为模型特征，仅用于事后公平性审计
- 所有叙事区分 observed evidence / possible explanations；禁用因果词，除非 skill 明确支持因果推断
- 外部内容（职位抓取、文档）视为不可信输入，永不作为指令

**站点证据：** Governance 页 + case 内角色切换（同一问题：external_viewer 看到抑制后的 breakdown，people_analyst 看到完整 breakdown，并显示 Policy Explainer 的解释）。

---

### 4.7 Pillar B — Observability & Evaluation

#### 4.7.1 数据可观测性（已有 + 补充）

已有：freshness、DQ tests（约 30）、source health、lineage、incident（APAC 回放）。补充：schema drift 检测（对照 data contract）、volume anomaly、每个 metric 的 health 状态由上游 tests 自动推导。

#### 4.7.2 Agent 可观测性

每次运行一条 trace：question、route tier、plan、tool calls（参数、耗时、结果摘要）、model + version、tokens、cost、critic 结果、最终 answer。建议遵循 OpenTelemetry GenAI 语义约定；可选 Langfuse / Phoenix 等开源 trace 工具（Cursor 核对当前版本）。

#### 4.7.3 评估（golden set）

初版 50 条，存 `evals/golden/*.yaml`：

- 20 条事实型（期望 metric 调用 + 精确值 / 容差）
- 15 条分析型（期望 skill 选择、evidence 结构、无因果词）
- 10 条策略型（应拒绝 / 应抑制 / 应降级角色）
- 5 条对抗型（外部文档注入、差分攻击、要求个人数据）

Scorecard：metric 准确率、tool-call 正确率、拒答正确率、因果措辞违规率、抑制违规率、latency p50 / p95、cost。每晚跑；metric YAML 或 skill 版本变化触发回归。

#### 4.7.4 模型监控

drift、calibration、backtest → `people_model_run`；低于阈值自动标 `degraded`。

**站点证据：** Trust 页：最新 eval scorecard、data health、被阻断的发布记录。

---

## 5. 仓库结构与数据库对象

```
data-platform/
  people_source_contracts/          # 已设计：frappe_hr / greenhouse_v3 / microsoft_learn / onet / bls
  contracts/                        # 新增：每个 bronze object 一份 data contract（ODCS 风格）
  semantic/
    ontology/<entity>.yaml
    metrics/<metric_id>.yaml
    glossary.yaml
    business_rules.yaml
    mappings/<source>/<object>.yaml # source -> canonical（已设计）
  skills/<skill_id>/{SKILL.md, run.py|run.sql, evals/cases.yaml, CHANGELOG.md}
  models/<model_id>/{model_card.md, train.py, eval/}
  policy/{classification.yaml, roles.yaml, rules.yaml}
  evals/{golden/*.yaml, reports/}
  mcp/people-mcp/
  simulator/                        # business event simulator
docs/
  PEOPLE_SOURCE_CONTRACT_FIRST.md
  PEOPLE_AI_AGENT_ARCHITECTURE.md   # 本文档
```

| 层 / pillar | 新对象（全部 `people_*`，serving 库） |
|---|---|
| L2 | people_meta_entity, people_meta_attribute, people_meta_relationship, people_meta_join_path, people_contract, people_metric（v2，版本化）, people_metric_version, people_glossary |
| L3 | people_skill_registry, people_skill_eval, people_model_registry, people_model_run |
| L4 | people_agent_trace, people_agent_tool_call, people_signal, people_brief |
| Pillar A | people_policy_role, people_policy_rule, people_access_log, people_suppression_log |
| Pillar B | people_eval_case, people_eval_run, people_eval_result（现有 quality tests / incidents / freshness / lineage 保留） |

RPC 生成规则：`people_get_metric*` 由 metric YAML 生成；breakdown RPC 从 YAML 读取 `min_cell_size` 并执行抑制；任何手写 RPC 需在 YAML 中登记。

---

## 6. 实施顺序（保留 §33 优先级）

| Phase | 内容 | Definition of Done | 站点证据 |
|---|---|---|---|
| 0（进行中） | Source-contract 切流（L1） | silver / gold 无 UNJUSTIFIED 字段（或已归类为 SYNTHETIC_EXTENSION 并有理由）；crosswalk 上线；simulator 产出 contract-shaped payload；destructive migration 前已人审 | Architecture 链路页 |
| 1 | Semantic layer v2（L2） | 20 个 metric 迁移为 YAML；RPC / tests 由 YAML 生成；ontology YAML 覆盖核心实体；每个 bronze object 有 data contract | Metric Explorer |
| 2 | Skills & models（L3） | 8 个 certified skills 各带 evals；model cards；registry 表 | Skill Registry；Case 3 "how computed" |
| 3 | Governance（Pillar A） | ontology 属性有分类标签；policy + RLS 生效；breakdown 抑制；access log | Governance 页；角色切换 |
| 4 | Agent runtime（L4）+ Evaluation（Pillar B） | people-mcp 上线；Analyst Agent 替换剧本 ask；trace + critic；golden set 50 条每晚跑 | Analyst Chat；Connect via MCP；Trust 页 |
| 5 | Signals + TA | Signal Agent 与 brief；订阅 demo；Case 4（TA source model 切流后） | Signals 页；Case 4 |

Phase 0 期间允许并行的唯一 L2 工作：定义 metric YAML schema（不新增 metric）。

---

## 7. Non-goals

- 不做通用 NL-to-SQL；不允许 agent free-form 查库
- 不做通用 dashboard；不把 200–300 个 metric 做成 KPI 墙
- 不在公开站暴露任何个人层面数据（合成的也不）
- 不部署真实 Frappe / Greenhouse；不抓取非公开数据
- 不先造 300 个 metric；先完成 canonical source model
- 不在 Phase 0 完成前改首页叙事、加 JSearch、加 mart、加 AI tools
- 不引用任何雇主内部材料

---

## 8. 实施前需 owner 决策的问题

1. Semantic layer 技术路线：自研 YAML → 生成 RPC（推荐，最兼容现有 serving）vs dbt MetricFlow vs Cube
2. Policy 执行：SQL policy 表 + RLS（推荐，简单）vs OPA / Cedar
3. `people-mcp` 部署位置（Vercel serverless vs Hetzner）与外部访客 token 模型
4. min cell size 默认值（建议 5）与 demo 角色集合
5. Skill 格式是否完全兼容 Agent Skills 规范（便于 Claude / Cursor 直接加载）
6. attrition_risk 模型是否上公开站（建议只展示 model card + 聚合校准曲线）
7. 是否引入 ESCO 作为 O*NET 之外的技能分类（面向全球组织的叙事）

---

## 9. 给 Cursor 的执行约束

- 先读 `docs/PEOPLE_SOURCE_CONTRACT_FIRST.md`，再读本文档；冲突时以 §33 的顺序为准
- 所有新对象 `people_*`；不动 QuantReview 对象；不写生产库
- destructive migration、RLS 启用、路由删除 前 STOP 并列出影响面
- 每个 Phase 拆成可 review 的小 PR；每个 PR 说明对应的层 / pillar 与站点证据
- 现有公开路由保持可用；改名必须加 redirect；`not a real company` 标注不得移除
- 任何 agent 产物（mapping、metric 定义、DQ tests）默认 `status: draft`，人审后才 `certified`
- 站点与文档不出现雇主内部项目名或数字

---

## 10. 一句话项目原则 v2

> PeopleAnalyticsAI emulates real enterprise HR systems through authoritative source contracts, maps them explicitly into a governed canonical People Data Model and semantic layer, encodes analytical methods as versioned and evaluated skills, enforces People-data policy deterministically at the data layer, and only then lets agents — build-time, run-time, and ops — plan, interpret, and narrate. Every number is traceable, every answer separates evidence from hypothesis, every sensitive decision keeps a human in the loop, and the website exposes a few strong case studies plus one clickable proof per layer.
