from __future__ import annotations

"""Lake parquet sizes. Postgres bytes come from step 6a-3 (pg_total_relation_size × 20)."""

from pathlib import Path


def parquet_sizes(root: Path) -> dict[str, int]:
    out: dict[str, int] = {}
    if not root.exists():
        return out
    for path in root.rglob("*.parquet"):
        if path.stat().st_size <= 0:
            continue
        name = path.stem if path.stem != "part" else path.parent.name.split("=")[0]
        if path.name == "part.parquet":
            name = path.parent.name
            if name.startswith("month="):
                name = path.parent.parent.name
        out[name] = out.get(name, 0) + path.stat().st_size
    return out
