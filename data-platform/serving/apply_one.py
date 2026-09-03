from __future__ import annotations

"""Apply one schema file to the dedicated People project (zapmigfrtnwnkmezjefx).

Usage (from data-platform/serving):
  python apply_one.py 019_people_v2_bootstrap.sql
"""

import sys
from pathlib import Path

from apply import (
    PEOPLE_REF,
    SCHEMA_DIR,
    assert_people_project,
    connect_for_ddl,
    refuse_blocked,
    run_sql,
    set_publisher_password,
)

from people_refs import QUANTREVIEW_STAGING_REF, PROD_REF


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: python apply_one.py <file.sql>")
        sys.exit(2)
    name = Path(sys.argv[1]).name
    refuse_blocked(name, PEOPLE_REF)
    if PEOPLE_REF in {PROD_REF, QUANTREVIEW_STAGING_REF}:
        raise SystemExit("refused: PEOPLE_REF is a blocked QuantReview project")
    path = SCHEMA_DIR / name
    if not path.exists():
        print("missing", path)
        sys.exit(1)
    conn = connect_for_ddl()
    try:
        assert_people_project(conn)
        run_sql(conn, path.read_text(encoding="utf-8"), name)
        if name == "019_people_v2_bootstrap.sql":
            set_publisher_password(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
