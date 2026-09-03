from __future__ import annotations

"""Download pinned Frappe HR / ERPNext DocTypes and Greenhouse Harvest v3 OpenAPI.

Does not write warehouse tables. Network required.
"""

import ast
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HRMS_TAG = "v16.15.0"
HRMS_COMMIT = "1924234884731e389ecc4e5500653fcd59666911"
ERPNEXT_TAG = "v16.0.0"
ONET_DB = "db_31_0_text"
LEARN_CATALOG = "https://learn.microsoft.com/api/catalog/?locale=en-us&type=modules,learningPaths,appliedSkills,certifications,courses"
BLS_API = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
HARVEST_DOCS = "https://harvestdocs.greenhouse.io/reference/get_v3-applications"
UA = "PeopleAnalyticsAI-source-contract-pin/1.0"


HRMS_DOCTYPES = {
    "employee_transfer": "hrms/hr/doctype/employee_transfer/employee_transfer.json",
    "employee_property_history": "hrms/hr/doctype/employee_property_history/employee_property_history.json",
    "employee_promotion": "hrms/hr/doctype/employee_promotion/employee_promotion.json",
    "employee_separation": "hrms/hr/doctype/employee_separation/employee_separation.json",
    "employee_grade": "hrms/hr/doctype/employee_grade/employee_grade.json",
    "appraisal": "hrms/hr/doctype/appraisal/appraisal.json",
    "appraisal_cycle": "hrms/hr/doctype/appraisal_cycle/appraisal_cycle.json",
    "training_program": "hrms/hr/doctype/training_program/training_program.json",
    "training_event": "hrms/hr/doctype/training_event/training_event.json",
    "training_result": "hrms/hr/doctype/training_result/training_result.json",
    "training_feedback": "hrms/hr/doctype/training_feedback/training_feedback.json",
    "training_event_employee": "hrms/hr/doctype/training_event_employee/training_event_employee.json",
    "training_result_employee": "hrms/hr/doctype/training_result_employee/training_result_employee.json",
    "employee_skill_map": "hrms/hr/doctype/employee_skill_map/employee_skill_map.json",
    "employee_skill": "hrms/hr/doctype/employee_skill/employee_skill.json",
    "skill": "hrms/hr/doctype/skill/skill.json",
    "employment_type": "hrms/hr/doctype/employment_type/employment_type.json",
    "salary_structure": "hrms/payroll/doctype/salary_structure/salary_structure.json",
    "salary_structure_assignment": "hrms/payroll/doctype/salary_structure_assignment/salary_structure_assignment.json",
    "salary_slip": "hrms/payroll/doctype/salary_slip/salary_slip.json",
    "salary_component": "hrms/payroll/doctype/salary_component/salary_component.json",
    "salary_detail": "hrms/payroll/doctype/salary_detail/salary_detail.json",
}

ERPNEXT_DOCTYPES = {
    "employee": "erpnext/setup/doctype/employee/employee.json",
    "department": "erpnext/setup/doctype/department/department.json",
    "designation": "erpnext/setup/doctype/designation/designation.json",
    "branch": "erpnext/setup/doctype/branch/branch.json",
}

