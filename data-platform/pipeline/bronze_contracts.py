from __future__ import annotations

"""Bronze objects must match ODCS contracts. No canonical bypass folders."""

from pathlib import Path

import yaml

DP = Path(__file__).resolve().parents[1]
INDEX = DP / "people_source_contracts" / "odcs" / "INDEX.yaml"
ALLOWED_SYSTEMS = {"frappe_hr", "greenhouse_v3", "engagement_ext", "microsoft_learn", "onet", "bls"}


def contract_objects() -> set[tuple[str, str]]:
    payload = yaml.safe_load(INDEX.read_text(encoding="utf-8"))
    out = set()
    for row in payload.get("contracts") or []:
        system = str(row["source_system"])
        obj = str(row["source_object"]).replace(" ", "_")
        out.add((system, obj))
    return out


def bronze_object_paths(root: Path) -> list[tuple[str, str, Path]]:
    found = []
    if not root.exists():
        return found
    for system_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        system = system_dir.name
        for obj_dir in sorted(p for p in system_dir.iterdir() if p.is_dir()):
            found.append((system, obj_dir.name, obj_dir))
    return found


def non_contract_bronze_objects(root: Path) -> list[str]:
    allowed = contract_objects()
    bad = []
    for system, obj, _path in bronze_object_paths(root):
        if system not in ALLOWED_SYSTEMS:
            bad.append(f"{system}/{obj}")
            continue
        if (system, obj) not in allowed:
            bad.append(f"{system}/{obj}")
    return bad
