from __future__ import annotations

"""Certified metric validation against serving RPCs."""

from people_metadata.people_serving import execute


def run_people_metric_serving_tests() -> list[dict]:
    rows = execute("select public.people_validate_certified_metrics()")
    payload = rows[0][0] if rows else {"tests": [], "failed": 1}
    tests = payload.get("tests") if isinstance(payload, dict) else []
    return tests


def assert_people_metric_serving_ok() -> None:
    tests = run_people_metric_serving_tests()
    failed = [row for row in tests if row.get("status") != "passed"]
    if failed:
        raise SystemExit(f"metric serving tests failed: {failed}")
    print("metric serving tests passed", len(tests))


if __name__ == "__main__":
    assert_people_metric_serving_ok()
