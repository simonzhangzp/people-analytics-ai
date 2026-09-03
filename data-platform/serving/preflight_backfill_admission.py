from __future__ import annotations

"""Preflight using occupied + measured × 1.3. Does not overwrite A7 (owned by 6a-3)."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import (  # noqa: E402
    assert_people_project,
    connect_for_ddl,
    disk_occupied,
    _disk_quota,
    publish_delta_bytes,
)
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    quota, headroom, expected = _disk_quota()
    conn = connect_for_ddl()
    try:
        assert_people_project(conn)
        occ = disk_occupied(conn)
        allowed = quota - headroom
        projected = occ["occupied_bytes"] + expected
        print("admission_formula", "occupied + measured * 1.3")
        print("admission_expected_bytes", expected, "publish_delta", publish_delta_bytes())
        print("admission_occupied", occ)
        print("admission_projected", projected, "allowed", allowed)
        if projected <= allowed:
            print("admission_ok")
            return 0
        print("admission_failed_measured_x1_3")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
