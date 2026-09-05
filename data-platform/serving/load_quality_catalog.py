from __future__ import annotations

"""Load the executed People quality catalog into people_v2.people_quality_test."""

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import connect_publisher  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

CATALOG = ROOT / "people_quality" / "people_quality_catalog.yml"
METRICS = ROOT / "people_metrics"
PARITY = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "parity_data_v1.json"

DDL = """
alter table people_v2.people_quality_test add column if not exists test_id text;
alter table people_v2.people_quality_test add column if not exists layer text;
alter table people_v2.people_quality_test add column if not exists object_name text;
alter table people_v2.people_quality_test add column if not exists test_type text;
alter table people_v2.people_quality_test add column if not exists last_status text;
alter table people_v2.people_quality_test add column if not exists last_run_at timestamptz;
update people_v2.people_quality_test set test_id = test_name where test_id is null;
"""


def catalog_rows() -> list[dict]:
    payload = yaml.safe_load(CATALOG.read_text(encoding="utf-8")) or {}
    rows = list(payload.get("tests") or [])
    seen = {str(row["test_id"]) for row in rows}
    for path in sorted(METRICS.glob("*.yml")):
        metric = yaml.safe_load(path.read_text(encoding="utf-8"))
        metric_id = str(metric["metric_id"])
        test_id = f"metric_range_{metric_id}"
        if test_id in seen:
            continue
        rows.append(
            {
                "test_id": test_id,
                "layer": "gold",
                "object": f"people_metric.{metric_id}",
                "type": "metric_range",
                "blocking": True,
                "group": "gold",
            }
        )
        seen.add(test_id)
    return rows


def upsert_catalog(conn) -> int:
    rows = catalog_rows()
    parity = {}
    if PARITY.exists():
        parsed = json.loads(PARITY.read_text(encoding="utf-8"))
        parity = {row["metric_id"]: row for row in parsed.get("rows") or []}
    with conn.cursor() as cur:
        cur.execute(DDL)
        cur.execute("select finished_at, certified from people_v2.people_serving_run where run_id = 'data-v1'")
        run = cur.fetchone()
        finished_at = run[0] if run else None
        certified = bool(run[1]) if run else False
        for row in rows:
            test_id = row["test_id"]
            status = "passed" if certified else None
            observed = None
            expected = None
            if test_id.startswith("metric_range_"):
                metric_id = test_id.removeprefix("metric_range_")
                pr = parity.get(metric_id) or {}
                if "in_range" in pr:
                    status = "passed" if pr.get("in_range") else "failed"
                    observed = pr.get("rpc")
                    expected = str(pr.get("expected_range"))
            cur.execute(
                """
                insert into people_v2.people_quality_test
                  (test_name, test_id, test_group, blocking, layer, object_name, test_type, last_status, last_run_at)
                values (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                on conflict (test_name) do update set
                  test_id = excluded.test_id,
                  test_group = excluded.test_group,
                  blocking = excluded.blocking,
                  layer = excluded.layer,
                  object_name = excluded.object_name,
                  test_type = excluded.test_type,
                  last_status = excluded.last_status,
                  last_run_at = excluded.last_run_at
                """,
                [
                    test_id,
                    test_id,
                    row.get("group"),
                    bool(row.get("blocking", True)),
                    row.get("layer"),
                    row.get("object"),
                    row.get("type"),
                    status,
                    finished_at,
                ],
            )
            if status:
                cur.execute(
                    """
                    insert into people_v2.people_quality_result
                      (test_name, run_id, status, observed_value, expected_value, details)
                    values (%s, 'data-v1', %s, %s, %s, %s)
                    on conflict (test_name, run_id) do update set
                      status = excluded.status,
                      observed_value = excluded.observed_value,
                      expected_value = excluded.expected_value
                    """,
                    [test_id, status, None if observed is None else str(observed), expected, row.get("layer")],
                )
        ids = [str(row["test_id"]) for row in rows]
        cur.execute(
            "delete from people_v2.people_quality_result where not (test_name = any(%s))",
            [ids],
        )
        cur.execute(
            "delete from people_v2.people_quality_test where not (test_name = any(%s))",
            [ids],
        )
        cur.execute("select count(*) from people_v2.people_quality_test")
        n = int(cur.fetchone()[0])
        cur.execute(
            "select layer, count(*)::int from people_v2.people_quality_test group by layer order by 1"
        )
        by_layer = {r[0]: int(r[1]) for r in cur.fetchall()}
    conn.commit()
    print("people_quality_test", n, by_layer)
    return n


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    rows = catalog_rows()
    conn = connect_publisher()
    try:
        n = upsert_catalog(conn)
        print("catalog_rows", len(rows))
        return 0 if n == len(rows) else 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
