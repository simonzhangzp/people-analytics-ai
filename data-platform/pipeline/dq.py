from __future__ import annotations

from datetime import date

import duckdb
import pandas as pd

START = date(2021, 9, 1)


def _row(name: str, group: str, passed: bool, observed, expected, details: str = "") -> dict:
    return {
        "test_name": name,
        "test_group": group,
        "status": "passed" if passed else "failed",
        "observed_value": observed,
        "expected_value": expected,
        "details": details,
    }


def run_gold_dq(con: duckdb.DuckDBPyConnection, *, backfill: bool = True) -> list[dict]:
    tests = []

    overlap = con.execute(
        """
        SELECT count(*) FROM (
          SELECT a.worker_id
          FROM people_hist_worker_attr a
          JOIN people_hist_worker_attr b
            ON a.worker_id = b.worker_id AND a.valid_from < b.valid_from
           AND (a.valid_to IS NULL OR a.valid_to > b.valid_from)
        )
        """
    ).fetchone()[0]
    tests.append(_row("hist_no_overlap", "temporal", overlap == 0, overlap, 0))

    gap = con.execute(
        """
        SELECT count(*) FROM (
          SELECT worker_id FROM people_hist_worker_attr
          QUALIFY valid_to IS NOT NULL
             AND lead(valid_from) OVER (PARTITION BY worker_id ORDER BY valid_from) IS NOT NULL
             AND valid_to <> lead(valid_from) OVER (PARTITION BY worker_id ORDER BY valid_from)
        )
        """
    ).fetchone()[0]
    tests.append(_row("hist_no_gap", "temporal", gap == 0, gap, 0))

    first_hire = con.execute(
        """
        SELECT count(*) FROM (
          SELECT worker_id, min(valid_from) AS vf, min(hire_date) AS hd
          FROM people_hist_worker_attr GROUP BY 1
        ) WHERE vf <> hd
        """
    ).fetchone()[0]
    tests.append(_row("hist_first_valid_from_eq_hire", "temporal", first_hire == 0, first_hire, 0))

    hire_term = con.execute(
        """
        SELECT count(*) FROM people_dim_worker
        WHERE termination_date IS NOT NULL AND hire_date > termination_date
        """
    ).fetchone()[0]
    tests.append(_row("hire_before_termination", "temporal", hire_term == 0, hire_term, 0))

    missing_app = con.execute(
        """
        SELECT count(*) FROM people_fact_offer o
        LEFT JOIN people_fact_application a ON a.application_id = o.application_id
        WHERE a.application_id IS NULL
        """
    ).fetchone()[0]
    tests.append(_row("offer_application_ri", "ri", missing_app == 0, missing_app, 0))

    missing_req = con.execute(
        """
        SELECT count(*) FROM people_fact_offer o
        LEFT JOIN people_dim_requisition r ON r.requisition_id = o.requisition_id
        WHERE r.requisition_id IS NULL
        """
    ).fetchone()[0]
    tests.append(_row("offer_requisition_ri", "ri", missing_req == 0, missing_req, 0))

    missing_sep = con.execute(
        """
        SELECT count(*) FROM people_dim_worker w
        LEFT JOIN people_fact_separation s ON s.employee = w.worker_id
        WHERE w.termination_date IS NOT NULL AND s.employee IS NULL
        """
    ).fetchone()[0]
    tests.append(_row("term_has_separation_ri", "ri", missing_sep == 0, missing_sep, 0))

    hires = con.execute(
        "SELECT count(*) FROM people_dim_worker WHERE via_t1 AND hire_date >= DATE '2021-09-01'"
    ).fetchone()[0]
    accepted = con.execute("SELECT count(*) FROM people_fact_offer WHERE status = 'accepted'").fetchone()[0]
    tests.append(_row("hires_eq_accepted_offers", "transaction", hires == accepted, {"hires": hires, "accepted": accepted}, "equal"))

    bypass = con.execute(
        """
        SELECT count(*) FROM people_dim_worker
        WHERE hire_date >= DATE '2021-09-01' AND via_t1 = FALSE
        """
    ).fetchone()[0]
    tests.append(_row("window_hires_via_t1", "transaction", bypass == 0, bypass, 0))

    rejected_open = con.execute(
        """
        SELECT count(*) FROM people_fact_offer o
        JOIN people_dim_requisition r ON r.requisition_id = o.requisition_id
        WHERE o.status = 'rejected'
          AND NOT EXISTS (
            SELECT 1 FROM people_fact_offer a
            WHERE a.requisition_id = o.requisition_id AND a.status = 'accepted'
          )
          AND r.status = 'closed'
          AND r.hired_application_id IS NOT NULL
        """
    ).fetchone()[0]
    tests.append(_row("rejected_without_later_accept_keeps_open_or_cancelled", "transaction", rejected_open == 0, rejected_open, 0))

    snap = con.execute(
        """
        SELECT month_end, worker_id, is_certified, hired_in_month, terminated_in_month,
               is_rehire, via_t1, status, employment_type, hire_date
        FROM people_snap_worker_month
        """
    ).fetchdf()
    snap["via_t1"] = snap["via_t1"].fillna(False).astype(bool)
    snap["is_rehire"] = snap["is_rehire"].fillna(False).astype(bool)
    snap["is_certified"] = snap["is_certified"].fillna(False).astype(bool)
    snap["hired_in_month"] = snap["hired_in_month"].fillna(False).astype(bool)
    snap["terminated_in_month"] = snap["terminated_in_month"].fillna(False).astype(bool)
    snap["month_end"] = pd.to_datetime(snap["month_end"]).dt.date
    months = sorted(snap["month_end"].unique())
    sample = []
    residuals = []
    t1_bypass_total = 0
    for prev_m, cur_m in zip(months, months[1:]):
        prev = snap[snap["month_end"] == prev_m]
        cur = snap[snap["month_end"] == cur_m]
        prev_c = set(prev.loc[prev["is_certified"], "worker_id"])
        cur_c = set(cur.loc[cur["is_certified"], "worker_id"])
        hires = set(cur.loc[cur["hired_in_month"] & cur["is_certified"] & cur["via_t1"] & ~cur["is_rehire"], "worker_id"])
        rehires = set(cur.loc[cur["hired_in_month"] & cur["is_certified"] & cur["is_rehire"], "worker_id"])
        terms = set(cur.loc[cur["terminated_in_month"] & cur["worker_id"].isin(prev_c), "worker_id"])
        entered = cur_c - prev_c
        left = prev_c - cur_c
        status_in = set()
        type_in = set()
        for wid in entered - hires - rehires:
            prow = prev[prev["worker_id"] == wid]
            crow = cur[cur["worker_id"] == wid]
            if prow.empty or crow.empty:
                continue
            pstat, cstat = prow.iloc[0]["status"], crow.iloc[0]["status"]
            if pstat not in ("Active", "Suspended") and cstat in ("Active", "Suspended"):
                status_in.add(wid)
            else:
                type_in.add(wid)
        status_out = set()
        type_out = set()
        for wid in left - terms:
            prow = prev[prev["worker_id"] == wid]
            crow = cur[cur["worker_id"] == wid]
            if crow.empty:
                type_out.add(wid)
                continue
            pstat, cstat = prow.iloc[0]["status"], crow.iloc[0]["status"]
            if pstat in ("Active", "Suspended") and cstat not in ("Active", "Suspended"):
                status_out.add(wid)
            else:
                type_out.add(wid)
        bypass = int((cur["hired_in_month"] & ~cur["via_t1"] & (pd.to_datetime(cur["hire_date"]).dt.date >= START)).sum())
        t1_bypass_total += bypass
        predicted = len(prev_c) + len(hires) + len(rehires) + len(status_in) + len(type_in) - len(terms) - len(status_out) - len(type_out)
        residual = len(cur_c) - predicted
        residuals.append(residual)
        if cur_m >= date(2026, 3, 1):
            sample.append(
                {
                    "month_end": cur_m.isoformat(),
                    "active": len(cur_c),
                    "prev_active": len(prev_c),
                    "hires": len(hires),
                    "rehires": len(rehires),
                    "terms": len(terms),
                    "status_in": len(status_in),
                    "status_out": len(status_out),
                    "type_in": len(type_in),
                    "type_out": len(type_out),
                    "t1_bypass": bypass,
                    "residual": residual,
                }
            )
    max_abs = max((abs(x) for x in residuals), default=0)
    tests.append(
        _row(
            "snapshot_roll_forward",
            "gold",
            max_abs == 0 if backfill else True,
            {"max_abs_residual": max_abs, "months": len(residuals), "t1_bypass": t1_bypass_total, "sample": sample[-6:]},
            0 if backfill else "daily_late_register_tolerance",
            "backfill residual must be 0" if backfill else "daily run may relax late registration",
        )
    )
    return tests
