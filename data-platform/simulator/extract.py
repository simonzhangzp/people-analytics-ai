from __future__ import annotations

"""Extract simulation. extract_fault scenarios change rows_received only."""

from datetime import date
from pathlib import Path

import yaml

SCENARIO_DIR = Path(__file__).resolve().parent / "scenario" / "scenarios"


def load_scenario(scenario_id: str) -> dict:
    path = SCENARIO_DIR / f"{scenario_id}.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _iso(value) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


from business_rules import absence_closes_worker, volume_test_ok


def employee_extract_mode(extract_date: date, scenario: dict | None = None, in_window: bool = False) -> str:
    forced = None
    if scenario and in_window:
        forced = (scenario.get("effect") or {}).get("extract_mode")
    if forced:
        return str(forced)
    return "full" if extract_date.weekday() == 4 else "incremental"


def employee_as_of(versions: list[dict], as_of: date) -> list[dict]:
    """Latest Employee version per name. Full extract includes Left; employed count is derived."""
    latest: dict[str, dict] = {}
    for row in versions:
        modified = date.fromisoformat(row["modified_date"])
        if modified > as_of:
            continue
        joining = date.fromisoformat(row["date_of_joining"])
        if joining > as_of:
            continue
        prev = latest.get(row["name"])
        if prev is None or date.fromisoformat(prev["modified_date"]) <= modified:
            latest[row["name"]] = row
    out = []
    for row in latest.values():
        out.append(
            {
                "name": row["name"],
                "status": row["status"],
                "branch_region": row["branch_region"],
                "employment_type": row["employment_type"],
                "date_of_joining": row["date_of_joining"],
            }
        )
    return out


def dry_run_apac_employee_fault(
    employees: list[dict],
    extract_date: date,
    last_certified_headcount: int | None = None,
) -> dict:
    scenario = load_scenario("apac_hris_feed_incomplete")
    effective = scenario["effective"]
    start = _iso(effective["from"])
    end = _iso(effective["to"]) if effective.get("to") else extract_date.isoformat()
    in_window = start <= extract_date.isoformat() <= end
    pct = float(scenario["effect"]["extract_rows_received_pct"]) if in_window else 1.0
    control_total = len(employees)
    apac = [row for row in employees if row.get("branch_region") == "APAC"]
    other = [row for row in employees if row.get("branch_region") != "APAC"]
    keep_apac = apac[: max(1, int(round(len(apac) * pct)))] if in_window else apac
    received = other + keep_apac
    mode = employee_extract_mode(extract_date, scenario, in_window)
    vol_ok = volume_test_ok(control_total, len(received))
    isolated = in_window and not vol_ok
    missing = [row["name"] for row in apac if row["name"] not in {r["name"] for r in keep_apac}] if in_window else []
    closes = absence_closes_worker(mode, vol_ok, consecutive_full_absences=1)
    received_active = [row for row in received if row.get("status", "Active") == "Active"]
    expected = last_certified_headcount if last_certified_headcount is not None else len(received_active)
    return {
        "extract_id": f"ext-frappe-employee-{extract_date.isoformat()}",
        "run_id": f"run-{extract_date.isoformat()}",
        "source_system": "frappe_hr",
        "source_object": "Employee",
        "extract_date": extract_date.isoformat(),
        "mode": mode,
        "control_total": control_total,
        "rows_received": len(received),
        "status": "isolated" if isolated else "success",
        "volume_test_ok": vol_ok,
        "isolated": isolated,
        "pointer_moved": not isolated,
        "absence_closes_worker": closes,
        "missing_names": missing,
        "replay": {
            "metric_id": "headcount",
            "value_bad": len(received_active),
            "value_expected": expected,
        },
        "scenario_ids": [scenario["scenario_id"]] if in_window else [],
        "received_names": [row["name"] for row in received],
    }
