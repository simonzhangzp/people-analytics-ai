from __future__ import annotations

"""Generate people_v2 DDL from canonical_model.yml + gold snaps/marts. Not inferred from parquet."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "people_mappings" / "canonical_model.yml"
GOLD = ROOT / "people_mappings" / "gold_model.yml"
OUT = ROOT / "serving" / "schemas" / "020_people_v2_canonical.sql"

SPECIAL = {
    "org_path": "ltree",
    "interviewer_person_ids": "text[]",
    "roles": "text[]",
    "products": "text[]",
}


def infer(name: str) -> str:
    if name in SPECIAL:
        return SPECIAL[name]
    if name.endswith("_at") or name in {"recorded_at", "submitted_at", "built_at"}:
        return "timestamptz"
    if name.endswith("_date") or name in {"month_end", "month_start", "valid_from", "valid_to"}:
        return "date"
    if name.endswith("_in_month") or name.startswith("is_") or name in {"open", "via_t1"}:
        return "boolean"
    if name in {"n", "headcount", "hires", "depth", "level_rank", "open_requisitions", "applications"} or name.endswith("_count") or (name.endswith("_id") and name.startswith("gh_")):
        return "bigint"
    if name.endswith("_score") or name in {"score_mean", "final_score", "total_score", "self_score"}:
        return "double precision"
    if any(token in name for token in ("ratio", "rate", "p25", "p50", "p90", "p75", "avg_", "mean", "pct", "hours")):
        return "double precision"
    if name in {"base", "variable", "band_min", "band_mid", "band_max", "control_total", "rows_received"}:
        return "bigint"
    return "text"


def tables() -> list[dict]:
    canon = yaml.safe_load(CANONICAL.read_text(encoding="utf-8"))
    gold = yaml.safe_load(GOLD.read_text(encoding="utf-8")) if GOLD.exists() else {"tables": []}
    return list(canon.get("tables") or []) + list(gold.get("tables") or [])


def render() -> str:
    lines = [
        "-- people_v2 silver/gold tables generated from canonical_model.yml + gold_model.yml.",
        "-- Do not reverse-engineer from parquet. Dedicated People project only.",
        "-- Schema/extension come from 019_people_v2_bootstrap.sql.",
        "",
    ]
    extra_idx = []
    for table in tables():
        name = table["name"]
        if table.get("postgres") is False:
            continue
        cols = table.get("columns") or []
        if not cols:
            continue
        lines.append(f"create table if not exists people_v2.{name} (")
        col_sql = [f"  {col} {infer(col)}" for col in cols]
        lines.append(",\n".join(col_sql))
        lines.append(");")
        key = table.get("key")
        if key and key in cols:
            extra_idx.append(f"create index if not exists {name}_{key}_idx on people_v2.{name} ({key});")
        if "month_end" in cols:
            extra_idx.append(f"create index if not exists {name}_month_end_idx on people_v2.{name} (month_end);")
        if "worker_id" in cols:
            extra_idx.append(f"create index if not exists {name}_worker_id_idx on people_v2.{name} (worker_id);")
        if "application_id" in cols:
            extra_idx.append(f"create index if not exists {name}_application_id_idx on people_v2.{name} (application_id);")
        if "org_path" in cols:
            extra_idx.append(f"create index if not exists {name}_org_path_idx on people_v2.{name} using gist (org_path);")
        lines.append("")
    lines.append("-- indexes")
    lines.extend(extra_idx)
    lines.append("")
    lines.append("create or replace view people_v2.people_evt_promotion as")
    lines.append("  select event_id as promotion_id, worker_id, event_date from people_v2.people_evt_worker where event_type = 'promotion';")
    lines.append("create or replace view people_v2.people_evt_transfer as")
    lines.append("  select event_id as transfer_id, worker_id, event_date from people_v2.people_evt_worker where event_type = 'transfer';")
    lines.append("create or replace view people_v2.people_evt_manager_change as")
    lines.append("  select worker_id, event_date from people_v2.people_evt_worker where event_type = 'manager_change';")
    lines.append("")
    return "\n".join(lines) + "\n"


def main() -> int:
    sql = render()
    OUT.write_text(sql, encoding="utf-8")
    print("wrote", OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
