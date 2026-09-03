from __future__ import annotations

"""Pin HRMS custom fields + Employment Type without re-downloading Harvest."""

import json
from pathlib import Path

from pin_source_contracts import (
    HRMS_TAG,
    compact_doctype,
    extract_hrms_custom_fields,
    github_raw,
    write_effective_employee_schema,
    write_json,
)

ROOT = Path(__file__).resolve().parent


def main() -> int:
    hrms_dir = ROOT / "frappe_hr" / "doctypes"
    setup_src = github_raw("frappe/hrms", HRMS_TAG, "hrms/setup.py").decode("utf-8")
    custom = extract_hrms_custom_fields(setup_src)
    write_json(ROOT / "frappe_hr" / "custom_fields.json", custom)
    write_effective_employee_schema(
        ROOT / "frappe_hr" / "erpnext_doctypes" / "employee.fields.json",
        custom,
    )
    raw = github_raw("frappe/hrms", HRMS_TAG, "hrms/hr/doctype/employment_type/employment_type.json")
    doc = json.loads(raw.decode("utf-8"))
    write_json(hrms_dir / "employment_type.json", doc)
    write_json(hrms_dir / "employment_type.fields.json", compact_doctype(doc))
    emp_fields = {row["fieldname"] for row in custom["doctypes"]["Employee"]}
    print("employee_custom", sorted(emp_fields))
    print("has_employment_type", "employment_type" in emp_fields)
    print("has_grade", "grade" in emp_fields)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
