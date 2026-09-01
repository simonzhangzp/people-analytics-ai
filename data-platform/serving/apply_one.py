from __future__ import annotations

"""Apply a single People schema file to quantreview-staging only."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import SCHEMA_DIR, assert_people_project, connect, run_sql


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python apply_one.py 018_people_snapshot_context.sql")
        return 2
    path = SCHEMA_DIR / sys.argv[1]
    if not path.exists():
        print("missing", path)
        return 2
    with connect() as conn:
        assert_people_project(conn)
        run_sql(conn, path.read_text(encoding="utf-8"), path.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
