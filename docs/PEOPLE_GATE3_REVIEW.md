# GATE 3 包（步骤 9 已切流）

serving 仅 PeopleAnalyticsAI.net（`zapmigfrtnwnkmezjefx`）。生产：https://peopleanalyticsai.net 。staging v1 保留 30 天。

对照表：`data-platform/simulator/fixtures/rehearsal_1p00/gate3_page_map.json`。

## 切流

Vercel Production 已写入 `PEOPLE_DB_URL`（secret）、`PEOPLE_SERVING_REF=zapmigfrtnwnkmezjefx`、`NEXT_PUBLIC_BUILDER_LINKEDIN=https://www.linkedin.com/in/simonzp`。当前 alias：`dpl_BBGFSfGiP7FWvaGznZcaPqC2Vhhb`（2026-09-04 19:38 ET）。回滚 = 删除 serving env 再部署。观察 24 小时。G3-1 streak 继续累计到连续 3 天。

## 审核三项

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 1. Case 页数字与 parity | **达标** | 公司级 Headcount **49823**、voluntary_attrition_rate **0.13956249086013645**（页上 14.0%）。 |
| 2. 角色切换改变所见结果 | **达标** | 抑制 44/42/34/30。头条按可见格地点加权（四身份均为 APAC-SIN）。列表按 attrition 降序；分析师第一行是 EMEA-LON n=6。 |
| 3. 每日巡检 | **改 Vercel Cron** | Serving healthcheck = `GET /api/cron/people-healthcheck`（`vercel.json` `0 10 * * *` UTC）。streak 由 `people_serving_run`（kind/run_date/ok）计算。Hetzner 不再声明 daily job。 |

Vercel Cron 频率（官方 [Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)）：Hobby 每天最多 1 次、整点精度 ±59 分钟；Pro/Enterprise 最短间隔 1 分钟。本 job 是每天一次，Hobby 与 Pro 都允许。`CRON_SECRET` 已写入 Production；Vercel 调度会带 `Authorization: Bearer $CRON_SECRET`。Dataset 文案在连续 3 个 UTC 日 `ok=true` 之前只写 frozen as-of，不写 daily job。

## V1 线上定位（2026-09-04）

`npx vercel inspect peopleanalyticsai.net`：自定义域 alias 已是 `dpl_AgqsQfrF1qZZT1jsXRB4QUMEupVV`，不是上一版 `dpl_GrAfnjE...`。

修复前抓取若仍见 50,010 / Daily / 77.4% / Phase 4 / Formulator，**不是 alias 指错**。当时 `curl -I https://peopleanalyticsai.net/` 已是：

- `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`
- `X-Vercel-Cache: MISS`
- 页面 `export const dynamic = "force-dynamic"`（现加 `revalidate = 0` 与显式 no-store headers）

结论：自定义域边缘未缓存旧 HTML；用户侧抓取/浏览器/中间层缓存。

本轮已 `npx vercel cache purge --type cdn --yes`。复核（`curl -I` + `Cache-Control: no-cache`，部署 `dpl_BBGFSfGiP7FWvaGznZcaPqC2Vhhb`）：

| URL | Cache-Control | X-Vercel-Cache | Age | 正文 |
| --- | --- | --- | --- | --- |
| `/` | private, no-cache, no-store, max-age=0, must-revalidate | MISS | 0 | 49,823；质量测试 **74**；无 50,010 / Daily |
| `/enterprise-demo/attrition` | 同上 | MISS | 0 | trailing-12m；as-of month n；无 77.4% / Phase 4 / Formulator |
| `/enterprise-demo/trust` | 同上 | MISS | 0 | 49,823；74 tests；bronze/silver/gold 分组 |
| `/about` | 同上 | MISS | 0 | linkedin.com/in/simonzp；无 PDF / GitHub / mailto |
| `/simon-zhang-resume.pdf` | — | — | — | **404** |

构建路由表：`/`、`/about`、`/dataset`、`/enterprise-demo*` 均为 `ƒ`（dynamic），不是 `○` static。

## V2 Quality registry

`people_v2.people_quality_test` 已从 9 行写成**实际执行目录**（catalog YAML + 21 个 `metric_range_{metric_id}`），**74** 行，按层：bronze 3 / silver 35 / gold 36。全部 `last_status` 已写。首页 `count(*)` 与 Case 1 列表同源；Case 1 按 bronze / silver / gold 分组。没有把 30 写回代码。

## V4 权限回归（OWNER = people_publisher 之后）

表 owner 会绕过 RLS，因此 **77** 张 `people_v2.people_*` 表全部 `ENABLE` + **`FORCE ROW LEVEL SECURITY`**（`unforced = 0`）。publisher / definer 走 `people_publisher_all` / `people_definer_all`（`using (true)`），ETL 仍可写。

| 检查 | 结果 |
| --- | --- |
| 角色 × 21 metric 矩阵 | 4 身份 × 21 = **84** 格全部 `ok`，`failed []`。`role_metric_matrix.json` |
| people_app 负向 SELECT | **29** 张 deny 表全部 permission denied：person_grain 11、restricted 10、governance 2（`people_access_log`、`people_contract`）+ 其余 deny。deny 表 **FORCE = true**，`force_missing []`。`gate3_people_app_negative.json` |
| FORCE RLS 复核 | `verify_errors []`，`deny_unforced []`。`gate3_force_rls.json` |

## V3 / V5（随本轮部署上线）

- About：公开站不再托管简历 PDF；未设置 `NEXT_PUBLIC_BUILDER_EMAIL` 时不渲染邮箱；LinkedIn 为 `https://www.linkedin.com/in/simonzp`（Production env `NEXT_PUBLIC_BUILDER_LINKEDIN`）。
- Case 3：费率 trailing-12m；抑制分母仍为 **as-of 月 n**（保持 44/42/34/30），页面写明不是 t12m 平均人数。

## Architecture

公开页已改为中性表述，不出现 Hetzner / QuantReview / 共享 schema。

## 切流后下一步

V1–V4 线上复核已通过。Phase 4 第一段实现：`docs/PEOPLE_PHASE4_AGENT_MCP.md`、`docs/PEOPLE_AI_AGENT_ARCHITECTURE.md`、`docs/PEOPLE_PHASE4_HANDOFF.md`。
