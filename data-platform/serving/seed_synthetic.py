from __future__ import annotations

from datetime import date

from psycopg import Connection

ORGS = ("org_product", "org_gtm")
FAMILIES = ("Engineering", "Sales", "People")
LOCATIONS = ("US-NY", "US-TX")


def month_starts(start: date, end: date) -> list[date]:
    months: list[date] = []
    current = date(start.year, start.month, 1)
    last = date(end.year, end.month, 1)
    while current <= last:
        months.append(current)
        current = (
            date(current.year + 1, 1, 1)
            if current.month == 12
            else date(current.year, current.month + 1, 1)
        )
    return months


def stable_headcount(org_id: str, job_family: str, location_id: str, month: date) -> int:
    seed = sum(ord(ch) for ch in f"{org_id}|{job_family}|{location_id}|{month.isoformat()}")
    return 36 + (seed % 90)


def seed_people_marts(conn: Connection) -> None:
    months = month_starts(date(2025, 9, 1), date(2026, 8, 1))
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.people_dim_company (
              company_id, company_name, ticker, industry, hq_country,
              public_private, employee_count_latest, provenance
            )
            values
              ('acme_public', 'Acme Public Co', 'ACME', 'Software', 'US',
               'public', 4200, 'synthetic_internal'),
              ('northwind_private', 'Northwind Labs', null, 'Software', 'US',
               'private', 860, 'synthetic_internal')
            on conflict (company_id) do nothing
            """
        )
        cur.execute(
            """
            insert into public.people_dim_occupation (occupation_id, soc_code, title)
            values
              ('15-1252', '15-1252', 'Software Developers'),
              ('13-1111', '13-1111', 'Management Analysts')
            on conflict (occupation_id) do nothing
            """
        )
        cur.execute(
            """
            insert into public.people_dim_skill (
              skill_id, skill_name, skill_category, provenance
            )
            values
              ('skill_python', 'Python', 'technical', 'synthetic_internal'),
              ('skill_sql', 'SQL', 'technical', 'synthetic_internal'),
              ('skill_leadership', 'People leadership', 'behavioral', 'synthetic_internal')
            on conflict (skill_id) do nothing
            """
        )
        cur.execute(
            """
            insert into public.people_source_freshness (
              source_name, provenance, last_successful_ingestion,
              expected_frequency, row_count, freshness_status
            )
            values (
              'synthetic_internal',
              'synthetic_internal',
              now(),
              interval '1 month',
              0,
              'healthy'
            )
            on conflict (source_name) do update
            set last_successful_ingestion = excluded.last_successful_ingestion,
                freshness_status = 'healthy',
                updated_at = now()
            """
        )

        workforce_rows = []
        retention_rows = []
        for month in months:
            for org_id in ORGS:
                for job_family in FAMILIES:
                    for location_id in LOCATIONS:
                        headcount = stable_headcount(org_id, job_family, location_id, month)
                        hires = max(1, round(headcount * 0.03))
                        exits = max(0, round(headcount * 0.015))
                        workforce_rows.append(
                            (
                                month,
                                org_id,
                                job_family,
                                location_id,
                                headcount,
                                round(headcount * 0.97, 1),
                                hires,
                                exits,
                            )
                        )
                        beginning = headcount + exits - hires
                        rate = round(exits / beginning, 4) if beginning else 0
                        retention_rows.append(
                            (
                                month,
                                org_id,
                                job_family,
                                location_id,
                                exits,
                                beginning,
                                rate,
                            )
                        )

        cur.executemany(
            """
            insert into public.people_mart_workforce_overview (
              as_of_month, org_id, job_family, location_id,
              headcount, fte, hires, exits, provenance, metric_id
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, 'synthetic_internal', 'headcount')
            on conflict (as_of_month, org_id, job_family, location_id) do update
            set headcount = excluded.headcount,
                fte = excluded.fte,
                hires = excluded.hires,
                exits = excluded.exits
            """,
            workforce_rows,
        )
        cur.executemany(
            """
            insert into public.people_mart_retention (
              as_of_month, org_id, job_family, location_id,
              voluntary_exits, beginning_headcount, voluntary_attrition_rate,
              provenance, metric_id
            )
            values (%s, %s, %s, %s, %s, %s, %s, 'synthetic_internal', 'voluntary_attrition')
            on conflict (as_of_month, org_id, job_family, location_id) do update
            set voluntary_exits = excluded.voluntary_exits,
                beginning_headcount = excluded.beginning_headcount,
                voluntary_attrition_rate = excluded.voluntary_attrition_rate
            """,
            retention_rows,
        )
        cur.execute(
            """
            update public.people_source_freshness
            set row_count = (
                  select count(*) from public.people_mart_workforce_overview
                ),
                previous_row_count = row_count,
                updated_at = now()
            where source_name = 'synthetic_internal'
            """
        )
        cur.execute("select count(*) from public.people_mart_workforce_overview")
        workforce_count = cur.fetchone()[0]
        cur.execute("select count(*) from public.people_mart_retention")
        retention_count = cur.fetchone()[0]
    conn.commit()
    print("seeded_people_mart_workforce_overview", workforce_count)
    print("seeded_people_mart_retention", retention_count)
