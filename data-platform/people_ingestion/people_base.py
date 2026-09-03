from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol
from uuid import uuid4

import pandas as pd


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class PeopleRunRecord:
    source: str
    run_id: str = field(default_factory=lambda: str(uuid4()))
    started_at: datetime = field(default_factory=utcnow)
    completed_at: datetime | None = None
    status: str = "running"
    records_received: int = 0
    records_written: int = 0
    records_rejected: int = 0
    source_max_timestamp: datetime | None = None
    error_message: str | None = None
    estimated_api_cost: float = 0.0
    bronze_path: str | None = None
    silver_path: str | None = None
    as_of_date: str | None = None

    def finish(self, status: str, error: str | None = None) -> None:
        self.status = status
        self.completed_at = utcnow()
        self.error_message = error


class PeopleSourceConnector(Protocol):
    source_name: str

    def fetch(self) -> dict[str, pd.DataFrame]:
        ...

    def validate(self, tables: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        ...

    def write_bronze(self, tables: dict[str, pd.DataFrame]) -> str:
        ...

    def normalize(self, tables: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        ...

    def write_silver(self, tables: dict[str, pd.DataFrame]) -> str:
        ...

    def record_run(self, run: PeopleRunRecord) -> None:
        ...
