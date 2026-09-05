from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from people_layer.inject import load_people_rules, people_rule_files

EXPECTED_RULES = {
    "people-domain",
    "people-employee-id",
    "people-snapshot-date",
    "people-headcount-sum",
    "people-direct-answers",
    "people-attrition-default",
    "people-next-cuts",
    "people-executive-story",
}


def test_people_rules_are_seeded() -> None:
    files = people_rule_files()
    titles = {path.stem for path in files}
    assert titles == EXPECTED_RULES
    rules = load_people_rules()
    assert len(rules) == 8
    assert any("SUM(headcount)" in rule["body"] for rule in rules)
    assert any("provisional" in rule["body"].lower() for rule in rules)
    assert all(len(rule["body"]) <= 350 for rule in rules)
    assert all(len(rule["description"]) <= 100 for rule in rules)
    assert all(rule["meta"].get("alwaysApply") == "true" for rule in rules)


if __name__ == "__main__":
    test_people_rules_are_seeded()
    print("people rules ok")
