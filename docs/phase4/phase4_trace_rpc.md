# Trace read path (P1 R5 / 修-3)

The website does **not** expose a `people_get_agent_trace(trace_id)` RPC. Follow-up trace is the same POST `/api/people/ask` JSON (`trace`, `trace_id`, tool list). A client cannot fetch another session's row by guessing a UUID.

`people_app` has no SELECT on `people_agent_trace` / `people_agent_tool_call` (FORCE RLS deny). Writes go through security-definer functions only.

## Write RPCs (`data-platform/serving/schemas/027_people_v2_agent_mcp.sql`)

### `people_v2.people_write_agent_trace`

```
people_write_agent_trace(
  p_trace_id uuid,
  p_identity_id text,
  p_question text,
  p_tier text,
  p_snapshot_id text default null,
  p_latency_ms integer default null,
  p_llm_calls integer default 0,
  p_critic_ok boolean default null,
  p_llm_skipped text default null,
  p_answer_summary jsonb default null
) returns void
```

Called from `runPeopleAgent` after compose. `p_identity_id` is the identity already asserted for that request (`people_assert_identity`). There is no lookup-by-trace_id argument that returns payload to the browser.

### `people_v2.people_write_agent_tool_call`

```
people_write_agent_tool_call(
  p_trace_id uuid,
  p_seq integer,
  p_tool_name text,
  p_args jsonb default '{}',
  p_result_summary jsonb default null,
  p_latency_ms integer default null,
  p_rpc text default null,
  p_ok boolean default true,
  p_error text default null
) returns void
```

Insert-only. No SELECT grant to `people_app`.

Table owners after `032_people_v2_p1_r5.sql`: `people_publisher` (aligned with the other `people_v2.people_*` tables).
