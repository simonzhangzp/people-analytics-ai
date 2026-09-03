from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq


class PeopleLakeStore:
    """Local filesystem lake. Swap this class later for S3/R2/Supabase Storage."""

    def __init__(self, root: Path):
        self.root = Path(root)
        for name in (
            "people_bronze",
            "people_silver",
            "people_gold",
            "people_archive",
            "people_logs",
            "people_metadata",
        ):
            (self.root / name).mkdir(parents=True, exist_ok=True)

    def partition(self, layer: str, source: str, extract_date: date, *parts: str) -> Path:
        path = (
            self.root
            / layer
            / source
            / f"year={extract_date.year}"
            / f"month={extract_date.month:02d}"
            / f"day={extract_date.day:02d}"
        )
        for part in parts:
            path = path / part
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def write_parquet(self, path: Path, frame: pd.DataFrame) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            path.unlink()
        table = pa.Table.from_pandas(frame, preserve_index=False)
        pq.write_table(table, path, compression="zstd")
        return path

    def read_parquet(self, path: Path) -> pd.DataFrame:
        return pd.read_parquet(path)

    def write_json(self, path: Path, payload: object) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, default=str), encoding="utf-8")
        return path

    def write_bytes(self, path: Path, data: bytes) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def latest_parquet(self, layer: str, source: str, name: str) -> Path | None:
        matches = sorted(self.root.glob(f"{layer}/{source}/**/{name}"))
        return matches[-1] if matches else None
