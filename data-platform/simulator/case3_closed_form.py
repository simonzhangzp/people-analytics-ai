from __future__ import annotations

"""Case 3 closed-form expected rates at full scale. No simulation."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent
BASE = ROOT / "scenario" / "baseline.yaml"
SCEN = ROOT / "scenario" / "scenarios" / "engineering_apac_attrition_rise.yaml"


def load() -> tuple[dict, dict]:
    return yaml.safe_load(BASE.read_text(encoding="utf-8")), yaml.safe_load(SCEN.read_text(encoding="utf-8"))


def mix_weights(pop: dict) -> list[tuple[str, str, str, float]]:
    regions = pop["region_mix"]
    tenures = pop["t0_tenure_mix"]
    families = pop["job_family_mix"]
    rows = []
    for family, pf in families.items():
        for region, pr in regions.items():
            for tenure, pt in tenures.items():
                rows.append((region, tenure, family, pr * pt * pf))
    return rows


def in_case3_slice(region: str, tenure: str, family: str, spec: dict) -> bool:
    target = spec["target"]
    if region != target["location_region"] or family != target["job_family"]:
        return False
    lo, hi = target["tenure_months"][:2]
    mid = {"<1y": 6, "1–3y": 24, "3–5y": 48, "5–10y": 84, "10y+": 144}[tenure]
    return lo <= mid < hi


def expected_rates() -> dict:
    baseline, spec = load()
    grid = baseline["attrition"]["hazard_voluntary_annual"]
    pop = baseline["population"]
    weights = mix_weights(pop)
    mult = float(spec["effect"]["hazard_multiplier"]["voluntary_separation"])
    eng_base = eng_scen = 0.0
    eng_w = 0.0
    apac13_base = apac13_scen = None
    slice_base = slice_scen = slice_w = 0.0
    for region, tenure, family, w in weights:
        haz = grid[family][region][tenure]
        m = mult if in_case3_slice(region, tenure, family, spec) else 1.0
        if family == "Engineering":
            eng_base += w * haz
            eng_scen += w * haz * m
            eng_w += w
        if region == "APAC" and tenure == "1–3y" and family == "Engineering":
            apac13_base = haz
            apac13_scen = haz * (mult if in_case3_slice(region, tenure, family, spec) else 1.0)
        if in_case3_slice(region, tenure, family, spec):
            slice_base += w * haz
            slice_scen += w * haz * m
            slice_w += w
    eng_base_r = eng_base / eng_w
    eng_scen_r = eng_scen / eng_w
    return {
        "scale": "full",
        "method": "closed_form_independent_mix",
        "mix": "baseline.population region_mix × t0_tenure_mix × job_family_mix (parameters)",
        "trailing_3m": "2026-06..2026-08 (after 3-month ramp; multiplier at plateau)",
        "engineering_overall": {
            "without_scenario": round(eng_base_r, 4),
            "with_scenario": round(eng_scen_r, 4),
            "delta_pp": round((eng_scen_r - eng_base_r) * 100, 2),
            "target_delta_pp": 2.0,
            "meets_target": (eng_scen_r - eng_base_r) >= 0.02,
        },
        "apac_engineering_1_3y": {
            "without_scenario": round(apac13_base, 4),
            "with_scenario": round(apac13_scen, 4),
            "ratio": round(apac13_scen / apac13_base, 4),
            "target_ratio": 2.0,
            "meets_target": abs((apac13_scen / apac13_base) - 2.0) < 0.01,
        },
        "slice": {
            "definition": "APAC × Engineering × tenure_months [0, 36) i.e. <1y and 1–3y",
            "hazard_multiplier": mult,
            "ramp_months": spec["effect"]["ramp_months"],
            "weight_within_population": round(slice_w, 4),
        },
    }


def main() -> int:
    import json

    payload = expected_rates()
    print(json.dumps(payload, indent=2))
    if not payload["engineering_overall"]["meets_target"]:
        return 1
    if not payload["apac_engineering_1_3y"]["meets_target"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
