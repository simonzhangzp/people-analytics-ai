from __future__ import annotations

"""Four-segment people_v2 publish. Does not load rows until GATE 2 publish is approved.

Segments: dims/xw → facts/events → snapshots → marts.
Each segment records pg_database_size and stops if the disk gate fails.
Restricted personal-level survey / candidate demographic rows stay in lake when
the segment would exceed budget; suppressed aggregate marts may still publish.
"""

from apply import assert_disk_budget, connect_publisher, refuse_blocked
from people_refs import PEOPLE_REF

SEGMENTS = (
    "dims_xw",
    "facts_events",
    "snapshots",
    "marts",
)


def publish_segment(conn, segment: str, *, dry_run: bool = True) -> dict:
    refuse_blocked(PEOPLE_REF, segment)
    if segment not in SEGMENTS:
        raise SystemExit(f"unknown publish segment {segment}")
    before = assert_disk_budget(conn)
    print("publish_segment", segment, "dry_run", dry_run, "before", before["database_bytes"])
    if not dry_run:
        raise SystemExit("refused: people_v2 publish is not approved (no Silver/Gold DDL yet)")
    after = assert_disk_budget(conn)
    record = {
        "segment": segment,
        "dry_run": dry_run,
        "pg_database_size_before": before["database_bytes"],
        "pg_database_size_after": after["database_bytes"],
        "occupied_after": after["occupied_bytes"],
        "projected_bytes": after["projected_bytes"],
        "allowed_bytes": after["allowed_bytes"],
    }
    print("publish_segment_ok", record)
    return record


def main() -> None:
    refuse_blocked(PEOPLE_REF)
    conn = connect_publisher()
    try:
        records = [publish_segment(conn, segment, dry_run=True) for segment in SEGMENTS]
        print("publish_people_v2_dry_run", records)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
