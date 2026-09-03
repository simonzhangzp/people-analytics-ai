from __future__ import annotations

"""GATE 1 coverage checker for people_v2 mappings.

Exit 0 only when every §5 canonical column is mapped, no UNJUSTIFIED
provenance exists, and E1–E7 are registered.
"""

import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent
SKIP_FILES = {"canonical_model.yml", "people_meta_attribute.yml", "people_meta_join_path.yml"}
SKIP_DIRS = {"archive_v1"}
ALLOWED_PROVENANCE = {
    "SOURCE_NATIVE",
    "SOURCE_NESTED",
    "SOURCE_GAP",
    "DERIVED",
    "CANONICAL_KEY",
    "SYNTHETIC_EXTENSION",
}
SUBMITTABLE_OBJECTS = {
    "Employee Transfer",
    "Employee Promotion",
    "Employee Separation",
    "Salary Structure Assignment",
    "Salary Structure",
    "Salary Slip",
    "Appraisal",
    "Training Event",
    "Training Result",
    "Training Feedback",
}
CHILD_DOCSTATUS_PARENTS = {
    "Employee Property History",
    "Training Event Employee",
    "Training Result Employee",
}
REQUIRED_EXTENSIONS = {"E1", "E2", "E3", "E4", "E5", "E6", "E7"}
REQUIRED_FIELD_KEYS = {
    "canonical_table",
    "canonical_field",
    "source_system",
    "source_object",
    "transformation",
    "nullable",
    "data_type",
    "effective_date_logic",
    "provenance",
    "business_definition",
}


def load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def canonical_columns(model: dict) -> set[tuple[str, str]]:
    cols: set[tuple[str, str]] = set()
    for table in model.get("tables") or []:
        name = table["name"]
        for col in table.get("columns") or []:
            cols.add((name, col))
    return cols


def mapping_files() -> list[Path]:
    files = []
    for path in sorted(ROOT.glob("*.yml")):
        if path.name in SKIP_FILES:
            continue
        files.append(path)
    return files


def collect_fields(files: list[Path]) -> tuple[list[dict], list[str]]:
    rows: list[dict] = []
    errors: list[str] = []
    for path in files:
        payload = load_yaml(path)
        fields = payload.get("fields") or []
        if not isinstance(fields, list):
            errors.append(f"{path.name}: fields is not a list")
            continue
        for idx, field in enumerate(fields):
            if not isinstance(field, dict):
                errors.append(f"{path.name}[{idx}]: field is not a mapping")
                continue
            missing = REQUIRED_FIELD_KEYS - set(field)
            if missing:
                errors.append(f"{path.name}[{idx}] {field.get('canonical_table')}.{field.get('canonical_field')}: missing {sorted(missing)}")
            if "source_field" not in field and "source_fields" not in field:
                errors.append(
                    f"{path.name}[{idx}] {field.get('canonical_table')}.{field.get('canonical_field')}: need source_field or source_fields"
                )
            prov = field.get("provenance")
            if prov == "UNJUSTIFIED":
                errors.append(
                    f"{path.name}[{idx}] {field.get('canonical_table')}.{field.get('canonical_field')}: provenance UNJUSTIFIED"
                )
            elif prov not in ALLOWED_PROVENANCE:
                errors.append(
                    f"{path.name}[{idx}] {field.get('canonical_table')}.{field.get('canonical_field')}: unknown provenance {prov}"
                )
            if field.get("transformation") in {None, ""}:
                errors.append(
                    f"{path.name}[{idx}] {field.get('canonical_table')}.{field.get('canonical_field')}: empty transformation"
                )
            obj = field.get("source_object")
            if obj in SUBMITTABLE_OBJECTS:
                filt = str(field.get("source_filter") or "")
                if "docstatus = 1" not in filt:
                    errors.append(
                        f"{path.name}[{idx}] {field.get('canonical_table')}.{field.get('canonical_field')}: submittable {obj} missing source_filter docstatus = 1 (BR-DQ-001)"
                    )
            if obj in CHILD_DOCSTATUS_PARENTS:
                filt = str(field.get("source_filter") or "")
                if "docstatus = 1" not in filt:
                    errors.append(
                        f"{path.name}[{idx}] {field.get('canonical_table')}.{field.get('canonical_field')}: child {obj} missing parent docstatus = 1 (BR-DQ-001)"
                    )
            rows.append({**field, "_file": path.name})
    return rows, errors


def main() -> int:
    model_path = ROOT / "canonical_model.yml"
    if not model_path.exists():
        print("missing canonical_model.yml")
        return 1
    required = canonical_columns(load_yaml(model_path))
    files = mapping_files()
    rows, errors = collect_fields(files)
    mapped = {
        (row.get("canonical_table"), row.get("canonical_field"))
        for row in rows
        if row.get("canonical_table") and row.get("canonical_field")
    }
    missing = sorted(required - mapped)
    extra_note = sorted(
        {
            (t, c)
            for t, c in mapped
            if t not in {table for table, _ in required} and t not in {"people_bronze", "people_meta_extract_run"}
        }
    )
    if missing:
        for table, col in missing:
            errors.append(f"UNMAPPED {table}.{col}")
    synth_path = ROOT / "synthetic_extensions.yml"
    if not synth_path.exists():
        errors.append("missing synthetic_extensions.yml")
    else:
        extensions = {item.get("id") for item in (load_yaml(synth_path).get("extensions") or [])}
        missing_ext = sorted(REQUIRED_EXTENSIONS - extensions)
        if missing_ext:
            errors.append(f"missing synthetic extensions {missing_ext}")
        else:
            print("synthetic_extensions_ok", sorted(extensions))
    print("canonical_columns", len(required))
    print("mapping_files", len(files))
    print("mapping_rows", len(rows))
    print("mapped_canonical", len(required & mapped))
    if extra_note:
        print("non_canonical_tables_ok", extra_note[:12])
    if errors:
        print("coverage_failed", len(errors))
        for line in errors[:80]:
            print(" ", line)
        if len(errors) > 80:
            print(f"  … {len(errors) - 80} more")
        return 1
    print("coverage_ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
