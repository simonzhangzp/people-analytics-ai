from __future__ import annotations

"""LLM budget RPC: daily cap, fail-closed insert, concurrent consume. Run as people_app."""

import hashlib
import hmac
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import connect_app, connect_publisher  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

OUT = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "phase4_llm_budget.json"


def _secret() -> str:
    secret = os.environ.get("PEOPLE_IP_HASH_SECRET", "").strip()
    if not secret:
        raise SystemExit("PEOPLE_IP_HASH_SECRET is required for budget tests")
    return secret


def _ip_hash(ip: str) -> str:
    return hmac.new(_secret().encode("utf-8"), ip.encode("utf-8"), hashlib.sha256).hexdigest()


def _consume(conn, ip_hash: str, route: str = "people_ask") -> dict:
    with conn.cursor() as cur:
        cur.execute("select people_v2.people_assert_identity(%s)", ["demo-external-viewer"])
        cur.execute("select people_v2.people_try_consume_llm(%s, %s, %s)", [ip_hash, route, "US"])
        row = cur.fetchone()[0]
    if hasattr(conn, "commit"):
        conn.commit()
    return row if isinstance(row, dict) else json.loads(row)


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    test_ip = _ip_hash("198.51.100.44")
    pub = connect_publisher()
    try:
        with pub.cursor() as cur:
            cur.execute("delete from people_v2.people_llm_call where ip_hash = %s", [test_ip])
        pub.commit()
    finally:
        pub.close()

    app = connect_app()
    daily = []
    try:
        for _ in range(4):
            daily.append(_consume(app, test_ip))
        fourth = daily[3]
        assert fourth.get("allowed") is False, fourth
        assert fourth.get("blocked_by") == "per_ip_daily", fourth
        assert all(row.get("allowed") is True for row in daily[:3]), daily[:3]
    finally:
        app.close()

    site_ip = _ip_hash("198.51.100.50")
    pub = connect_publisher()
    restored = None
    try:
        with pub.cursor() as cur:
            cur.execute(
                "select limit_value from people_v2.people_llm_budget where budget_key = 'site_rolling_30d'"
            )
            restored = cur.fetchone()[0]
            cur.execute(
                "update people_v2.people_llm_budget set limit_value = 0 where budget_key = 'site_rolling_30d'"
            )
            cur.execute("delete from people_v2.people_llm_call where ip_hash = %s", [site_ip])
        pub.commit()
        app = connect_app()
        try:
            blocked = _consume(app, site_ip)
            assert blocked.get("allowed") is False, blocked
            assert blocked.get("blocked_by") == "site_rolling_30d", blocked
        finally:
            app.close()
    finally:
        if restored is not None:
            with pub.cursor() as cur:
                cur.execute(
                    "update people_v2.people_llm_budget set limit_value = %s where budget_key = 'site_rolling_30d'",
                    [restored],
                )
            pub.commit()
        pub.close()

    conc_ip = _ip_hash("198.51.100.60")
    pub = connect_publisher()
    try:
        with pub.cursor() as cur:
            cur.execute("delete from people_v2.people_llm_call where ip_hash = %s", [conc_ip])
        pub.commit()
    finally:
        pub.close()

    results: list[dict] = []

    def one(_: int) -> dict:
        conn = connect_app()
        try:
            return _consume(conn, conc_ip)
        finally:
            conn.close()

    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(one, i) for i in range(10)]
        for fut in as_completed(futures):
            results.append(fut.result())

    allowed = [row for row in results if row.get("allowed") is True]
    blocked = [row for row in results if row.get("allowed") is False]
    assert len(allowed) == 3, {"allowed": len(allowed), "blocked": len(blocked), "results": results}
    assert all(row.get("blocked_by") == "per_ip_daily" for row in blocked), blocked

    report = {
        "daily_fourth_blocked": daily[3],
        "site_blocked": "site_rolling_30d",
        "concurrent_allowed": len(allowed),
        "concurrent_blocked": len(blocked),
        "ok": True,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print("llm_budget_ok", report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
