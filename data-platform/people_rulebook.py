from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent
RULES_PATH = ROOT / "people_business_rules.yaml"


@lru_cache(maxsize=1)
def get_rules() -> dict:
    payload = yaml.safe_load(RULES_PATH.read_text(encoding="utf-8"))
    return payload["rules"]


def rule(rule_id: str) -> dict:
    return get_rules()[rule_id]


def params(rule_id: str) -> dict:
    return dict(rule(rule_id).get("params") or {})


def certified_status() -> frozenset[str]:
    return frozenset(params("BR-WF-001")["status"]["include"])


def certified_employment_types() -> frozenset[str]:
    return frozenset(params("BR-WF-001")["employment_type"]["certified"])


def separate_employment_types() -> frozenset[str]:
    return frozenset(params("BR-WF-001")["employment_type"]["separate_line"])


def e6_map() -> dict[str, str]:
    return dict(params("BR-RET-001")["reason_to_category"])


def volume_test_ratio() -> float:
    return float(params("BR-DQ-003")["volume_test_ratio"])


def regrettable_threshold() -> float:
    return float(params("BR-RET-002")["threshold"])
