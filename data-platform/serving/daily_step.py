from __future__ import annotations

"""Hetzner thaw job for People v2.

Serving healthcheck is Vercel Cron (`/api/cron/people-healthcheck`).
Streak lives in people_v2.people_serving_run (kind=healthcheck, ok=true)
and is computed by people_healthcheck_streak(). Do not write success_streak.json.

Thaw (PEOPLE_DAILY_MODE=thaw): reserved simulate.step → extract → silver/gold → publish.
Not a cutover path today. Frozen mode is a no-op so this host cannot claim a daily job.
"""

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

from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402
from pipeline.lineage import git_head, git_is_dirty, write_manifest  # noqa: E402

LOG_DIR = ROOT / "lake" / "people_logs" / "daily"
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
            step("serving_healthcheck", "skipped", "owned by Vercel Cron /api/cron/people-healthcheck")
            log["ok"] = True
            log["reason"] = "vercel_cron_owns_healthcheck"
            log["cutover_ready"] = False
    except Exception as exc:
        step("exception", "failed", f"{type(exc).__name__}: {exc}")
        log["ok"] = False
        log["reason"] = "exception"
        _alert(f"People daily pipeline failed {day}", traceback.format_exc()[-4000:])
    log["finished_at"] = datetime.now(timezone.utc).isoformat()
    write_manifest(LOG_DIR / f"{day}.json", log)
    print("daily_log", LOG_DIR / f"{day}.json", "ok", log["ok"], "reason", log.get("reason"), flush=True)
    return 0 if log["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
