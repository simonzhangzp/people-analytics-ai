from __future__ import annotations

import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / "people_mappings"
METRICS = ROOT / "people_metrics"
RULES = ROOT / "people_business_rules.yaml"
ODCS_INDEX = ROOT / "people_source_contracts" / "odcs" / "INDEX.yaml"


def load_meta(conn) -> None:
    with conn.cursor() as cur:
        attr = yaml.safe_load((MAP / "people_meta_attribute.yml").read_text(encoding="utf-8"))
        for row in attr.get("fields") or []:
            cur.execute(
                """
                insert into people_v2.people_meta_attribute
                  (entity_id, attribute_id, provenance, sensitivity, pii_class, nullable, business_definition)
                values (%s,%s,%s,%s,%s,%s,%s)
                on conflict (entity_id, attribute_id) do update set
                  provenance = excluded.provenance,
                  business_definition = excluded.business_definition
                """,
                [
                    row["canonical_table"],
                    row["canonical_field"],
                    row.get("provenance"),
                    row.get("sensitivity"),
                    row.get("pii_class"),
                    row.get("nullable"),
                    row.get("business_definition"),
                ],
            )
        joins = yaml.safe_load((MAP / "people_meta_join_path.yml").read_text(encoding="utf-8"))
        for row in joins.get("denied") or []:
            cur.execute(
                """
                insert into people_v2.people_meta_join_path
                  (path_id, from_entity, to_entity, via, allowed, rule_id, notes)
                values (%s,%s,%s,%s,false,%s,%s)
                on conflict (path_id) do update set notes = excluded.notes
                """,
                [
                    row["id"],
                    row.get("from"),
                    ",".join(row.get("to") or []),
                    ",".join(row.get("via") or []),
                    row.get("rule"),
                    "denied join",
                ],
            )
        rules = yaml.safe_load(RULES.read_text(encoding="utf-8"))
        for rule_id, body in (rules.get("rules") or {}).items():
            cur.execute(
                """
                insert into people_v2.people_business_rule (rule_id, domain, kind, statement, params)
                values (%s,%s,%s,%s,%s::jsonb)
                on conflict (rule_id) do update set statement = excluded.statement, params = excluded.params
                """,
                [
                    rule_id,
                    body.get("domain"),
                    body.get("kind"),
                    body.get("statement"),
                    json.dumps(body.get("params") or {}),
                ],
            )
        for path in sorted(METRICS.glob("*.yml")):
            metric = yaml.safe_load(path.read_text(encoding="utf-8"))
            metric_id = metric["metric_id"]
            cur.execute(
                """
                insert into people_v2.people_metric
                  (metric_id, grain_table, numerator, denominator, min_cell, sensitivity, status, yaml_path)
                values (%s,%s,%s,%s,%s,%s,%s,%s)
                on conflict (metric_id) do update set grain_table = excluded.grain_table, yaml_path = excluded.yaml_path
                """,
                [
                    metric_id,
                    metric.get("grain"),
                    (metric.get("numerator") or {}).get("expression"),
                    (metric.get("denominator") or {}).get("expression"),
                    metric.get("min_cell"),
                    metric.get("sensitivity"),
                    metric.get("status"),
                    str(path.relative_to(ROOT)).replace("\\", "/"),
                ],
            )
            cur.execute(
                """
                insert into people_v2.people_metric_version (metric_id, version, effective_from)
                values (%s, 1, date '2026-09-02')
                on conflict do nothing
                """,
                [metric_id],
            )
            cur.execute(
                """
                insert into people_v2.people_metric_health (metric_id, status, reason)
                values (%s, 'healthy', 'v1 published')
                on conflict (metric_id) do update set status = excluded.status
                """,
                [metric_id],
            )
        for test_name, group in (
            ("hist_no_overlap", "temporal"),
            ("hist_no_gap", "temporal"),
            ("hist_first_valid_from_eq_hire", "temporal"),
            ("hires_eq_accepted_offers", "transaction"),
            ("snapshot_roll_forward", "gold"),
            ("hist_attr_switch_has_evt_worker_change", "gold"),
            ("evt_worker_change_has_hist_attr_switch", "gold"),
        ):
            cur.execute(
                """
                insert into people_v2.people_quality_test (test_name, test_group, blocking)
                values (%s,%s,true)
                on conflict (test_name) do nothing
                """,
                [test_name, group],
            )
        cur.execute(
            """
            insert into people_v2.people_lineage (lineage_id, from_object, to_object, via, note)
            values
              ('employee_to_hist', 'frappe_hr.Employee', 'people_hist_worker_attr', 'SCD2 versions', 'BR-WF-008'),
              ('ph_to_change', 'frappe_hr.Employee Property History', 'people_evt_worker_change', 'SOURCE_NESTED', 'T2/T3'),
              ('extract_to_change', 'frappe_hr.Employee', 'people_evt_worker_change', 'extract diff', 'BR-WF-007 T7'),
              ('eeoc_to_mart', 'people_fact_candidate_eeoc_restricted', 'people_mart_applicant_flow', 'suppress min cell 10', 'lake-only fact')
            on conflict (lineage_id) do nothing
            """
        )
        if ODCS_INDEX.exists():
            index = yaml.safe_load(ODCS_INDEX.read_text(encoding="utf-8"))
            for row in index.get("contracts") or index.get("objects") or []:
                if not isinstance(row, dict):
                    continue
                cid = row.get("id") or row.get("file") or row.get("object")
                if not cid:
                    continue
                cur.execute(
                    """
                    insert into people_v2.people_contract (contract_id, source_system, source_object, odcs_file)
                    values (%s,%s,%s,%s)
                    on conflict (contract_id) do nothing
                    """,
                    [str(cid), row.get("source_system"), row.get("source_object"), row.get("file")],
                )
    conn.commit()
    load_serving_control(conn)
    print("loaded_people_v2_meta")


