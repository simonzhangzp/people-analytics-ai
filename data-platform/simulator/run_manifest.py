from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from extract import dry_run_apac_employee_fault

OUT = Path(__file__).resolve().parent / "fixtures"


def sample_employees() -> list[dict]:
    rows = [{"name": f"HR-EMP-APAC-{idx:03d}", "branch_region": "APAC"} for idx in range(10)]
    rows += [{"name": f"HR-EMP-AMER-{idx:03d}", "branch_region": "AMER"} for idx in range(10)]
    return rows


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = dry_run_apac_employee_fault(sample_employees(), date(2026, 8, 14))
    path = OUT / "apac_extract_fault_manifest.json"
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("wrote", path)
    print("control_total", manifest["control_total"], "rows_received", manifest["rows_received"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
