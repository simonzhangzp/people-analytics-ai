from __future__ import annotations

"""Metric YAML checks: expected_range present; BR-DQ-005 window_aligned on hot-window grains."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
METRICS = ROOT / "people_metrics"

HOT_WINDOW_TABLES = {
    "people_fact_application",
    "people_evt_application_stage",
    "people_fact_interview",
    "people_fact_scorecard",
    "people_dim_candidate",
}


def load_metrics() -> list[dict]:
    rows = []
    for path in sorted(METRICS.glob("*.yml")):
        body = yaml.safe_load(path.read_text(encoding="utf-8"))
        body["_path"] = str(path)
        rows.append(body)
    return rows


def validate_metrics(rows: list[dict] | None = None) -> list[str]:
    rows = rows if rows is not None else load_metrics()
    errors = []
    for body in rows:
        mid = body.get("metric_id")
        rng = body.get("expected_range")
        if not (isinstance(rng, (list, tuple)) and len(rng) == 2):
            errors.append(f"{mid}: missing expected_range [lo, hi]")
        else:
            lo, hi = rng
            if lo is None or hi is None or float(lo) > float(hi):
                errors.append(f"{mid}: invalid expected_range {rng}")
        sources = set(body.get("sources") or [])
        grain = body.get("grain")
        if grain:
            sources.add(grain)
        hot = sources & HOT_WINDOW_TABLES
        if hot and not body.get("window_aligned"):
            errors.append(f"{mid}: BR-DQ-005 requires window_aligned: true when referencing {sorted(hot)}")
    return errors
