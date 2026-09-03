from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PACKAGE_ROOT.parent
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

from people_refs import (  # noqa: E402
    PEOPLE_REF,
    PROD_REF,
    QUANTREVIEW_STAGING_REF,
    assert_people_ref,
    refuse_blocked,
)


def env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is not None and value.strip():
        return value.strip()
    return default


def env_file_value(path: Path, name: str) -> str | None:
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#"):
            continue
        if raw.startswith(name + "=") or raw.startswith(name + " ="):
            return raw.split("=", 1)[1].strip().strip('"').strip("'")
    return None


@dataclass(frozen=True)
class PeopleConfig:
    lake_root: Path
    as_of: date
    seed: int
    active_headcount: int
    terminated_headcount: int
    monthly_paid_budget_usd: float
    paid_hard_stop_usd: float
    demo_incident: str | None
    supabase_ref: str
    bls_api_key: str | None
    remote_lake_host: str | None
    remote_lake_path: str | None

    @property
    def history_start(self) -> date:
        return date(self.as_of.year - 5, self.as_of.month, 1)


def default_lake_root() -> Path:
    configured = env("PEOPLE_LAKE_ROOT")
    if configured:
        return Path(configured)
    return PACKAGE_ROOT / "lake"


def load_people_config() -> PeopleConfig:
    as_of_raw = env("PEOPLE_AS_OF_DATE", date.today().isoformat())
    incident = env("PEOPLE_DEMO_INCIDENT", "apac_hris_incomplete")
    if incident in {"", "none", "off"}:
        incident = None
    ref = env("PEOPLE_SUPABASE_REF", PEOPLE_REF)
    refuse_blocked(ref)
    return PeopleConfig(
        lake_root=default_lake_root(),
        as_of=date.fromisoformat(as_of_raw),
        seed=int(env("PEOPLE_SYNTHETIC_SEED", "20260830")),
        active_headcount=int(env("PEOPLE_SYNTHETIC_ACTIVE_HEADCOUNT", "50000")),
        terminated_headcount=int(env("PEOPLE_SYNTHETIC_TERMINATED_HEADCOUNT", "30000")),
        monthly_paid_budget_usd=float(env("PEOPLE_MONTHLY_PAID_DATA_BUDGET_USD", "30")),
        paid_hard_stop_usd=float(env("PEOPLE_PAID_DATA_HARD_STOP_USD", "28")),
        demo_incident=incident,
        supabase_ref=assert_people_ref(ref),
        bls_api_key=env("BLS_API_KEY")
        or env_file_value(Path(r"D:\EdgeAI_Strategy\.env"), "BLS_API_KEY"),
        remote_lake_host=env("PEOPLE_REMOTE_LAKE_HOST", "edgeai@37.27.107.154"),
        remote_lake_path=env("PEOPLE_REMOTE_LAKE_PATH", "/home/edgeai/people-lake"),
    )
