"""Insert E1 eval run from docs/phase4/e1-run.json. People project only."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from apply import assert_people_project, connect

ROOT = Path(__file__).resolve().parents[2]
payload_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "phase4" / "e1-run.json"
payload = json.loads(payload_path.read_text(encoding="utf-8"))

with connect() as conn:
    assert_people_project(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into people_v2.people_eval_run
              (run_id, started_at, finished_at, git_tag, dpl, status, scorecard, note)
            values (%s::uuid, now(), now(), %s, %s, %s, %s::jsonb, %s)
            """,
            [
                payload["run_id"],
                payload.get("git_tag"),
                payload.get("dpl"),
                payload["status"],
                json.dumps(payload["scorecard"]),
                payload.get("note", "e1 golden 101"),
            ],
        )
        for row in payload["results"]:
            cur.execute(
                """
                insert into people_v2.people_eval_result
                  (run_id, case_id, family, passed, latency_ms, failures, answer_summary)
                values (%s::uuid, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                [
                    payload["run_id"],
                    row["case_id"],
                    row["family"],
                    row["passed"],
                    row.get("latency_ms"),
                    row.get("failures") or [],
                    json.dumps(row.get("answer_summary") or {}),
                ],
            )
    conn.commit()
print("wrote", payload["run_id"], payload["status"])