def load_serving_control(conn) -> None:
    """Case 2 extract 08-07 / 08-14 into serving control tables. Lake facts stay LAKE_ONLY_NEVER."""
    report_path = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "report.json"
    if not report_path.exists():
        print("skip_serving_control_missing_report")
        return
    report = json.loads(report_path.read_text(encoding="utf-8"))
    case2 = report.get("case2") or {}
    prior = case2.get("prior_full") or {}
    fault = case2.get("fault") or {}
    replay = fault.get("replay") or {}
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into people_v2.people_serving_run (run_id, started_at, finished_at, certified, notes)
            values
              (%s, timestamptz '2026-08-07 00:00:00+00', timestamptz '2026-08-07 01:00:00+00', true, 'prior full extract'),
              (%s, timestamptz '2026-08-14 00:00:00+00', timestamptz '2026-08-14 01:00:00+00', false, 'isolated APAC incomplete extract')
            on conflict (run_id) do update set certified = excluded.certified, notes = excluded.notes
            """,
            [f"run-{prior.get('extract_date') or '2026-08-07'}", f"run-{fault.get('extract_date') or '2026-08-14'}"],
        )
        cur.execute(
            """
            insert into people_v2.people_serving_pointer (pointer_id, as_of, extract_id, moved, notes)
            values
              ('certified_as_of', date '2026-08-07', %s, true, 'prior full succeeded'),
              ('fault_extract', date '2026-08-14', %s, %s, 'pointer does not move on isolated extract')
            on conflict (pointer_id) do update set moved = excluded.moved, extract_id = excluded.extract_id
            """,
            [
                f"ext-frappe-employee-{prior.get('extract_date') or '2026-08-07'}",
                f"ext-frappe-employee-{fault.get('extract_date') or '2026-08-14'}",
                bool(fault.get("pointer_moved")),
            ],
        )
        cur.execute(
            """
            insert into people_v2.people_quality_incident
              (incident_id, extract_date, source_object, status, isolated, details)
            values (%s, %s, 'Employee', %s, %s, %s::jsonb)
            on conflict (incident_id) do update set isolated = excluded.isolated, details = excluded.details
            """,
            [
                f"inc-frappe-employee-{fault.get('extract_date') or '2026-08-14'}",
                fault.get("extract_date") or "2026-08-14",
                "isolated" if fault.get("isolated") else "ok",
                bool(fault.get("isolated")),
                json.dumps(
                    {
                        "control_total": fault.get("control_total"),
                        "rows_received": fault.get("rows_received"),
                        "mode": fault.get("mode"),
                    }
                ),
            ],
        )
        cur.execute(
            """
            insert into people_v2.people_replay_metric_value
              (replay_id, extract_date, metric_id, value_bad, value_expected)
            values (%s, %s, %s, %s, %s)
            on conflict (replay_id) do update set value_bad = excluded.value_bad, value_expected = excluded.value_expected
            """,
            [
                f"replay-headcount-{fault.get('extract_date') or '2026-08-14'}",
                fault.get("extract_date") or "2026-08-14",
                replay.get("metric_id") or "headcount",
                replay.get("value_bad"),
                replay.get("value_expected"),
            ],
        )
        cur.execute(
            """
            insert into people_v2.people_metric_health (metric_id, status, reason)
            values ('headcount', 'healthy', 'case2 replay: serving pointer held on 2026-08-14 isolated extract')
            on conflict (metric_id) do update set reason = excluded.reason, as_of = now()
            """
        )
    conn.commit()
    print("loaded_people_v2_serving_control")
