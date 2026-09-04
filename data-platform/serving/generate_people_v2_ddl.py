from __future__ import annotations

"""Generate people_v2 DDL from canonical_model.yml + gold snaps/marts. Types come from YAML type fields."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "people_mappings" / "canonical_model.yml"
GOLD = ROOT / "people_mappings" / "gold_model.yml"
OUT = ROOT / "serving" / "schemas" / "020_people_v2_canonical.sql"


def column_spec(col) -> tuple[str, str]:
    if not isinstance(col, dict) or "name" not in col or "type" not in col:
        raise ValueError(f"column must be {{name, type}}, got {col!r}")
    name = str(col["name"])
    typ = str(col["type"]).strip()
    if not name or not typ:
        raise ValueError(f"empty name/type in {col!r}")
    return name, typ


def tables() -> list[dict]:
    canon = yaml.safe_load(CANONICAL.read_text(encoding="utf-8"))
    gold = yaml.safe_load(GOLD.read_text(encoding="utf-8")) if GOLD.exists() else {"tables": []}
    return list(canon.get("tables") or []) + list(gold.get("tables") or [])


def event_views() -> str:
    return "\n".join(
        [
            "create or replace view people_v2.people_evt_promotion as",
            "  select event_id as promotion_id, worker_id, event_date from people_v2.people_evt_worker where event_type = 'promotion';",
            "create or replace view people_v2.people_evt_transfer as",
            "  select event_id as transfer_id, worker_id, event_date from people_v2.people_evt_worker where event_type = 'transfer';",
            "create or replace view people_v2.people_evt_manager_change as",
            "  select worker_id, event_date from people_v2.people_evt_worker where event_type = 'manager_change';",
            "",
        ]
    )


def render() -> str:
    lines = [
        "-- people_v2 silver/gold tables generated from canonical_model.yml + gold_model.yml.",
        "-- Column types are the YAML `type` field. Do not infer from parquet or ALTER after load.",
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
        specs = [column_spec(col) for col in cols]
        col_names = [c[0] for c in specs]
        lines.append(f"create table if not exists people_v2.{name} (")
        lines.append(",\n".join(f"  {cname} {ctype}" for cname, ctype in specs))
        lines.append(");")
        key = table.get("key")
        if key and key in col_names:
            extra_idx.append(f"create index if not exists {name}_{key}_idx on people_v2.{name} ({key});")
        if "month_end" in col_names:
            extra_idx.append(f"create index if not exists {name}_month_end_idx on people_v2.{name} (month_end);")
        if "worker_id" in col_names:
            extra_idx.append(f"create index if not exists {name}_worker_id_idx on people_v2.{name} (worker_id);")
        if "application_id" in col_names:
            extra_idx.append(f"create index if not exists {name}_application_id_idx on people_v2.{name} (application_id);")
        if "org_path" in col_names:
            extra_idx.append(f"create index if not exists {name}_org_path_idx on people_v2.{name} using gist (org_path);")
        lines.append("")
    lines.append("-- indexes")
    lines.extend(extra_idx)
    lines.append("")
    lines.append(event_views())
    return "\n".join(lines) + "\n"


def main() -> int:
    sql = render()
    OUT.write_text(sql, encoding="utf-8")
    print("wrote", OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
