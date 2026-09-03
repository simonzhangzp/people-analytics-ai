from __future__ import annotations

"""Write compact Harvest v3 field lists from the already-pinned OpenAPI file."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OPENAPI = ROOT / "greenhouse_v3" / "openapi" / "harvest_v3.openapi.json"
KEYS = {
    "application_stage",
    "application",
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
    "demographic_answer",
    "demographic_question",
    "demographic_question_set",
    "demographic_answer_option",
}


def main() -> None:
    openapi = json.loads(OPENAPI.read_text(encoding="utf-8"))
    components = (openapi.get("components") or {}).get("schemas") or {}
    out_dir = ROOT / "greenhouse_v3" / "schemas" / "fields"
    out_dir.mkdir(parents=True, exist_ok=True)
    extracted = {}
    for key, schema in components.items():
        if key in KEYS or any(token in key.lower() for token in ("demographic", "scorecard", "eeoc", "rejection")):
            extracted[key] = schema
    (ROOT / "greenhouse_v3" / "schemas" / "extracted_components.json").write_text(
        json.dumps(extracted, indent=2), encoding="utf-8"
    )
    for key in sorted(KEYS):
        schema = components.get(key)
        if not schema:
            print("missing component", key)
            continue
        props = schema.get("properties") or {}
        payload = {
            "source_system": "greenhouse_v3",
            "source_object": key,
            "harvest_path_hint": f"/v3/{key}s" if not key.endswith("s") else f"/v3/{key}",
            "fields": [
                {
                    "name": name,
                    "type": spec.get("type") if isinstance(spec, dict) else None,
                    "format": spec.get("format") if isinstance(spec, dict) else None,
                    "description": spec.get("description") if isinstance(spec, dict) else None,
                }
                for name, spec in props.items()
            ],
        }
        (out_dir / f"{key}.fields.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(key, len(payload["fields"]))


if __name__ == "__main__":
    main()
