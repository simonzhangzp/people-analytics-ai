from __future__ import annotations


def frappe_docs(transaction: dict) -> dict:
    keys = (
        "employee",
        "employee_transfer",
        "employee_promotion",
        "employee_separation",
        "salary_structure_assignment",
        "appraisal",
        "appraisal_cycle",
    )
    return {key: transaction[key] for key in keys if key in transaction}
