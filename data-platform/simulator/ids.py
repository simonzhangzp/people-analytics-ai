from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone


def sha12(*parts: str) -> str:
    payload = "||".join(parts).encode("utf-8")
    return hashlib.sha1(payload).hexdigest()[:12]


def person_id(source_system: str, source_object: str, source_id: str) -> str:
    return "PER-" + sha12(source_system, source_object, source_id)


def worker_id(employee_name: str) -> str:
    return employee_name


def utc(day: date, hour: int = 12) -> str:
    return datetime(day.year, day.month, day.day, hour, 0, 0, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
