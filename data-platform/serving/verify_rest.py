from __future__ import annotations

"""Refuse QuantReview refs. v1 live REST is not part of the People v2 toolchain.

v2 Data API check: verify_people_v2_data_api.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402


def env(path: Path, name: str) -> str | None:
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        raw = line.strip()
        if raw.startswith(name + "="):
            return raw.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def main() -> None:
    url = env(Path(r"D:\Job_Application\.env.local"), "NEXT_PUBLIC_SUPABASE_URL")
    key = env(Path(r"D:\Job_Application\.env.local"), "NEXT_PUBLIC_SUPABASE_ANON_KEY")
    refuse_blocked(url, key)
    if not url or PEOPLE_REF not in url:
        raise SystemExit(f"refused: v1 .env.local is not People v2 ({PEOPLE_REF})")
    raise SystemExit("refused: v2 app must not use anon / service_role against people_v2")


if __name__ == "__main__":
    main()
