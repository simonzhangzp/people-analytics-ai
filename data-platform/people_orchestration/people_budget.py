from __future__ import annotations

from datetime import date

from people_ingestion.people_config import PeopleConfig
from people_metadata.people_serving import execute


class PeoplePaidBudgetExceeded(RuntimeError):
    pass


def people_month_start(as_of: date) -> date:
    return date(as_of.year, as_of.month, 1)


def people_estimated_spend(as_of: date) -> float:
    rows = execute(
        """
        select coalesce(sum(estimated_cost), 0)
        from public.people_api_usage
        where period_month = %s
        """,
        (people_month_start(as_of),),
    )
    return float(rows[0][0]) if rows else 0.0


def people_assert_paid_budget(config: PeopleConfig, estimated_call_cost: float) -> None:
    spent = people_estimated_spend(config.as_of)
    if spent + estimated_call_cost >= config.paid_hard_stop_usd:
        raise PeoplePaidBudgetExceeded(
            f"Paid People data spend {spent} plus {estimated_call_cost} "
            f"reaches hard stop {config.paid_hard_stop_usd}"
        )


def people_record_api_usage(
    provider: str,
    as_of: date,
    requests: int,
    records: int,
    estimated_cost: float,
) -> None:
    execute(
        """
        insert into public.people_api_usage (
          provider, period_month, requests, records, estimated_cost, hard_limit, last_call_at
        )
        values (%s, %s, %s, %s, %s, 28, now())
        on conflict (provider, period_month) do update
        set requests = people_api_usage.requests + excluded.requests,
            records = people_api_usage.records + excluded.records,
            estimated_cost = people_api_usage.estimated_cost + excluded.estimated_cost,
            last_call_at = now()
        """,
        (provider, people_month_start(as_of), requests, records, estimated_cost),
    )
