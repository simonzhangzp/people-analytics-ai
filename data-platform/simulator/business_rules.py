from __future__ import annotations

"""Helpers for GATE 2 business rules used by simulator tests and rehearsal."""

import sys
from datetime import date, timedelta
from pathlib import Path

_DP = Path(__file__).resolve().parents[1]
if str(_DP) not in sys.path:
    sys.path.insert(0, str(_DP))

from people_rulebook import (
    certified_employment_types,
    certified_status,
    e6_map,
    regrettable_threshold,
    separate_employment_types,
    volume_test_ratio,
)

VOLUME_TEST_RATIO = volume_test_ratio()
CERTIFIED_STATUS = certified_status()
NONCERTIFIED_STATUS = frozenset({"Inactive", "Left"})
CERTIFIED_EMPLOYMENT_TYPES = certified_employment_types()
SEPARATE_EMPLOYMENT_TYPES = separate_employment_types()
E6_REASON_MAP = e6_map()
REGRETTABLE_SCORE_MIN = regrettable_threshold()
APPRAISAL_SCALE = (0.0, 5.0)


def in_certified_headcount(
    status: str,
    employment_type: str,
    hire_date: date,
    termination_date: date | None,
    as_of: date,
) -> bool:
    if status not in CERTIFIED_STATUS:
        return False
    if employment_type not in CERTIFIED_EMPLOYMENT_TYPES:
        return False
    if hire_date > as_of:
        return False
    if termination_date is not None and termination_date <= as_of:
        return False
    return True


def tenure_band(hire_date: date, as_of: date) -> str:
    months = (as_of.year - hire_date.year) * 12 + (as_of.month - hire_date.month)
    if as_of.day < hire_date.day:
        months -= 1
    if months < 12:
        return "<1y"
    if months < 36:
        return "1–3y"
    if months < 60:
        return "3–5y"
    if months < 120:
        return "5–10y"
    return "10y+"


def volume_test_ok(control_total: int, rows_received: int) -> bool:
    if control_total <= 0:
        return False
    return rows_received / control_total >= VOLUME_TEST_RATIO


def absence_closes_worker(extract_mode: str, volume_ok: bool, consecutive_full_absences: int) -> bool:
    return extract_mode == "full" and volume_ok and consecutive_full_absences >= 2


def ssa_to_date(from_date: date, next_from: date | None, termination_date: date | None) -> date | None:
    cap = (next_from - timedelta(days=1)) if next_from is not None else None
    if termination_date is not None:
        cap = termination_date if cap is None else min(cap, termination_date)
    return cap


def appraisal_final_score(
    total_score: float,
    self_score: float,
    avg_feedback_score: float,
    calculate_final_score_based_on_formula: int | bool = 0,
) -> float:
    if calculate_final_score_based_on_formula:
        raise ValueError("simulator does not evaluate a custom final_score_formula")
    return round((total_score + self_score + avg_feedback_score) / 3.0, 4)


def e6_category(reason: str) -> str:
    return E6_REASON_MAP.get(reason, "other")
