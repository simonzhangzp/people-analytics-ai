from __future__ import annotations


def harvest_docs(transaction: dict) -> dict:
    keys = (
        "offer",
        "application",
        "opening",
        "candidate",
        "user",
        "interview",
        "scorecard",
        "application_stages",
    )
    return {key: transaction[key] for key in keys if key in transaction}
