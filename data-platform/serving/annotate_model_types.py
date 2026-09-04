from __future__ import annotations

"""Stamp canonical_model.yml / gold_model.yml columns with Postgres type fields.

Run once when adding tables. generate_people_v2_ddl.py reads type, it does not infer.
"""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "people_mappings" / "canonical_model.yml"
GOLD = ROOT / "people_mappings" / "gold_model.yml"

SPECIAL = {
    "org_path": "ltree",
    "interviewer_person_ids": "text[]",
    "roles": "text[]",
    "products": "text[]",
}

EXTRA = {
    "people_evt_application_stage": [("canonical_stage", "text")],
}


def infer(name: str) -> str:
    if name in SPECIAL:
        return SPECIAL[name]
    if name.endswith("_at") or name in {"recorded_at", "submitted_at", "built_at"}:
        return "timestamptz"
    if name.endswith("_date") or name in {"month_end", "month_start", "valid_from", "valid_to", "extract_date"}:
        return "date"
    if name.endswith("_in_month") or name.startswith("is_") or name in {"open", "via_t1", "moved", "isolated", "certified"}:
        return "boolean"
    if name in {
        "n",
        "headcount",
        "hires",
        "depth",
        "level_rank",
        "open_requisitions",
        "applications",
        "applications_active",
        "offers_outstanding",
        "offers_accepted",
        "offers_resolved",
        "offers_sent",
        "interviews_scheduled",
        "avg_req_load",
        "candidate_load",
        "active_applications",
        "direct_report_count",
        "participants",
        "completion",
        "control_total",
        "rows_received",
        "freshness_hours",
        "tests_failed",
        "items_answered",
        "tenure_months",
        "days_open",
        "hired",
        "terms_vol",
        "terms_invol",
        "promotions",
        "transfers",
        "internal_mobility",
        "manager_changes",
        "target_proficiency",
        "proficiency",
        "min_cell",
        "version",
    } or name.endswith("_count") or (name.endswith("_id") and name.startswith("gh_")):
        return "bigint"
    if name.endswith("_id") and name not in {"person_id", "worker_id", "org_id", "job_id", "location_id", "grade_id", "skill_id", "wave_id"}:
        if name in {"application_id", "requisition_id", "candidate_id", "interview_id", "scorecard_id", "offer_id", "comp_assignment_id", "training_event_id", "stage_id", "source_id", "rejection_reason_id", "hiring_manager_id", "recruiter_id", "recruiter_user_id", "close_reason_id", "job_interview_id", "interview_kit_id", "submitter_id", "interviewer_id"}:
            return "bigint"
    if name.endswith("_score") or name in {"score_mean", "final_score", "total_score", "self_score", "onet_importance", "base", "variable", "band_min", "band_mid", "band_max", "hours", "training_hours", "coverage_ratio", "compa_p25", "compa_p50", "compa_p75", "mean", "favorable_pct", "aging_p50_days"}:
        return "double precision"
    if any(token in name for token in ("ratio", "rate", "p25", "p50", "p90", "p75", "avg_", "mean", "pct", "hours")):
        return "double precision"
    if name in {"base", "variable", "band_min", "band_mid", "band_max", "control_total", "rows_received"}:
        return "bigint"
    return "text"


def _normalize_columns(cols: list, table_name: str) -> list[dict]:
    out: list[dict] = []
    seen = set()
    for col in cols or []:
        if isinstance(col, dict):
            name = col["name"]
            typ = col.get("type") or infer(name)
            out.append({"name": name, "type": typ})
            seen.add(name)
        else:
            out.append({"name": col, "type": infer(col)})
            seen.add(col)
    for name, typ in EXTRA.get(table_name, []):
        if name not in seen:
            out.append({"name": name, "type": typ})
    return out


def _stamp(path: Path) -> None:
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    for table in doc.get("tables") or []:
        table["columns"] = _normalize_columns(table.get("columns") or [], table["name"])
    path.write_text(yaml.dump(doc, sort_keys=False, allow_unicode=True, width=120), encoding="utf-8")
    print("stamped", path)


def main() -> int:
    _stamp(CANONICAL)
    if GOLD.exists():
        _stamp(GOLD)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