GREENHOUSE_SCHEMA_KEYS = [
    "application",
    "application_stage",
    "candidate",
    "job",
    "opening",
    "department",
    "office",
    "user",
    "source",
    "referrer",
    "job_interview_stage",
    "job_interview",
    "job_hiring_manager",
    "interview",
    "scorecard",
    "scorecard_question",
    "scorecard_question_answer",
    "scorecard_question_option",
    "offer",
    "approval_flow",
    "rejection_reason",
    "eeoc",
    "demographic",
]


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,text/html,*/*"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def github_raw(repo: str, ref: str, path: str) -> bytes:
    url = f"https://raw.githubusercontent.com/{repo}/{ref}/{path}"
    return get(url)


def compact_doctype(doc: dict) -> dict:
    fields = []
    for field in doc.get("fields") or []:
        if field.get("fieldtype") in {"Section Break", "Column Break", "Tab Break", "HTML", "Fold"}:
            continue
        fields.append(
            {
                "fieldname": field.get("fieldname"),
                "label": field.get("label"),
                "fieldtype": field.get("fieldtype"),
                "options": field.get("options"),
                "reqd": field.get("reqd"),
            }
        )
    return {
        "name": doc.get("name"),
        "module": doc.get("module"),
        "istable": doc.get("istable"),
        "issingle": doc.get("issingle"),
        "autoname": doc.get("autoname"),
        "is_submittable": doc.get("is_submittable"),
        "fields": fields,
    }


class _DropGettext(ast.NodeTransformer):
    def visit_Call(self, node: ast.Call) -> ast.AST:
        self.generic_visit(node)
        if isinstance(node.func, ast.Name) and node.func.id == "_" and node.args:
            return node.args[0]
        return node


def extract_hrms_custom_fields(setup_src: str) -> dict:
    tree = ast.parse(setup_src)
    fn = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "get_custom_fields"
    )
    ret = next(node for node in fn.body if isinstance(node, ast.Return))
    literal = ast.literal_eval(_DropGettext().visit(ret.value))
    compact = {}
    for doctype, fields in literal.items():
        compact[doctype] = [
            {
                "fieldname": field.get("fieldname"),
                "label": field.get("label"),
                "fieldtype": field.get("fieldtype"),
                "options": field.get("options"),
                "insert_after": field.get("insert_after"),
            }
            for field in fields
            if field.get("fieldtype") not in {"Section Break", "Column Break", "Tab Break", "HTML", "Fold"}
        ]
    return {
        "source": "hrms/setup.py get_custom_fields()",
        "tag": HRMS_TAG,
        "commit": HRMS_COMMIT,
        "note": "HRMS custom fields overlay ERPNext masters. Employee.employment_type and Employee.grade are custom fields, not ERPNext Employee.json columns. Effective Employee schema = employee.fields.json + custom_fields.json doctypes.Employee.",
        "doctypes": compact,
    }


def write_effective_employee_schema(employee_fields_path: Path, custom: dict) -> None:
    base = json.loads(employee_fields_path.read_text(encoding="utf-8"))
    overlay = custom["doctypes"].get("Employee") or []
    seen = {field["fieldname"] for field in base.get("fields") or []}
    merged = list(base.get("fields") or [])
    for field in overlay:
        if field["fieldname"] not in seen:
            merged.append({**field, "origin": "hrms_custom_field"})
            seen.add(field["fieldname"])
    write_json(
        employee_fields_path.parent / "employee_effective.fields.json",
        {
            "name": "Employee",
            "effective_schema": "ERPNext Employee.json + hrms/setup.py get_custom_fields()['Employee']",
            "fields": merged,
        },
    )


def extract_greenhouse_openapi(html: str) -> dict:
    scripts = re.findall(r"<script[^>]*>(\{.*?\})</script>", html, re.DOTALL)
    for script in scripts:
        if '"paths"' in script and ("harvest" in script.lower() or "/v3/" in script):
            payload = json.loads(script)
            schema = (
                payload.get("document", {}).get("api", {}).get("schema")
                or payload.get("data", {}).get("api", {}).get("schema")
                or payload.get("api", {}).get("schema")
            )
            if schema and "paths" in schema:
                return schema
    raise RuntimeError("Greenhouse Harvest v3 OpenAPI not found in docs HTML")


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> int:
    hrms_dir = ROOT / "frappe_hr" / "doctypes"
    erp_dir = ROOT / "frappe_hr" / "erpnext_doctypes"
    gh_dir = ROOT / "greenhouse_v3"

    (ROOT / "frappe_hr").mkdir(parents=True, exist_ok=True)
    (ROOT / "frappe_hr" / "VERSION").write_text(
        json.dumps(
            {
                "product": "Frappe HR (hrms)",
                "tag": HRMS_TAG,
                "commit": HRMS_COMMIT,
                "repository": "https://github.com/frappe/hrms",
                "erpnext_tag": ERPNEXT_TAG,
                "erpnext_repository": "https://github.com/frappe/erpnext",
                "frappe_framework": ">=16.0.0,<17.0.0",
                "note": "Employee, Department, Designation, and Branch live in ERPNext v16. Payroll DocTypes (Salary Structure/Assignment/Slip/Component) live in frappe/hrms v16, not erpnext/payroll. Employee Transfer/Promotion child rows are DocType Employee Property History (property, current, new, fieldname) — there is no employee_transfer_detail DocType.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    missing = []
    for name, path in HRMS_DOCTYPES.items():
        try:
            raw = github_raw("frappe/hrms", HRMS_TAG, path)
            doc = json.loads(raw.decode("utf-8"))
            write_json(hrms_dir / f"{name}.json", doc)
            write_json(hrms_dir / f"{name}.fields.json", compact_doctype(doc))
            print("hrms", name, len(compact_doctype(doc)["fields"]))
        except Exception as exc:
            missing.append(("hrms", name, str(exc)))
            print("MISSING hrms", name, exc)

    for name, path in ERPNEXT_DOCTYPES.items():
        try:
            raw = github_raw("frappe/erpnext", ERPNEXT_TAG, path)
            doc = json.loads(raw.decode("utf-8"))
            write_json(erp_dir / f"{name}.json", doc)
            write_json(erp_dir / f"{name}.fields.json", compact_doctype(doc))
            print("erpnext", name, len(compact_doctype(doc)["fields"]))
        except Exception as exc:
            missing.append(("erpnext", name, str(exc)))
            print("MISSING erpnext", name, exc)

    try:
        setup_src = github_raw("frappe/hrms", HRMS_TAG, "hrms/setup.py").decode("utf-8")
        custom = extract_hrms_custom_fields(setup_src)
        write_json(ROOT / "frappe_hr" / "custom_fields.json", custom)
        write_effective_employee_schema(erp_dir / "employee.fields.json", custom)
        print("hrms custom_fields", sorted(custom["doctypes"].keys()), "employee_custom", len(custom["doctypes"].get("Employee", [])))
    except Exception as exc:
        missing.append(("hrms", "custom_fields", str(exc)))
        print("MISSING hrms custom_fields", exc)

    html = get(HARVEST_DOCS).decode("utf-8", errors="replace")
    openapi = extract_greenhouse_openapi(html)
    gh_dir.mkdir(parents=True, exist_ok=True)
    (gh_dir / "VERSION").write_text(
        json.dumps(
            {
                "product": "Greenhouse Harvest API",
                "version": "v3",
                "docs": HARVEST_DOCS,
                "openapi_info": openapi.get("info"),
                "pinned_from": "embedded OpenAPI in harvestdocs.greenhouse.io HTML",
                "note": "Harvest v1/v2 are deprecated. days_in_stage on application_stages is a source-computed field; canonical time_in_stage uses entered_at/exited_at.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    write_json(gh_dir / "openapi" / "harvest_v3.openapi.json", openapi)
    components = (openapi.get("components") or {}).get("schemas") or {}
    extracted = {}
    paths = list(openapi.get("paths") or {})
    write_json(gh_dir / "paths.json", sorted(paths))
    for key, schema in components.items():
        lowered = key.lower()
        if any(token in lowered for token in GREENHOUSE_SCHEMA_KEYS):
            extracted[key] = schema
    write_json(gh_dir / "schemas" / "extracted_components.json", extracted)
    compact_dir = gh_dir / "schemas" / "fields"
    for key, schema in extracted.items():
        props = (schema or {}).get("properties") or {}
        write_json(
            compact_dir / f"{key}.fields.json",
            {
                "source_system": "greenhouse_v3",
                "source_object": key,
                "fields": [
                    {
                        "name": name,
                        "type": (spec or {}).get("type"),
                        "format": (spec or {}).get("format"),
                        "description": (spec or {}).get("description"),
                    }
                    for name, spec in props.items()
                ],
            },
        )
    print("greenhouse schemas", len(extracted), "paths", len(paths))

    (ROOT / "microsoft_learn" / "VERSION").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "microsoft_learn" / "VERSION").write_text(
        json.dumps({"catalog_url": LEARN_CATALOG, "locale": "en-us", "provenance": "live_public"}, indent=2) + "\n",
        encoding="utf-8",
    )
    (ROOT / "onet" / "VERSION").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "onet" / "VERSION").write_text(
        json.dumps({"database": ONET_DB, "download": "https://www.onetcenter.org/dl_files/database/db_31_0_text.zip"}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    (ROOT / "bls" / "VERSION").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "bls" / "VERSION").write_text(
        json.dumps({"api": BLS_API, "version": "publicAPI/v2"}, indent=2) + "\n",
        encoding="utf-8",
    )
    write_json(ROOT / "pin_errors.json", missing)
    print("missing", missing)
    return 0 if not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())
