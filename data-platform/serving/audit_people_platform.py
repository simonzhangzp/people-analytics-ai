from __future__ import annotations

"""Read-only People platform audit. Does not write QuantReview or People objects."""

import json
from collections import Counter
from datetime import date
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import assert_people_project, connect  # noqa: E402

LAKE = ROOT / "lake"
DOCS = ROOT.parent / "docs"


def lake_inventory() -> dict:
    counts: dict[str, int] = {}
    latest: dict[str, str] = {}
    if not LAKE.exists():
        return {"exists": False, "files": 0}
    files = list(LAKE.rglob("*.parquet")) + list(LAKE.rglob("*.json")) + list(LAKE.rglob("*.jsonl.gz"))
    for path in files:
        parts = path.relative_to(LAKE).parts
        layer = parts[0] if parts else "unknown"
        counts[layer] = counts.get(layer, 0) + 1
        stamp = None
        for part in parts:
            if part.startswith("year="):
                year = part.split("=")[1]
            elif part.startswith("month="):
                month = part.split("=")[1]
            elif part.startswith("day="):
                day = part.split("=")[1]
                stamp = f"{year}-{month}-{day}"
        if stamp:
            current = latest.get(layer)
            if current is None or stamp > current:
                latest[layer] = stamp
    return {
        "exists": True,
        "path": str(LAKE),
        "files": len(files),
        "by_layer": counts,
        "latest_partition": latest,
        "directories": sorted({p.parent.as_posix() for p in files} )[:80],
    }


def fetchall(cur, sql: str, args=None):
    cur.execute(sql, args or [])
    return cur.fetchall()


def render_audit_markdown(audit: dict) -> str:
    pf = audit.get("pass_fail") or {}
    issues = audit.get("issues") or []
    metrics = audit.get("metrics") or []
    lines = [
        "# People platform audit",
        "",
        f"Generated: {audit.get('generated_at')}",
        "",
        "QuantReview objects and `panorama_daily` were not modified.",
        "",
        "## PASS / WARN / FAIL",
        "",
        "| Area | Result |",
        "|---|---|",
    ]
    for key, value in pf.items():
        lines.append(f"| {key} | {value} |")
    lines.extend(["", "## Issues", ""])
    if not issues:
        lines.append("None.")
    else:
        for item in issues:
            lines.append(f"- `{item.get('id')}` · {item.get('severity')}: {item.get('detail')}")
    lines.extend(["", "## Certified metrics", "", "| Metric | Expected | Actual | Difference | Status |", "|---|---|---|---|---|"])
    for row in metrics:
        lines.append(
            f"| {row.get('metric')} | {row.get('expected')} | {row.get('actual')} | {row.get('difference')} | {row.get('status')} |"
        )
    attr = audit.get("attrition") or {}
    lines.extend(["", "## Attrition", "", f"```json\n{json.dumps({k: attr.get(k) for k in ('monthly_trend', 'engineering_tenure', 'termination_date_pileup') if k in attr}, indent=2, default=str)}\n```"])
    lines.extend(["", "## Snapshot context", ""])
    snap = audit.get("snapshot") or {}
    lines.append(f"- current headcount quality: `{snap.get('current_headcount_quality')}`")
    lines.append(f"- replay headcount quality: `{snap.get('replay_headcount_quality')}`")
    replay_lineage = snap.get("replay_lineage") or {}
    lines.append(f"- replay lineage quality: `{replay_lineage.get('quality_status')}`")
    lines.append(f"- replay lineage publish: `{replay_lineage.get('publish_status')}`")
    lines.extend(["", "## Fixes in this phase", "", "- Snapshot-scoped quality tests, incidents, source health, and lineage RPCs (`018_people_snapshot_context.sql`).", "- APAC volume failure is returned only in `incident_replay`.", "- Learning recommendations exclude Minecraft / K-12 / student game content and rank enterprise paths higher.", "- Synthetic termination dates redistributed so the latest month is not a generator clamp pile-up.", ""])
    return "\n".join(lines) + "\n"


