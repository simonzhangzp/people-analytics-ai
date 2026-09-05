from __future__ import annotations

"""Hetzner daily job for People v2.

Frozen data-v1 (default PEOPLE_DAILY_MODE=frozen_data_v1): skip simulate/extract/gold/publish.
Healthcheck is success: ok=true, reason=frozen_data_v1. Pointer must not move.

Thaw (PEOPLE_DAILY_MODE=thaw): reserved simulate.step → extract → silver/gold → publish
→ policy verify → pointer. Used after data-v2 engine thaw. Not a cutover path today.

Cutover (step 9) does not wait on this streak. Continue recording consecutive
calendar days with ok=true after cutover until three days are logged.

Streak state lives only in lake/people_logs/daily/success_streak.json, derived
from this process's ok flag. It does not read people_serving_run.kind or
people_serving_run.run_date (those fields may exist only inside notes JSON).
"""

import json
import os
import smtplib
import sys
import traceback
from datetime import date, datetime, timezone
from email.message import EmailMessage
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import (  # noqa: E402
    connect_app,
    connect_publisher,
    disk_occupied,
)
from apply_policy import verify  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402
from pipeline.lineage import git_head, git_is_dirty, write_manifest  # noqa: E402

LOG_DIR = ROOT / "lake" / "people_logs" / "daily"
STREAK_PATH = LOG_DIR / "success_streak.json"
FROZEN_MODE = "frozen_data_v1"
THAW_MODE = "thaw"


def _today() -> str:
    return os.environ.get("PEOPLE_DAILY_AS_OF") or date.today().isoformat()


def _mode() -> str:
    raw = (os.environ.get("PEOPLE_DAILY_MODE") or FROZEN_MODE).strip()
    return THAW_MODE if raw == THAW_MODE else FROZEN_MODE


def _alert(subject: str, body: str) -> None:
    dest = os.environ.get("PEOPLE_ALERT_EMAIL")
    smtp_url = os.environ.get("PEOPLE_SMTP_URL")
    print("alert", subject, flush=True)
    if not dest or not smtp_url:
        print("alert_skipped_no_smtp", flush=True)
        return
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.environ.get("PEOPLE_ALERT_FROM") or dest
    msg["To"] = dest
    msg.set_content(body)
    with smtplib.SMTP(smtp_url, timeout=20) as smtp:
        smtp.send_message(msg)


def _streak() -> dict:
    if STREAK_PATH.exists():
        return json.loads(STREAK_PATH.read_text(encoding="utf-8"))
    return {"consecutive_days": 0, "days": []}


def _record_streak(ok: bool, day: str) -> dict:
    """File-backed streak. Independent of people_serving_run physical columns."""
    state = _streak()
    days = [d for d in (state.get("days") or []) if d != day]
    if ok:
        days.append(day)
        consecutive = 1
        ordered = sorted(days)
        for prev, cur in zip(ordered, ordered[1:]):
            if (date.fromisoformat(cur) - date.fromisoformat(prev)).days == 1:
                consecutive += 1
            else:
                consecutive = 1
        state = {"consecutive_days": consecutive, "days": ordered[-14:], "last_success": day}
    else:
        state = {"consecutive_days": 0, "days": sorted(days)[-14:], "last_failure": day}
    write_manifest(STREAK_PATH, state)
    return state


def _probe(name: str, factory, expected_port: int) -> None:
    conn = factory()
    try:
        client_port = int(conn.info.port)
        with conn.cursor() as cur:
            cur.execute("select current_user")
            user = cur.fetchone()[0]
        print("probe", name, "user", user, "client_port", client_port, flush=True)
        if client_port != expected_port:
            raise RuntimeError(f"{name} connected on {client_port}, expected {expected_port}")
    finally:
        conn.close()


