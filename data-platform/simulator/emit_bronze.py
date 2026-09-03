from __future__ import annotations

import json
import shutil
from datetime import date
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from extract import dry_run_apac_employee_fault, employee_as_of
from masters import bronze_masters, demographic_rows, eeoc_row
from pipeline.bronze_contracts import non_contract_bronze_objects

CHUNK = 200_000


def write_rows(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pylist(rows), path)


def _write(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        table = pa.table({"_empty": pa.array([], type=pa.int8())})
    else:
        table = pa.Table.from_pylist(rows)
    pq.write_table(table, path)


def _write_stream(path: Path, rows_iter, chunk: int = CHUNK) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    writer = None
    batch: list[dict] = []
    for row in rows_iter:
        batch.append(row)
        if len(batch) >= chunk:
            table = pa.Table.from_pylist(batch)
            if writer is None:
                writer = pq.ParquetWriter(str(path), table.schema)
            writer.write_table(table)
            batch = []
    if batch:
        table = pa.Table.from_pylist(batch)
        if writer is None:
            writer = pq.ParquetWriter(str(path), table.schema)
        writer.write_table(table)
    if writer is not None:
        writer.close()


def emit_bronze(state: dict, lake: Path, prefix: str) -> Path:
    root = lake / "people_bronze" / prefix
    for leftover in (root / "canonical", root / "engagement_ext" / "people_ref_comp_band"):
        if leftover.exists():
            shutil.rmtree(leftover)
    emp_root = root / "frappe_hr" / "Employee"
    if emp_root.exists():
        for part in emp_root.iterdir():
            if part.is_dir() and part.name.startswith("extract_date="):
                shutil.rmtree(part)
    employee_versions = []
    for i, row in enumerate(state["employee_versions"]):
        stamped = dict(row)
        stamped["emit_seq"] = int(row["emit_seq"]) if row.get("emit_seq") is not None else i
        employee_versions.append(stamped)
    _write(root / "frappe_hr" / "Employee" / "part.parquet", employee_versions)
    _write(root / "frappe_hr" / "Employee_Separation" / "part.parquet", state["separations"])
    write_rows(root / "greenhouse_v3" / "offer" / "part.parquet", state["offers"])
    write_rows(root / "greenhouse_v3" / "application" / "part.parquet", state["applications"])
    write_rows(root / "greenhouse_v3" / "opening" / "part.parquet", state["openings"])
    write_rows(root / "greenhouse_v3" / "candidate" / "part.parquet", state["candidates"])
    write_rows(root / "greenhouse_v3" / "application_stage" / "part.parquet", state["application_stages"])
    write_rows(root / "greenhouse_v3" / "interview" / "part.parquet", state["interviews"])
    write_rows(root / "greenhouse_v3" / "scorecard" / "part.parquet", state["scorecards"])
    write_rows(root / "frappe_hr" / "Salary_Structure_Assignment" / "part.parquet", state["ssa"])
    write_rows(root / "frappe_hr" / "Appraisal" / "part.parquet", state["appraisals"])
    write_rows(root / "frappe_hr" / "Appraisal_Cycle" / "part.parquet", state["appraisal_cycles"])
    write_rows(root / "frappe_hr" / "Employee_Promotion" / "part.parquet", state["promotions"])
    write_rows(root / "frappe_hr" / "Employee_Transfer" / "part.parquet", state["transfers"])
    write_rows(root / "frappe_hr" / "Training_Event" / "part.parquet", state["training_events"])
    write_rows(root / "frappe_hr" / "Training_Event_Employee" / "part.parquet", state["training_event_employees"])
    write_rows(root / "frappe_hr" / "Training_Result" / "part.parquet", state["training_results"])
    write_rows(root / "frappe_hr" / "Training_Result_Employee" / "part.parquet", state["training_result_employees"])
    write_rows(root / "frappe_hr" / "Employee_Skill_Map" / "part.parquet", state["skill_maps"])
    write_rows(root / "frappe_hr" / "Employee_Skill" / "part.parquet", state["employee_skills"])
    write_rows(root / "engagement_ext" / "survey_wave" / "part.parquet", state["survey_waves"])
    write_rows(root / "engagement_ext" / "survey_response" / "part.parquet", state["survey_responses"])

    extras = bronze_masters(state)
    frappe_objs = (
        "Department",
        "Designation",
        "Employee_Grade",
        "Branch",
        "Employment_Type",
        "Skill",
        "Training_Program",
        "Salary_Structure",
        "Employee_Property_History",
    )
    harvest_objs = (
        "job",
        "job_interview_stage",
        "job_hiring_manager",
        "department",
        "office",
        "user",
        "source",
        "rejection_reason",
    )
    for name in frappe_objs:
        write_rows(root / "frappe_hr" / name / "part.parquet", extras[name])
    for name in harvest_objs:
        write_rows(root / "greenhouse_v3" / name / "part.parquet", extras[name])
    write_rows(root / "engagement_ext" / "survey_instrument" / "part.parquet", extras["survey_instrument"])

    def _iter_applications():
        leftover = list(state.get("applications") or [])
        seen = {app.get("id") for app in leftover}
        for app in leftover:
            yield app
        app_root = root / "greenhouse_v3" / "application"
        if not app_root.exists():
            return
        for part in sorted(app_root.rglob("*.parquet")):
            if part.stat().st_size <= 0:
                continue
            for batch in pq.ParquetFile(part).iter_batches(batch_size=20_000):
                for row in batch.to_pylist():
                    app_id = row.get("id")
                    if app_id in seen:
                        continue
                    yield row

    def _eeoc():
        for app in _iter_applications():
            if "id" in app:
                yield eeoc_row(app)

    def _demo():
        for app in _iter_applications():
            if "id" in app:
                yield from demographic_rows(app)

    _write_stream(root / "greenhouse_v3" / "eeoc" / "part.parquet", _eeoc())
    _write_stream(root / "greenhouse_v3" / "demographic_answer" / "part.parquet", _demo())

    bad = non_contract_bronze_objects(root)
    if bad:
        raise SystemExit("bronze non-contract objects: " + ", ".join(bad))
    return root


def emit_case2_extracts(state: dict, lake: Path, prefix: str, fault_day: date, prior_day: date, last_certified_headcount: int) -> dict:
    employees_prior = employee_as_of(state["employee_versions"], prior_day)
    employees_fault = employee_as_of(state["employee_versions"], fault_day)
    prior = dry_run_apac_employee_fault(employees_prior, prior_day, last_certified_headcount=last_certified_headcount)
    fault = dry_run_apac_employee_fault(employees_fault, fault_day, last_certified_headcount=last_certified_headcount)
    base = lake / "people_bronze" / prefix / "frappe_hr" / "Employee"
    for day, payload, rows in (
        (prior_day, prior, employees_prior),
        (fault_day, fault, [r for r in employees_fault if r["name"] in set(fault["received_names"])]),
    ):
        dest = base / f"extract_date={day.isoformat()}"
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "manifest.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        _write(dest / "part.parquet", rows)
    return {"prior": prior, "fault": fault, "employees_fault": employees_fault}