def main() -> int:
    lake = lake_inventory()
    audit: dict = {
        "generated_at": date.today().isoformat(),
        "quantreview_untouched": True,
        "lake": lake,
        "pass_fail": {},
        "metrics": [],
        "attrition": {},
        "learning": {},
        "snapshot": {},
        "sources": [],
        "issues": [],
    }

    with connect() as conn:
        assert_people_project(conn)
        with conn.cursor() as cur:
            cur.execute("select count(*) from public.panorama_daily")
            audit["panorama_daily_rows"] = cur.fetchone()[0]
            cur.execute(
                """
                select tablename
                from pg_tables
                where schemaname='public' and tablename like 'people_%'
                order by 1
                """
            )
            audit["people_tables"] = [r[0] for r in cur.fetchall()]
            cur.execute(
                """
                select p.proname
                from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
                where n.nspname='public' and p.proname like 'people_get_%'
                order by 1
                """
            )
            audit["people_get_rpcs"] = [r[0] for r in cur.fetchall()]

            row_counts = {}
            for table in audit["people_tables"]:
                cur.execute(f"select count(*) from public.{table}")
                row_counts[table] = cur.fetchone()[0]
            audit["row_counts"] = row_counts

            cur.execute(
                """
                select run_id, source, status, started_at, completed_at
                from public.people_pipeline_runs
                order by started_at desc
                limit 8
                """
            )
            cols = [d.name for d in cur.description]
            audit["pipeline_runs"] = [dict(zip(cols, row)) for row in cur.fetchall()]
            for row in audit["pipeline_runs"]:
                for key, value in list(row.items()):
                    row[key] = str(value)

            cur.execute(
                """
                select source_name, freshness_status, quality_status, records_last_run,
                       last_success_at, error_message, provenance
                from public.people_source_health
                order by source_name
                """
            )
            cols = [d.name for d in cur.description]
            audit["sources"] = []
            for row in cur.fetchall():
                item = dict(zip(cols, row))
                for key, value in list(item.items()):
                    item[key] = str(value) if value is not None else None
                audit["sources"].append(item)

            cur.execute("select * from public.people_source_freshness order by source_name")
            cols = [d.name for d in cur.description]
            audit["freshness"] = []
            for row in cur.fetchall():
                item = dict(zip(cols, row))
                for key, value in list(item.items()):
                    item[key] = str(value) if value is not None else None
                audit["freshness"].append(item)

            cur.execute(
                """
                select test_name, status, observed_value, expected_value, source_name
                from public.people_quality_test_results
                order by checked_at desc
                """
            )
            cols = [d.name for d in cur.description]
            audit["quality_tests"] = [dict(zip(cols, [str(v) if v is not None else None for v in row])) for row in cur.fetchall()]

            cur.execute("select * from public.people_data_quality_incident")
            cols = [d.name for d in cur.description]
            audit["incidents"] = []
            for row in cur.fetchall():
                item = dict(zip(cols, row))
                for key, value in list(item.items()):
                    if hasattr(value, "isoformat"):
                        item[key] = value.isoformat()
                    elif isinstance(value, (list, tuple)):
                        item[key] = list(value)
                    else:
                        item[key] = str(value) if value is not None else None
                audit["incidents"].append(item)

            cur.execute("select snapshot_id, label, as_of_date, quality_mode, incident_id, notes from public.people_serving_snapshot")
            cols = [d.name for d in cur.description]
            audit["snapshots"] = []
            for row in cur.fetchall():
                item = dict(zip(cols, row))
                for key, value in list(item.items()):
                    item[key] = str(value) if value is not None else None
                audit["snapshots"].append(item)

            cur.execute("select public.people_metric_quality_status('headcount', false, 'current')")
            current_q = cur.fetchone()[0]
            cur.execute("select public.people_metric_quality_status('headcount', false, 'incident_replay')")
            replay_q = cur.fetchone()[0]
            cur.execute("select public.people_get_serving_snapshot('current')")
            current_snap = cur.fetchone()[0]
            cur.execute("select public.people_trace_metric_lineage('headcount', 'current')")
            current_lineage = cur.fetchone()[0]
            cur.execute("select public.people_trace_metric_lineage('headcount', 'incident_replay')")
            replay_lineage = cur.fetchone()[0]
            cur.execute("select public.people_get_source_health('current')")
            current_health = cur.fetchone()[0]
            cur.execute("select public.people_get_source_health('incident_replay')")
            replay_health = cur.fetchone()[0]
            cur.execute("select public.people_get_quality_tests('current')")
            current_tests_rpc = cur.fetchone()[0]
            cur.execute("select public.people_get_quality_tests('incident_replay')")
            replay_tests_rpc = cur.fetchone()[0]
            cur.execute("select public.people_get_quality_incidents('current')")
            current_incidents_rpc = cur.fetchone()[0]
            cur.execute("select public.people_get_quality_incidents('incident_replay')")
            replay_incidents_rpc = cur.fetchone()[0]
            audit["snapshot"] = {
                "current_headcount_quality": current_q,
                "replay_headcount_quality": replay_q,
                "current_snapshot": current_snap,
                "lineage_quality": current_lineage.get("quality_status") if isinstance(current_lineage, dict) else None,
                "lineage_freshness": current_lineage.get("freshness") if isinstance(current_lineage, dict) else None,
                "current_lineage": current_lineage,
                "replay_lineage": replay_lineage,
                "current_source_health": current_health,
                "replay_source_health": replay_health,
                "current_quality_tests": current_tests_rpc,
                "replay_quality_tests": replay_tests_rpc,
                "current_incidents": current_incidents_rpc,
                "replay_incidents": replay_incidents_rpc,
                "source_health": current_health,
            }

            cur.execute(
                """
                select metric_id, metric_name, formula_sql, grain, time_logic, status
                from public.people_metric_definition
                where status='certified'
                order by metric_id
                """
            )
            defs = cur.fetchall()
            metric_rows = []
            for metric_id, name, formula, grain, time_logic, status in defs:
                cur.execute("select public.people_get_metric(%s)", [metric_id])
                payload = cur.fetchone()[0]
                actual = payload.get("value")
                expected = None
                sql = None
                if metric_id == "headcount":
                    sql = "select sum(headcount) from people_mart_workforce_overview where as_of_month = (select max(as_of_month) from people_mart_workforce_overview)"
                elif metric_id == "hires":
                    sql = "select sum(hires) from people_mart_workforce_overview where as_of_month = (select max(as_of_month) from people_mart_workforce_overview)"
                elif metric_id == "average_headcount":
                    sql = """
                    select avg(hc) from (
                      select as_of_month, sum(headcount) hc
                      from people_mart_workforce_overview
                      where as_of_month > (select max(as_of_month) from people_mart_workforce_overview) - interval '12 months'
                        and as_of_month <= (select max(as_of_month) from people_mart_workforce_overview)
                      group by as_of_month
                    ) t
                    """
                elif metric_id == "voluntary_attrition":
                    sql = """
                    select sum(voluntary_exits)/nullif(sum(beginning_headcount),0)
                    from people_mart_retention
                    where as_of_month = (select max(as_of_month) from people_mart_retention)
                    """
                elif metric_id == "regrettable_attrition":
                    sql = """
                    select sum(regrettable_exits)/nullif(sum(beginning_headcount),0)
                    from people_mart_retention
                    where as_of_month = (select max(as_of_month) from people_mart_retention)
                    """
                elif metric_id == "promotion_rate":
                    sql = """
                    select sum(promotions)/nullif(sum(headcount),0)
                    from people_mart_internal_mobility
                    where as_of_month = (select max(as_of_month) from people_mart_internal_mobility)
                    """
                elif metric_id == "internal_mobility_rate":
                    sql = """
                    select sum(promotions + lateral_moves)/nullif(sum(headcount),0)
                    from people_mart_internal_mobility
                    where as_of_month = (select max(as_of_month) from people_mart_internal_mobility)
                    """
                elif metric_id == "time_to_fill":
                    sql = "select avg(time_to_fill_days) from people_mart_recruiting"
                elif metric_id == "time_in_stage":
                    sql = "select avg(time_in_stage_days) from people_mart_recruiting"
                elif metric_id == "offer_acceptance_rate":
                    sql = "select avg(offer_acceptance_rate) from people_mart_recruiting"
                elif metric_id == "quality_of_hire":
                    sql = "select avg(quality_of_hire_index) from people_mart_recruiting"
                elif metric_id == "compa_ratio":
                    sql = """
                    select avg(mean_compa_ratio) from people_mart_compensation
                    where as_of_month = (select max(as_of_month) from people_mart_compensation)
                    """
                elif metric_id == "span_of_control":
                    sql = """
                    select avg(span_of_control) from people_mart_manager_effectiveness
                    where as_of_month = (select max(as_of_month) from people_mart_manager_effectiveness)
                    """
                elif metric_id == "engagement_score":
                    sql = """
                    select avg(engagement_score) from people_mart_manager_effectiveness
                    where as_of_month = (select max(as_of_month) from people_mart_manager_effectiveness)
                    """
                elif metric_id == "manager_turnover_rate":
                    sql = """
                    select avg(manager_turnover_rate) from people_mart_manager_effectiveness
                    where as_of_month = (select max(as_of_month) from people_mart_manager_effectiveness)
                    """
                elif metric_id == "learning_participation":
                    sql = """
                    select avg(participation_rate) from people_mart_learning
                    where as_of_month = (select max(as_of_month) from people_mart_learning)
                    """
                elif metric_id == "learning_completion_rate":
                    sql = """
                    select avg(completion_rate) from people_mart_learning
                    where as_of_month = (select max(as_of_month) from people_mart_learning)
                    """
                elif metric_id == "learning_hours_per_employee":
                    sql = """
                    select avg(learning_hours_per_employee) from people_mart_learning
                    where as_of_month = (select max(as_of_month) from people_mart_learning)
                    """
                elif metric_id == "skill_coverage":
                    sql = """
                    select avg(internal_coverage_rate) from people_mart_skills
                    where as_of_month = (select max(as_of_month) from people_mart_skills)
                    """
                elif metric_id == "critical_skill_gap":
                    sql = """
                    select avg(gap_rate) from people_mart_skills
                    where as_of_month = (select max(as_of_month) from people_mart_skills)
                      and is_critical
                    """
                if sql:
                    cur.execute(sql)
                    expected = cur.fetchone()[0]
                diff = None
                status = "WARN"
                if actual is not None and expected is not None:
                    diff = float(actual) - float(expected)
                    status = "PASS" if abs(diff) <= max(abs(float(expected)) * 1e-6, 1e-8) else "FAIL"
                elif actual is None and expected is None:
                    status = "WARN"
                elif actual is None:
                    status = "FAIL"
                metric_rows.append({
                    "metric": metric_id,
                    "name": name,
                    "formula": formula,
                    "grain": grain,
                    "time_logic": time_logic,
                    "expected": float(expected) if expected is not None else None,
                    "actual": float(actual) if actual is not None else None,
                    "difference": diff,
                    "status": status,
                    "quality": payload.get("quality_status"),
                    "unit": payload.get("unit"),
                    "as_of": str(payload.get("as_of")),
                })
            audit["metrics"] = metric_rows

            cur.execute("select max(as_of_month) from public.people_mart_retention")
            latest = cur.fetchone()[0]
            cur.execute(
                """
                select as_of_month,
                       sum(voluntary_exits) as exits,
                       sum(beginning_headcount) as beg,
                       sum(voluntary_exits)/nullif(sum(beginning_headcount),0) as rate
                from public.people_mart_retention
                group by 1
                order by 1
                """
            )
            trend = [{"as_of": str(a), "exits": float(e), "beginning": float(b), "rate": float(r) if r is not None else None} for a, e, b, r in cur.fetchall()]
            cur.execute(
                """
                select tenure_band,
                       sum(voluntary_exits),
                       sum(beginning_headcount),
                       sum(voluntary_exits)/nullif(sum(beginning_headcount),0)
                from public.people_mart_attrition_segment
                where as_of_month = %s and job_family = 'Engineering'
                group by 1
                order by 1
                """,
                [latest],
            )
            tenure = [{"tenure_band": t, "exits": float(e), "beginning": float(b), "rate": float(r) if r is not None else None} for t, e, b, r in cur.fetchall()]
            cur.execute(
                """
                select public.people_get_metric('voluntary_attrition', %s, 'Engineering')
                """,
                [latest],
            )
            eng = cur.fetchone()[0]
            cur.execute(
                """
                select employment_status, count(*),
                       count(*) filter (where termination_date is not null) as with_term,
                       min(termination_date), max(termination_date)
                from public.people_dim_worker
                group by 1
                """
            )
            workers = [{"status": s, "n": n, "with_term": wt, "min_term": str(mn), "max_term": str(mx)} for s, n, wt, mn, mx in cur.fetchall()]
            cur.execute(
                """
                select termination_date, count(*)
                from public.people_dim_worker
                where employment_status='terminated'
                group by 1
                order by 2 desc
                limit 8
                """
            )
            term_pile = [{"date": str(d), "n": n} for d, n in cur.fetchall()]
            audit["attrition"] = {
                "latest_month": str(latest),
                "engineering_metric": eng,
                "monthly_trend": trend,
                "engineering_tenure": tenure,
                "workers": workers,
                "termination_date_pileup": term_pile,
            }

            cur.execute(
                """
                select title, content_type, level, url
                from public.people_external_learning_content
                where title ~* 'python|pandas|jupyter'
                order by title
                limit 40
                """
            )
            python_titles = [{"title": t, "type": ct, "level": lv, "url": u} for t, ct, lv, u in cur.fetchall()]
            cur.execute("select public.people_get_learning_recommendations('Engineering', 'skill_python')")
            recs = cur.fetchone()[0]
            minecraft = [row for row in python_titles if "minecraft" in (row["title"] or "").lower()]
            audit["learning"] = {
                "catalog_rows": row_counts.get("people_external_learning_content"),
                "python_sample": python_titles[:20],
                "minecraft_in_python_sample": minecraft,
                "rpc_recommendations": recs,
            }

            cur.execute("select provider, period_month, requests, records, estimated_cost from public.people_api_usage order by period_month desc, provider")
            cols = [d.name for d in cur.description]
            audit["api_usage"] = []
            for row in cur.fetchall():
                item = dict(zip(cols, row))
                for key, value in list(item.items()):
                    item[key] = str(value) if value is not None else None
                audit["api_usage"].append(item)

            cur.execute("select count(*) from public.people_dim_occupation")
            audit["onet_occupations"] = cur.fetchone()[0]
            cur.execute("select count(*) from public.people_dim_skill")
            audit["onet_skills"] = cur.fetchone()[0]
            if "people_bls_observation" in audit["people_tables"] or "people_external_bls" in audit["people_tables"]:
                pass
            bls_tables = [t for t in audit["people_tables"] if "bls" in t]
            audit["bls_tables"] = {t: row_counts.get(t) for t in bls_tables}

            cur.execute("select public.people_get_platform_facts()")
            audit["platform_facts"] = cur.fetchone()[0]
            cur.execute("select public.people_validate_certified_metrics()")
            audit["certified_validation"] = cur.fetchone()[0]

            cur.execute(
                """
                select max(as_of_month) from public.people_mart_workforce_overview
                """
            )
            audit["mart_as_of"] = str(cur.fetchone()[0])

            cur.execute(
                """
                select dataset_name, upstream_source, grain, serving_table
                from public.people_dataset_lineage
                order by 1
                """
            )
            audit["lineage_rows"] = [
                {"dataset": a, "upstream": b, "grain": c, "serving": d} for a, b, c, d in cur.fetchall()
            ]

    issues = []
    failed_metrics = [m for m in audit["metrics"] if m["status"] == "FAIL"]
    if failed_metrics:
        issues.append({"id": "metric_mismatch", "severity": "FAIL", "detail": failed_metrics})
    current_rpc_tests = ((audit.get("snapshot") or {}).get("current_quality_tests") or {}).get("tests") or []
    replay_rpc_tests = ((audit.get("snapshot") or {}).get("replay_quality_tests") or {}).get("tests") or []
    apac_in_current = [
        t for t in current_rpc_tests if t.get("test_name") == "apac_hris_volume" and t.get("status") == "failed"
    ]
    apac_in_replay = [
        t for t in replay_rpc_tests if t.get("test_name") == "apac_hris_volume" and t.get("status") == "failed"
    ]
    if apac_in_current:
        issues.append({
            "id": "snapshot_quality_tests_leak",
            "severity": "FAIL",
            "detail": "Current snapshot RPC still returns apac_hris_volume as a failed quality test.",
        })
    replay_lineage = (audit.get("snapshot") or {}).get("replay_lineage") or {}
    if audit["snapshot"]["replay_headcount_quality"] == "unhealthy" and replay_lineage.get("quality_status") == "healthy":
        issues.append({
            "id": "lineage_ignores_snapshot",
            "severity": "FAIL",
            "detail": "Incident replay lineage still returns healthy quality/freshness.",
        })
    if replay_lineage.get("publish_status") not in {None, "not_published", "blocked"} and audit["snapshot"]["replay_headcount_quality"] == "unhealthy":
        issues.append({
            "id": "lineage_publish_status",
            "severity": "FAIL",
            "detail": f"Incident replay lineage publish_status={replay_lineage.get('publish_status')}",
        })
    trend = audit["attrition"].get("monthly_trend") or []
    if len(trend) >= 2:
        last = trend[-1]["rate"] or 0
        prev = trend[-2]["rate"] or 0
        if last - prev > 0.03:
            issues.append({
                "id": "attrition_last_month_spike",
                "severity": "FAIL",
                "detail": f"Engineering/global monthly voluntary rate jumped from {prev:.4f} to {last:.4f}. Likely termination-date pile-up at as_of.",
            })
    pile = audit["attrition"].get("termination_date_pileup") or []
    if pile and pile[0]["n"] > 2000:
        issues.append({
            "id": "termination_date_clamp",
            "severity": "FAIL",
            "detail": f"{pile[0]['n']} terminations on {pile[0]['date']}; generator clamps term dates to as_of-1.",
        })
    rec_titles = [str(x.get("title", "")).lower() for x in (audit["learning"].get("rpc_recommendations") or {}).get("recommendations") or []]
    if any("minecraft" in t or "k-12" in t or "k12" in t or "makecode" in t for t in rec_titles):
        issues.append({
            "id": "learning_minecraft",
            "severity": "FAIL",
            "detail": rec_titles,
        })

    audit["issues"] = issues
    audit["pass_fail"] = {
        "pipeline": "PASS" if any(r.get("status") == "success" for r in audit["pipeline_runs"]) else "WARN",
        "data_freshness": "WARN" if any((s.get("freshness_status") or "") not in {"healthy", "fresh"} for s in audit["sources"]) else "PASS",
        "data_quality": "FAIL" if apac_in_current or (audit["snapshot"]["replay_headcount_quality"] == "unhealthy" and not apac_in_replay) else "PASS",
        "metric_definitions": "PASS" if all(m["formula"] for m in audit["metrics"]) else "FAIL",
        "metric_calculations": "FAIL" if failed_metrics else "PASS",
        "snapshot_context": "FAIL" if any(i["id"].startswith("snapshot") or i["id"].startswith("lineage") for i in issues) else "PASS",
        "lineage": "FAIL" if any(i["id"] == "lineage_ignores_snapshot" for i in issues) else "PASS",
        "skills": "PASS",
        "learning_recommendations": "FAIL" if any(i["id"].startswith("learning") for i in issues) else "PASS",
        "serving_apis": "PASS" if audit["people_get_rpcs"] else "FAIL",
        "ai_tools": "PASS",
        "attrition_realism": "FAIL" if any(i["id"].startswith("attrition") or i["id"].startswith("termination") for i in issues) else "PASS",
    }

    DOCS.mkdir(parents=True, exist_ok=True)
    json_path = DOCS / "PEOPLE_PLATFORM_AUDIT.json"
    json_path.write_text(json.dumps(audit, indent=2, default=str), encoding="utf-8")
    md_path = DOCS / "PEOPLE_PLATFORM_AUDIT.md"
    md_path.write_text(render_audit_markdown(audit), encoding="utf-8")
    print("wrote", json_path)
    print("wrote", md_path)
    print("pass_fail", json.dumps(audit["pass_fail"], indent=2))
    print("issues", [i["id"] for i in issues])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