def _pointer_rows(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select pointer_id, as_of::text, extract_id, moved, notes
            from people_v2.people_serving_pointer
            order by pointer_id
            """
        )
        cols = [c.name for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def _write_healthcheck_run(
    conn,
    *,
    day: str,
    notes: str,
    occ: dict,
    pointers: list[dict],
) -> None:
    run_id = f"healthcheck-{day}"
    payload = {
        "kind": "healthcheck",
        "run_date": day,
        "reason": notes,
        "database_bytes": occ.get("database_bytes"),
        "wal_bytes": occ.get("wal_bytes"),
        "pointer_snapshot": pointers,
    }
    with conn.cursor() as cur:
        cur.execute(
            """
            select column_name from information_schema.columns
            where table_schema = 'people_v2' and table_name = 'people_serving_run'
            """
        )
        cols = {row[0] for row in cur.fetchall()}
        if {"kind", "run_date", "database_bytes", "wal_bytes", "pointer_snapshot"} <= cols:
            cur.execute(
                """
                insert into people_v2.people_serving_run
                  (run_id, started_at, finished_at, certified, notes, kind, run_date,
                   database_bytes, wal_bytes, pointer_snapshot)
                values (%s, now(), now(), false, %s, 'healthcheck', %s::date, %s, %s, %s::jsonb)
                on conflict (run_id) do update set
                  finished_at = excluded.finished_at,
                  notes = excluded.notes,
                  kind = excluded.kind,
                  run_date = excluded.run_date,
                  database_bytes = excluded.database_bytes,
                  wal_bytes = excluded.wal_bytes,
                  pointer_snapshot = excluded.pointer_snapshot
                """,
                [run_id, notes, day, occ.get("database_bytes"), occ.get("wal_bytes"), json.dumps(pointers, default=str)],
            )
        else:
            cur.execute(
                """
                insert into people_v2.people_serving_run
                  (run_id, started_at, finished_at, certified, notes)
                values (%s, now(), now(), false, %s)
                on conflict (run_id) do update set
                  finished_at = excluded.finished_at,
                  notes = excluded.notes,
                  certified = false
                """,
                [run_id, json.dumps(payload, default=str)],
            )
    conn.commit()


def _thaw_simulate_branch(step) -> None:
    step(
        "simulate.step",
        "skipped",
        "thaw branch reserved for data-v2; incremental simulate.step is not enabled",
    )
    step("extract", "skipped", "no thaw extract")
    step("silver_gold_incremental", "skipped", "no thaw gold")
    step("publish_incremental", "skipped", "no thaw publish")


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    day = _today()
    mode = _mode()
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log = {
        "day": day,
        "mode": mode,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "git_head": git_head(),
        "git_dirty": git_is_dirty(),
        "steps": [],
        "pointer_moved": False,
        "ok": False,
    }
    steps = log["steps"]

    def step(name: str, status: str, detail: str = "") -> None:
        steps.append({"name": name, "status": status, "detail": detail})
        print("daily_step", name, status, detail, flush=True)

    try:
        if mode == THAW_MODE:
            _thaw_simulate_branch(step)
            log["ok"] = False
            log["reason"] = "thaw_not_implemented"
            log["cutover_ready"] = False
            _alert(f"People daily thaw skipped {day}", "PEOPLE_DAILY_MODE=thaw is reserved for data-v2.")
        else:
            _run_frozen_healthcheck(day, log, step)
    except Exception as exc:
        step("exception", "failed", f"{type(exc).__name__}: {exc}")
        log["ok"] = False
        log["reason"] = "exception"
        _alert(f"People daily pipeline failed {day}", traceback.format_exc()[-4000:])
    log["finished_at"] = datetime.now(timezone.utc).isoformat()
    log["streak"] = _record_streak(bool(log.get("ok")), day)
    write_manifest(LOG_DIR / f"{day}.json", log)
    print("daily_log", LOG_DIR / f"{day}.json", "ok", log["ok"], "reason", log.get("reason"), flush=True)
    return 0 if log["ok"] else 1


def _run_frozen_healthcheck(day: str, log: dict, step) -> None:
    step("simulate.step", "skipped", "data-v1 freeze; simulate.step held for data-v2 thaw")
    step("extract", "skipped", "no new bronze extract while simulator is frozen")
    step("silver_gold_incremental", "skipped", "no incremental gold without a new extract")
    step("publish_incremental", "skipped", "no new gold segment; pointer must not move")

    _probe("people_app_transaction", lambda: connect_app(6543), 6543)
    step("connect_people_app_6543", "ok")
    _probe("people_app_session", lambda: connect_app(5432), 5432)
    step("connect_people_app_5432", "ok")
    _probe("people_publisher_transaction", lambda: connect_publisher(6543), 6543)
    step("connect_people_publisher_6543", "ok")
    _probe("people_publisher_session", lambda: connect_publisher(5432), 5432)
    step("connect_people_publisher_5432", "ok")

    pub = connect_publisher(5432)
    try:
        before = _pointer_rows(pub)
        errors = verify(pub)
        if errors:
            step("policy_verify", "failed", "; ".join(errors[:8]))
            log["ok"] = False
            log["reason"] = "policy_verify_failed"
            _alert(f"People daily healthcheck failed {day}", "\n".join(errors[:20]))
            return
        step("policy_verify", "ok")
        after = _pointer_rows(pub)
        if before != after:
            step("pointer", "failed", "pointer changed during healthcheck")
            log["ok"] = False
            log["reason"] = "pointer_moved_unexpectedly"
            log["pointer_moved"] = True
            _alert(f"People pointer moved during healthcheck {day}", json.dumps(after, default=str))
            return
        step("pointer", "held", "no unexpected pointer movement")
        with pub.cursor() as cur:
            cur.execute(
                """
                update people_v2.people_quality_test
                   set test_group = 'recruiting'
                 where test_name in (
                   'snap_recruiter_id_subseteq_dim_recruiter',
                   'dim_recruiter_covers_opening_recruiters'
                 )
                """
            )
        pub.commit()
        step("recruiting_dq_group", "ok")
        occ = disk_occupied(pub)
        log["database_bytes"] = occ["database_bytes"]
        log["wal_bytes"] = occ["wal_bytes"]
        step("size_wal", "ok", f"pg_database_size={occ['database_bytes']} wal_bytes={occ['wal_bytes']}")
        with pub.cursor() as cur:
            try:
                cur.execute(
                    """
                    select
                      count(*) filter (where skipped_reason is null) as used,
                      coalesce(
                        (select limit_value from people_v2.people_llm_budget where budget_key = 'site_rolling_30d'),
                        50
                      ) as lim
                    from people_v2.people_llm_call
                    where ts >= now() - interval '30 days'
                    """
                )
                used, lim = cur.fetchone()
                used_n = int(used or 0)
                lim_n = int(lim or 50)
                ratio = (used_n / lim_n) if lim_n else 0
                log["llm_site_30d"] = {"used": used_n, "limit": lim_n, "ratio": ratio}
                if ratio >= 0.8:
                    step(
                        "llm_budget",
                        "warn",
                        f"site_rolling_30d {used_n}/{lim_n} ({ratio:.0%}) — 80% of hard cap",
                    )
                    print("ALERT people_llm_budget site_rolling_30d >= 80%", used_n, lim_n, flush=True)
                else:
                    step("llm_budget", "ok", f"site_rolling_30d {used_n}/{lim_n}")
            except Exception as exc:
                pub.rollback()
                step("llm_budget", "skipped", f"{type(exc).__name__}: {exc}"[:240])
        _write_healthcheck_run(pub, day=day, notes=FROZEN_MODE, occ=occ, pointers=after)
        step("serving_run", "ok", f"healthcheck-{day}")
        log["ok"] = True
        log["reason"] = FROZEN_MODE
        log["cutover_ready"] = False
    finally:
        pub.close()


if __name__ == "__main__":
    raise SystemExit(main())
