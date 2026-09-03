# Business rules 走读（GATE 2）

取值以 `data-platform/people_business_rules.yaml` 为准。**v1 已锁定**（`status: certified`，`effective_from: 2026-09-02`）。每条有 `kind: parametric | structural` 与机器可读 `params`。metric YAML（`data-platform/people_metrics/*.yml`）只引用 rule id / param key，不复述规则。

- **parametric**：将来 `people_get_metric_sandbox`（Phase 4）可会话级重算；仅 snapshot、标注 not certified、抑制规则与 certified 相同。
- **structural**：只走版本化治理重算。

| id | kind | 规则 | 取值（params） | 被谁使用 |
| --- | --- | --- | --- | --- |
| BR-RET-001 | parametric | `termination_category` ← E6 映射 `reason_for_leaving`。未映射 = `other`。 | `voluntary` / `involuntary` / `other`。Resignation Better opportunity / Personal → voluntary；Termination Performance / Restructuring → involuntary；**Retirement → other（v1）**；Death → other；**End of contract → other（v1）**。 | `people_dim_worker.termination_category`；workforce mart vol/invol；`voluntary_attrition.yml`；T5 |
| BR-RET-002 | parametric | 遗憾离职。 | 量表 **0–5 float**；阈值 **4.0**；**无考核 → 不判 regrettable（v1）**。 | `regrettable_attrition.yml`；snap is_regrettable |
| BR-WF-001 | parametric | Certified headcount = f(status, Employment Type) × spell。 | **Status（v1）：** include Active/Suspended；exclude Inactive/Left。**Type（v1）：** certified Full-time/Part-time/Probation；separate Intern/Apprentice/Contract。**Regular 已去掉**（master 可留词条，`in_certified_headcount: false`；engine 发 Full-time）。Spell：hire ≤ as_of 且 term 空或 > as_of。 | `headcount.yml`；gold `is_certified` |
| BR-WF-004 | parametric | 司龄分箱。 | `<1y` / `1–3y` / `3–5y` / `5–10y` / `10y+`（完整月边界 0/12/36/60/120）。 | tenure 切片；Case 3 0–3y = `<1y`+`1–3y` |
| BR-TA-001 | parametric | canonical_stage 词元。 | Review \| Screen \| Onsite \| Offer；未匹配失败质量测试。 | dim_stage；T11 |
| BR-TA-003 | structural | 申请时间。 | `applied_at` ← `created_at`。 | fact_application |
| BR-TA-004 | parametric | 申请状态。 | in_process→active；rejected；hired；converted→active。 | fact_application.status |
| BR-TA-006 | parametric | opening 状态。 | open=true → open，否则 closed。 | dim_requisition |
| BR-TA-007 | parametric | offer 状态。 | Created→unresolved；Accepted→accepted；Rejected→rejected；Deprecated→deprecated。 | fact_offer；`offer_acceptance.yml`；hires==accepted |
| BR-DQ-001 | structural | 可提交文档过滤。 | docstatus=1 进 silver；0 忽略；2 reversal。 | Frappe mappings |
| BR-DQ-003 | structural | Full 抽取缺席 ≠ 删除。 | volume_ratio 0.99；连续两次 full 缺席。**无 extract filter**。Employee **仅每周五 full**（含 Left，`control_total` = 全部文档）；其余日 **incremental**（`modified` watermark）。在职数为派生（BR-WF-001）。缺席 = 文档消失，不是 Left。replay：`value_bad` = 收到行中 status=Active 的 naive 计数；`value_expected` = 上一 certified headcount。 | Employee ODCS；08-14 隔离 |

## BR 签核（2026-09-02，锁定 v1）

| # | 议题 | 写入 | 状态 |
| --- | --- | --- | --- |
| 1 | BR-WF-001 status | include Active/Suspended；exclude Inactive/Left | **certified** |
| 2 | BR-WF-001 employment type | certified Full-time/Part-time/Probation；Intern/Apprentice/Contract 单列 | **certified** |
| 3 | 是否去掉 Regular | 是。master 保留词条但 `in_certified_headcount: false`；engine 默认 Full-time | **certified** |
| 4 | BR-RET-001 Retirement | `other` | **certified** |
| 5 | BR-RET-001 End of contract | `other` | **certified** |
| 6 | BR-RET-002 无考核 | `not_regrettable` | **certified** |

校准：baseline 自愿年化带 [0.10, 0.14]，JOLTS `JTS000000000000000QUR`。hazard 网格为参数，见 baseline `hazard_voluntary_annual`。招聘漏斗校准见 `baseline.yaml` `recruiting.calibration`（Greenhouse 2023、Ashby 2024、Jobvite 2023、SHRM TA benchmarking）。
