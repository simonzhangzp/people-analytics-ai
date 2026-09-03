from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from apply import connect, assert_people_project

PROTECTED = "panorama_daily"

with connect() as conn:
    assert_people_project(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            select n.nspname, c.relkind, c.relname
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname in ('public', 'serving', 'governance')
              and c.relkind in ('r', 'v', 'm')
              and (
                c.relname like 'people_%%'
                or c.relname = %s
              )
            order by 1, 2, 3
            """,
            [PROTECTED],
        )
        print("relations")
        for row in cur.fetchall():
            print(row)
        cur.execute(
            """
            select n.nspname || '.' || p.proname
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'people_%'
            order by 1
            """
        )
        print("functions", [r[0] for r in cur.fetchall()])
        cur.execute(
            """
            select schemaname, relname, n_live_tup
            from pg_stat_user_tables
            where relname like 'people_%' or relname = %s
            order by 1, 2
            """,
            [PROTECTED],
        )
        print("stats")
        for row in cur.fetchall():
            print(row)
        cur.execute(
            """
            select jobid, jobname, schedule
            from cron.job
            where jobname like 'people%' or jobname like '%workbench%'
            """
        )
        print("cron", cur.fetchall())
        cur.execute("select to_regclass('public.people_pipeline_runs')")
        print("people_pipeline_runs", cur.fetchone()[0])
        cur.execute("select to_regclass('public.people_source_health')")
        print("people_source_health", cur.fetchone()[0])
        cur.execute("select count(*) from public.people_mart_workforce_overview")
        print("workforce_overview", cur.fetchone()[0])
        cur.execute("select count(*) from public.panorama_daily")
        print("panorama_daily", cur.fetchone()[0])
