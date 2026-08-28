"""Generate the public, synthetic Workbench attrition demo files.

The output contains synthetic employee identifiers only. Manager effectiveness
is intentionally absent so the product can demonstrate an explicit data gap.
"""

from __future__ import annotations

import csv
from pathlib import Path

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "demo"


def employee(index: int, period: str) -> dict[str, str]:
    identifier = index + 1 + (0 if period == "previous" else 2_000)
    tenure = "0–2 years" if index < 700 else "2–4 years" if index < 1_400 else "5+ years"
    level = "L5–L6" if index % 5 < 3 else "L4" if index % 5 == 3 else "L7+"
    location = ("Austin", "Raleigh", "Remote")[index % 3]
    return {
        "id": f"E{identifier:05d}",
        "tenure": tenure,
        "level": level,
        "location": location,
    }


def headcount_rows() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for period, snapshot in (("previous", "2025-07-01"), ("current", "2026-01-01")):
        for index in range(2_000):
            profile = employee(index, period)
            rows.append(
                {
                    "pers_num": profile["id"],
                    "snap_dt": snapshot,
                    "org_nm": "Engineering",
                    "job_lvl": profile["level"],
                    "tenure_band": profile["tenure"],
                    "location": profile["location"],
                    "employment_status": "Active",
                }
            )
    return rows


def termination_rows() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []

    def add_period(period: str, voluntary_count: int, mid_tenure_count: int) -> None:
        date = "2025-10-15" if period == "previous" else "2026-04-15"
        mid_added = 0
        other_added = 0
        added = 0
        for index in range(2_000):
            if added >= voluntary_count:
                break
            profile = employee(index, period)
            is_mid = profile["tenure"] == "2–4 years"
            if is_mid and mid_added >= mid_tenure_count:
                continue
            if not is_mid and other_added >= voluntary_count - mid_tenure_count:
                continue
            rows.append(
                {
                    "pers_num": profile["id"],
                    "term_dt": date,
                    "term_rsn": "Voluntary resignation",
                    "exit_classification": "Voluntary",
                    "org_nm": "Engineering",
                    "job_lvl": (
                        "L5–L6"
                        if period == "current" and added % 5 != 0
                        else profile["level"]
                    ),
                    "tenure_band": profile["tenure"],
                    "location": profile["location"],
                    "period": period,
                }
            )
            mid_added += int(is_mid)
            other_added += int(not is_mid)
            added += 1

        for index in range(12 if period == "previous" else 18):
            profile = employee(1_500 + index, period)
            rows.append(
                {
                    "pers_num": profile["id"],
                    "term_dt": date,
                    "term_rsn": "Retirement",
                    "exit_classification": "Retirement",
                    "org_nm": "Engineering",
                    "job_lvl": profile["level"],
                    "tenure_band": profile["tenure"],
                    "location": profile["location"],
                    "period": period,
                }
            )

    # Excluding retirement: 184/2,000 = 9.2%, 274/2,000 = 13.7%.
    # 61 of 90 incremental exits are in 2–4 years tenure (67.8% → 68%).
    add_period("previous", 184, 59)
    add_period("current", 274, 120)

    for index in range(28):
        profile = employee(1_700 + index, "current")
        rows.append(
            {
                "pers_num": profile["id"],
                "term_dt": "2026-04-15",
                "term_rsn": "Position eliminated",
                "exit_classification": "Involuntary",
                "org_nm": "Engineering",
                "job_lvl": profile["level"],
                "tenure_band": profile["tenure"],
                "location": profile["location"],
                "period": "current",
            }
        )
    return rows


def compensation_rows(terminations: list[dict[str, object]]) -> list[dict[str, object]]:
    current_exit_ids = {
        str(row["pers_num"])
        for row in terminations
        if row["period"] == "current" and row["exit_classification"] == "Voluntary"
    }
    rows: list[dict[str, object]] = []
    for index in range(2_000):
        profile = employee(index, "current")
        midpoint = 150_000 if profile["level"] == "L5–L6" else 132_000
        lower = (
            profile["id"] in current_exit_ids
            and profile["tenure"] == "2–4 years"
            and index % 5 != 0
        ) or (profile["id"] not in current_exit_ids and index % 10 == 0)
        ratio = (0.88 + (index % 5) * 0.01) if lower else (0.98 + (index % 7) * 0.01)
        rows.append(
            {
                "worker_id": profile["id"],
                "eff_dt": "2026-01-01",
                "org_nm": "Engineering",
                "job_lvl": profile["level"],
                "tenure_band": profile["tenure"],
                "base_ann": round(midpoint * ratio),
                "range_midpoint": midpoint,
                "compa_ratio": round(ratio, 2),
            }
        )
    return rows


def write_xlsx(path: Path, rows: list[dict[str, object]]) -> None:
    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet("People Data")
    headers = list(rows[0])
    sheet.append(headers)
    for row in rows:
        sheet.append([row[header] for header in headers])
    workbook.save(path)


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    headcount = headcount_rows()
    terminations = termination_rows()
    compensation = compensation_rows(terminations)
    write_xlsx(OUTPUT / "monthly_headcount.xlsx", headcount)
    write_csv(OUTPUT / "terminations.csv", terminations)
    write_xlsx(OUTPUT / "compensation.xlsx", compensation)
    print(
        f"Generated {len(headcount):,} headcount, "
        f"{len(terminations):,} termination, and "
        f"{len(compensation):,} compensation rows in {OUTPUT}"
    )


if __name__ == "__main__":
    main()

