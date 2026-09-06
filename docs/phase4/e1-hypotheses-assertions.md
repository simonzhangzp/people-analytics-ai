# E1 hypotheses assertions (P1 R3)

E1 does **not** score `attempted_ok` vs `attempted_failed` by headline/facts text similarity. Those two states share headline, facts, and tools (`b2a_diff`). E1 **does** score hypotheses with these checks (implemented in `src/lib/people/agent/hypotheses-eval.ts`):

1. Non-empty after trim.
2. No digits. Numbers belong in facts only.
3. No causal verbs: `caused`, `causes`, `because of`, `due to`, `drives`, `leads to`, `driving`, `the reason is`, plus 导致 / 因为 / 驱动 / 造成.
4. No contradiction with facts. A hypothesis that introduces a number not present in facts fails rule 2 first; remaining contradictions are reserved for the golden set.

Compose sanitizes planner output with the same function before the answer leaves `/api/people/ask`.

## Required tools

E1 also scores tool choice. A chip/playbook fails if a required serving tool is missing from `tools_used`, even when headline and facts look right.

| Playbook | Required tools |
| --- | --- |
| locations | `get_metric`, `get_metric_breakdown` |
| next_steps | `get_metric`, `get_metric_breakdown` |
| tenure | `get_metric`, `get_metric_breakdown` |
| compensation | `get_metric` |
| skills | `get_skill_coverage` |
| definition | `get_metric_definition` |

Locations without `get_metric_breakdown` is a fail. The model may add extra allow-listed tools; it may not skip a required one.
