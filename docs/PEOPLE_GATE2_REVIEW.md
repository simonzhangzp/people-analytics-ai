# GATE 2 review packet

**Stop here.** 步骤 5 两段与步骤 **6a（对齐与实测）** 已完成。**仍不进入 6b publish**（四段灌数、meta/lineage RPC、parquet vs RPC parity）。全量报告：`docs/PEOPLE_REHEARSAL_1P00.md`。对账：`docs/PEOPLE_6A_RECONCILIATION.md`。

GATE 1 已关闭。GATE 2 **有条件通过**：规则 v1 已锁定；5% gold 含域覆盖 / 漏斗交叉 / Case 3–4 信号；独立项目 **019 bootstrap + 角色测试已通过**。

## A. 独立项目 PeopleAnalyticsAI.net

| 项 | 值 |
| --- | --- |
| ref | `zapmigfrtnwnkmezjefx` |
| compute / disk | micro / 8,589,934,592 bytes |
| 拒绝 | `fyvivwgyisrtmehzjqlv`（生产）、`kgxbomcmgkwlmzyevqjw`（staging） |
| 连接 | Hetzner session pooler **5432**；Vercel transaction pooler **6543**；`sslmode=require` |
| 角色 | `people_app` NOLOGIN（步骤 7 再开）；`people_definer` NOLOGIN + CREATE；`people_publisher` LOGIN + `people_v2` USAGE/CREATE |
| Data API | `019` 撤销 anon / authenticated / service_role 对 `people_v2`；v2 应用不使用这些 key |
| 热窗口 | application / stage / interview / scorecard / **dim_candidate** 一律 12 个月 |
| publish | 四段 dims/xw → facts/events → snapshots → marts；每段核对 `pg_database_size`；超预算停。代码：`serving/publish_people_v2.py`（dry-run；**未灌数**） |
| disk gate | `occupied + supabase_measured_people_v2_bytes × 1.3 ≤ quota − 2 GiB`；quota 缺失即拒绝。measured = 5% `pg_total_relation_size` × 20（步骤 6a-3），**不是** parquet × 2.8 |
| fallback | A7：全量 as-designed 估算 ≤ 4.5 GiB 则 restricted 按原设计进 Postgres；否则 lake-only + 已抑制 mart。**两种情况 mart 都必须存在** |

常量：`data-platform/people_refs.py`。ops：`simulator/scenario/baseline.yaml`。

### A1 apply_one / role test（本机输出，无密钥）

Direct `db.{ref}.supabase.co` 失败（`OperationalError`），回退 session pooler 5432 成功。`public` 体积 0，确认连的是空的新项目而非 staging。磁盘闸（019 bootstrap 当时）：occupied ≈ 110 MB + expected 4 GiB。步骤 5 第二段准入改用 6 GiB 高端后失败，走 A7，闸门未降低。`PEOPLE_PUBLISHER_PASSWORD` 已由 owner 写入 EdgeAI `.env` 并在库内 `ALTER ROLE`；本包不写入值；**步骤 6 publish 才使用**。

```text
python apply_one.py 019_people_v2_bootstrap.sql
# direct_connect_failed OperationalError
# connected_as postgres
# public_schema_bytes 0
# people_v2_schema_bytes 0
# disk_quota_bytes 8589934592
# occupied_bytes 109567137
# expected_backfill_delta_bytes 4294967296
# projected_bytes 4404534433 allowed_bytes 6442450944
# applied 019_people_v2_bootstrap.sql
# people_publisher_password_unset

python test_people_v2_roles.py
# people_app login False usage True create False
# people_definer login False usage True create True
# people_publisher login True usage True create True
# people_app_public_create False
# people_publisher_public_create False
# people_v2_tables 0
# anon / authenticated / service_role people_v2_usage False
# legacy_public_mart_absent
# ok
```

本地护栏测试（不连库）：

```text
python -m unittest discover -s people_ingestion -p test_people_refs.py
python -m unittest discover -s serving -p test_apply_fail_closed.py
# 6 tests OK
```

`apply.py` 主流程（000–018）对本项目 **fail-closed**。

## B. 5% gold（lognormal 重跑，seed 20260301）

报告：`docs/PEOPLE_REHEARSAL_0P05.md`。全量：`docs/PEOPLE_REHEARSAL_1P00.md`。Simulator tests：含 backfill owner 闸、Friday extract、TTF p90/p50。

| 项 | 值 |
| --- | ---: |
| 期末 certified | **2501**（AMER 1130 / EMEA 660 / APAC 711） |
| 累计 spells | 4278 |
| hires = accepted | 2478 = 2478 |
| openings / cancel_rate | 2753 / **0.0999** |
| applications | 355,505 |
| time-to-fill p50/p90 | 32.0 / 81.3（p90/p50 = **2.5406**） |
| roll-forward | 59 个月 residual **0** |
| Case 2 | 隔离（Friday full；control_total 含 Left） |

### 漏斗：source × job_family（apps / openings = apps_per_opening）

| Family | inbound | referral | sourced | internal |
| --- | --- | --- | --- | --- |
| Engineering | 124786/970=128.6 | 13997/969=14.4 | 20078/970=20.7 | 8252/957=8.6 |
| Sales | 39692/555=71.5 | 4732/555=8.5 | 6322/553=11.4 | 2731/534=5.1 |
| Exec | 1420/91=15.6 | 226/90=2.5 | 220/78=2.8 | 89/51=1.7 |
| Other | 103483/1190=87.0 | 12105/1190=10.2 | 16485/1189=13.9 | 7020/1164=6.0 |

Source mix inbound **74.49%** / sourced 11.92% / referral 8.59% / internal 5.00%。Review→Screen：inbound **10.16%**、sourced **60.1%**、referral 45.2%、internal 44.8%。Inbound 5 日拒 **64.97%**。

### 域覆盖

comp SSA 16152，grade p50 compa 0.98；performance appraisal 9935（2/3/4/5 → 409/4173/4142/1211）；mobility 年化 8.59%/6.36%/5.09%；learning 3600、人均 6.52 小时；skills 人均 6.37、Eng×Kubernetes gap 0.41；engagement 10 波、response 0.70–0.84。

### Case 3 / 4（切片 vs 对照）

- compa 中位数 **0.88**（n=91）vs **0.98**（n=2417）
- manager change / worker **0.1538** vs **0.0364**
- Sales Onsite scorecard 延迟 **11.08** vs **1.08** 天；面试排期 **8.08** vs **0.08** 天

只埋相关性，不写因果。

## BR 签核

`people_business_rules.yaml`：`version: 1`，`status: certified`，`lock: v1`，`effective_from: 2026-09-02`。#1–#6 全部按当前写入确认。走读：`docs/PEOPLE_BUSINESS_RULES_WALKTHROUGH.md`。数据集页已去掉 “(5% rehearsal ended 2,495 certified)”；文案含 “updated daily by the simulator; certified at month-end”。

## What was not done

- **无 publish**、无 Postgres Silver/Gold DDL（步骤 6）
- `people_get_metric_sandbox` 未实现（Phase 4）
- 无 live 站点改动（`.env.local` / Vercel `NEXT_PUBLIC_SUPABASE_*` 仍指向 v1 staging）
- QuantReview 生产与 staging 空 `people_v2` 未触碰
