from __future__ import annotations

"""Write one business-day source-shaped payload set for GATE 2 review."""

import json
from datetime import date
from pathlib import Path

from transactions import run_all_transactions
from world import tiny_world

OUT = Path(__file__).resolve().parent / "fixtures" / "one_business_day"


def main() -> int:
    day = date(2026, 4, 8)
    world = tiny_world()
    payload = run_all_transactions(day, world)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "business_day.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    for code, objects in payload.items():
        (OUT / f"{code}.json").write_text(json.dumps(objects, indent=2), encoding="utf-8")
    print("wrote", OUT, "transactions", sorted(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
