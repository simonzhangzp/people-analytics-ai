from __future__ import annotations

import sys
from pathlib import Path

SERVING_DIR = Path(__file__).resolve().parents[1] / "serving"
if str(SERVING_DIR) not in sys.path:
    sys.path.insert(0, str(SERVING_DIR))

from apply import assert_people_project, connect  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402


def people_connect():
    refuse_blocked(PEOPLE_REF)
    conn = connect(port=5432)
    assert_people_project(conn)
    return conn


def upsert_rows(sql: str, rows: list[tuple]) -> int:
    if not rows:
        return 0
    with people_connect() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)
        conn.commit()
    return len(rows)


def execute(sql: str, params: object | None = None):
    with people_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            if cur.description:
                rows = cur.fetchall()
            else:
                rows = []
        conn.commit()
    return rows


def execute_values(sql: str, rows: list[tuple]) -> None:
    if not rows:
        return
    with people_connect() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)
        conn.commit()
