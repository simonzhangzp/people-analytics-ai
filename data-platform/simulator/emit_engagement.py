from __future__ import annotations


def engagement_docs(transaction: dict) -> dict:
    keys = ("survey_wave", "survey_response")
    return {key: transaction[key] for key in keys if key in transaction}
