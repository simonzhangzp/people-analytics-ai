# Phase 4 交回包（Analyst Agent + people-mcp）

上位架构：`docs/PEOPLE_AI_AGENT_ARCHITECTURE.md`。执行设计：`docs/PEOPLE_PHASE4_AGENT_MCP.md`。

## 拍板三点

1. Registry **15** 个工具，含 `get_skill_coverage`。
2. `/connect` 展示可复制 `NEXT_PUBLIC_MCP_DEMO_TOKEN`，文案 **public demo token · aggregate only · min_cell 50**。
3. Tier 2 允许 1 次 DeepSeek；失败/超限静默骨架。LLM 只能选 registry 工具或改写 hypotheses；**不得**写 observed 数字/headline。垃圾 stub 测试：observed 逐字不变，critic ok。

## R1 限额与账本

表 `people_llm_budget` / `people_llm_call` 已打到 zapmig，FORCE RLS（现 **81** 表，unforced 0）。

Owner 查看（postgres / Table Editor / `people_publisher`）：

```sql
select * from people_v2.people_llm_budget order by budget_key;
select * from people_v2.people_llm_usage_daily order by day desc limit 14;
select * from people_v2.people_llm_usage_30d;
```

改 `limit_value` 即生效。账本 INSERT 失败 → `allowed:false`，不调 LLM。

`people_consume_ai_quota` **保留**（QuantReview 登录用户日配额）。`people_try_consume_llm` 是站点 IP + `site_rolling_30d` 硬顶。Lab `/api/workbench/ai` 与 `/api/strategy/analyze` 先走站点账本。

实测（`test_llm_budget.py`）：同一 ip_hash 第 4 次 `blocked_by=per_ip_daily`；`site_rolling_30d=0` 时全员回落；并发 10 次同 IP → **3 allowed / 7 blocked**，无超发。

## 延迟

Tier 1 `people_get_metric_for` Engineering Headcount（people_app / 6543，热路径 n=10）：**p95 = 93 ms**（目标 < 500 ms）。`data-platform/simulator/fixtures/rehearsal_1p00/phase4_tier1_latency.json`。

## 截图与样例

| 项 | 路径 |
| --- | --- |
| /connect | `docs/phase4/connect.png` |
| DeepSeek 失败静默骨架 | `docs/phase4/degrade-llm-silent.png` |
| RPC 错误态 | `docs/phase4/degrade-rpc.png` |
| Critic withheld | `docs/phase4/degrade-critic.png` |
| Tier 2 骨架 trace | `docs/phase4/trace-tier2-skeleton.json` |
| Tier 2 LLM 垃圾 stub | `docs/phase4/trace-tier2-llm-stub.json` |
| R2 注入 | `docs/phase4/adversarial-r2.json` |
| MCP handshake | `docs/phase4/mcp-handshake.txt` |

本环境没有 Claude Desktop。MCP 用与 Desktop 相同的 Streamable HTTP JSON-RPC（`initialize` / `tools/list` / `tools/call`）在 `/api/mcp` 上验证。

## 部署 env（Production）

- `PEOPLE_MCP_DEMO_TOKEN` / `NEXT_PUBLIC_MCP_DEMO_TOKEN`（公开 demo token）
- `PEOPLE_IP_HASH_SECRET`（HMAC，不入库明文 IP）
