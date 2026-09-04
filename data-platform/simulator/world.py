from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent
BASELINE_PATH = ROOT / "scenario" / "baseline.yaml"


def load_baseline(path: Path | None = None) -> dict:
    return yaml.safe_load((path or BASELINE_PATH).read_text(encoding="utf-8"))


@dataclass
class TinyWorld:
    """Deterministic miniature world for T1–T13 tests. Not the 80k backfill.

    Scale=1.0 management trees (leader → managers → IC, span ~7) live in
    simulator/engine.py + simulator/org_tree.py, not this fixture.
    """

    seed: int
    company: str = "GlobalTech"
    regions: tuple[str, ...] = ("AMER", "APAC")
    departments: tuple[str, ...] = ("Engineering - Platform", "Sales - Enterprise")
    designations: tuple[str, ...] = ("Software Developer", "Sales Manager")
    grades: tuple[str, ...] = ("G4", "G5")
    branches: dict[str, str] = field(
        default_factory=lambda: {"AMER-NYC": "AMER", "APAC-SIN": "APAC"}
    )
    employment_types: tuple[str, ...] = ("Regular", "Contingent", "Intern")
    existing_employee: str = "HR-EMP-000100"
    recruiter_employee: str = "HR-EMP-000200"


def tiny_world(seed: int = 20260301) -> TinyWorld:
    return TinyWorld(seed=seed)
