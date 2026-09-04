from __future__ import annotations

"""Worker events from Property History + Employee extract diff, then gold snaps/marts."""


def build_events_and_gold(con) -> None:
    con.execute(
        """
        CREATE TABLE people_evt_worker AS
        SELECT * FROM (
          SELECT
            'hire-' || worker_id AS event_id,
            worker_id,
            person_id,
            CASE WHEN is_rehire THEN 'rehire' ELSE 'hire' END AS event_type,
            hire_date AS event_date,
            CAST(hire_date AS TIMESTAMP) AS recorded_at,
            'frappe_hr' AS source_system,
            'Employee' AS source_object,
            worker_id AS source_id,
            NULL::VARCHAR AS extract_id
          FROM people_dim_worker
          UNION ALL
          SELECT
            'promo-' || promotion_id, p.worker_id, w.person_id, 'promotion', p.event_date,
            CAST(p.event_date AS TIMESTAMP), 'frappe_hr', 'Employee Promotion', p.promotion_id, NULL
          FROM people_evt_promotion p
          JOIN people_dim_worker w ON w.worker_id = p.worker_id
          UNION ALL
          SELECT
            'xfer-' || transfer_id, t.worker_id, w.person_id, 'transfer', t.event_date,
            CAST(t.event_date AS TIMESTAMP), 'frappe_hr', 'Employee Transfer', t.transfer_id, NULL
          FROM people_evt_transfer t
          JOIN people_dim_worker w ON w.worker_id = t.worker_id
          UNION ALL
          SELECT
            'sep-' || s.name, s.employee, w.person_id, 'separation',
            CAST(s.boarding_begins_on AS DATE), CAST(s.boarding_begins_on AS TIMESTAMP),
            'frappe_hr', 'Employee Separation', s.name, NULL
          FROM bronze_separation s
          JOIN people_dim_worker w ON w.worker_id = s.employee
          WHERE s.docstatus = 1
          UNION ALL
          SELECT
            'comp-' || comp_assignment_id, c.worker_id, w.person_id, 'comp_change', c.from_date,
            CAST(c.from_date AS TIMESTAMP), 'frappe_hr', 'Salary Structure Assignment', c.comp_assignment_id, NULL
          FROM people_fact_comp_assignment c
          JOIN people_dim_worker w ON w.worker_id = c.worker_id
        );
        """
    )

    con.execute(
        """
        CREATE TABLE people_evt_worker_change AS
        WITH ph AS (
          SELECT
            CASE
              WHEN ph.parenttype = 'Employee Promotion' THEN 'promo-' || ph.parent || ':' || lower(coalesce(ph.fieldname, ph.property))
              ELSE 'xfer-' || ph.parent || ':' || lower(coalesce(ph.fieldname, ph.property))
            END AS event_id,
            ph.employee AS worker_id,
            CAST(ph.event_date AS DATE) AS event_date,
            lower(coalesce(ph.fieldname, ph.property)) AS property,
            CAST(ph.current AS VARCHAR) AS old_value,
            CAST(ph.new AS VARCHAR) AS new_value,
            CAST(ph.current AS VARCHAR) AS old_canonical_id,
            CAST(ph.new AS VARCHAR) AS new_canonical_id,
            ph.parenttype AS source_object,
            CASE
              WHEN ph.change_reason IN ('reorg', 'transfer', 'manager_departure') THEN ph.change_reason
              WHEN ph.parenttype = 'Employee Transfer' THEN 'transfer'
              WHEN ph.parenttype = 'Employee Promotion' THEN 'transfer'
              ELSE NULL
            END AS change_reason
          FROM bronze_property_history ph
          LEFT JOIN bronze_promotion p
            ON p.name = ph.parent AND ph.parenttype = 'Employee Promotion'
          LEFT JOIN bronze_transfer t
            ON t.name = ph.parent AND ph.parenttype = 'Employee Transfer'
          WHERE (
              (ph.parenttype = 'Employee Promotion' AND coalesce(p.docstatus, 0) = 1)
              OR (ph.parenttype = 'Employee Transfer' AND coalesce(t.docstatus, 0) = 1)
            )
            AND lower(coalesce(ph.fieldname, ph.property)) IN (
              'department','designation','grade','branch','reports_to','employment_type','status'
            )
            AND (ph.current IS DISTINCT FROM ph.new)
        ),
        covering_emp AS (
          SELECT *
          FROM bronze_employee
          QUALIFY row_number() OVER (
            PARTITION BY name, CAST(modified_date AS DATE)
            ORDER BY emit_seq DESC, modified DESC
          ) = 1
        ),
        emp_lag AS (
          SELECT
            name AS worker_id,
            CAST(modified_date AS DATE) AS event_date,
            row_number() OVER (PARTITION BY name ORDER BY CAST(modified_date AS DATE), emit_seq) AS rn,
            department, lag(department) OVER w AS prev_department,
            designation, lag(designation) OVER w AS prev_designation,
            grade, lag(grade) OVER w AS prev_grade,
            branch, lag(branch) OVER w AS prev_branch,
            reports_to, lag(reports_to) OVER w AS prev_reports_to,
            employment_type, lag(employment_type) OVER w AS prev_employment_type,
            status, lag(status) OVER w AS prev_status,
            change_reason
          FROM covering_emp
          WINDOW w AS (PARTITION BY name ORDER BY CAST(modified_date AS DATE), emit_seq)
        ),
        extract_raw AS (
          SELECT worker_id, event_date, 'department' AS property,
                 CAST(prev_department AS VARCHAR) AS old_value, CAST(department AS VARCHAR) AS new_value,
                 CAST(NULL AS VARCHAR) AS change_reason
          FROM emp_lag WHERE rn > 1 AND prev_department IS DISTINCT FROM department
          UNION ALL
          SELECT worker_id, event_date, 'designation',
                 CAST(prev_designation AS VARCHAR), CAST(designation AS VARCHAR), NULL
          FROM emp_lag WHERE rn > 1 AND prev_designation IS DISTINCT FROM designation
          UNION ALL
          SELECT worker_id, event_date, 'grade',
                 CAST(prev_grade AS VARCHAR), CAST(grade AS VARCHAR), NULL
          FROM emp_lag WHERE rn > 1 AND prev_grade IS DISTINCT FROM grade
          UNION ALL
          SELECT worker_id, event_date, 'branch',
                 CAST(prev_branch AS VARCHAR), CAST(branch AS VARCHAR), NULL
          FROM emp_lag WHERE rn > 1 AND prev_branch IS DISTINCT FROM branch
          UNION ALL
          SELECT worker_id, event_date, 'reports_to',
                 CAST(prev_reports_to AS VARCHAR), CAST(reports_to AS VARCHAR), change_reason
          FROM emp_lag WHERE rn > 1 AND prev_reports_to IS DISTINCT FROM reports_to
          UNION ALL
          SELECT worker_id, event_date, 'employment_type',
                 CAST(prev_employment_type AS VARCHAR), CAST(employment_type AS VARCHAR), NULL
          FROM emp_lag WHERE rn > 1 AND prev_employment_type IS DISTINCT FROM employment_type
          UNION ALL
          SELECT worker_id, event_date, 'status',
                 CAST(prev_status AS VARCHAR), CAST(status AS VARCHAR), NULL
          FROM emp_lag WHERE rn > 1 AND prev_status IS DISTINCT FROM status
        ),
        extract_diff AS (
          SELECT
            'extract-' || e.worker_id || '-' || CAST(e.event_date AS VARCHAR) || '-' || e.property AS event_id,
            e.worker_id,
            e.event_date,
            e.property,
            e.old_value,
            e.new_value,
            e.old_value AS old_canonical_id,
            e.new_value AS new_canonical_id,
            'Employee (extract diff)' AS source_object,
            CASE
              WHEN e.property = 'reports_to' AND e.change_reason IN ('reorg', 'transfer', 'manager_departure')
                THEN e.change_reason
              WHEN e.property = 'reports_to' THEN 'reorg'
              ELSE NULL
            END AS change_reason
          FROM extract_raw e
          WHERE NOT EXISTS (
            SELECT 1 FROM ph
            WHERE ph.worker_id = e.worker_id
              AND ph.event_date = e.event_date
              AND ph.property = e.property
          )
        ),
        raw AS (
          SELECT * FROM ph
          UNION ALL
          SELECT * FROM extract_diff
        ),
        hist_sw AS (
          SELECT worker_id, event_date, property, old_value, new_value FROM (
            SELECT worker_id, valid_from AS event_date, 'department' AS property,
                   CAST(lag(org_id) OVER w AS VARCHAR) AS old_value,
                   CAST(org_id AS VARCHAR) AS new_value,
                   lag(org_id) OVER w AS prev_val, org_id AS cur_val,
                   row_number() OVER w AS rn
            FROM people_hist_worker_attr
            WINDOW w AS (PARTITION BY worker_id ORDER BY valid_from, coalesce(valid_to, DATE '9999-12-31'))
          ) t WHERE rn > 1 AND prev_val IS DISTINCT FROM cur_val
          UNION ALL
          SELECT worker_id, event_date, property, old_value, new_value FROM (
            SELECT worker_id, valid_from AS event_date, 'designation' AS property,
                   CAST(lag(job_id) OVER w AS VARCHAR) AS old_value,
                   CAST(job_id AS VARCHAR) AS new_value,
                   lag(job_id) OVER w AS prev_val, job_id AS cur_val,
                   row_number() OVER w AS rn
            FROM people_hist_worker_attr
            WINDOW w AS (PARTITION BY worker_id ORDER BY valid_from, coalesce(valid_to, DATE '9999-12-31'))
          ) t WHERE rn > 1 AND prev_val IS DISTINCT FROM cur_val
          UNION ALL
          SELECT worker_id, event_date, property, old_value, new_value FROM (
            SELECT worker_id, valid_from AS event_date, 'grade' AS property,
                   CAST(lag(grade_id) OVER w AS VARCHAR) AS old_value,
                   CAST(grade_id AS VARCHAR) AS new_value,
                   lag(grade_id) OVER w AS prev_val, grade_id AS cur_val,
                   row_number() OVER w AS rn
            FROM people_hist_worker_attr
            WINDOW w AS (PARTITION BY worker_id ORDER BY valid_from, coalesce(valid_to, DATE '9999-12-31'))
          ) t WHERE rn > 1 AND prev_val IS DISTINCT FROM cur_val
          UNION ALL
          SELECT worker_id, event_date, property, old_value, new_value FROM (
            SELECT worker_id, valid_from AS event_date, 'branch' AS property,
                   CAST(lag(location_id) OVER w AS VARCHAR) AS old_value,
                   CAST(location_id AS VARCHAR) AS new_value,
                   lag(location_id) OVER w AS prev_val, location_id AS cur_val,
                   row_number() OVER w AS rn
            FROM people_hist_worker_attr
            WINDOW w AS (PARTITION BY worker_id ORDER BY valid_from, coalesce(valid_to, DATE '9999-12-31'))
          ) t WHERE rn > 1 AND prev_val IS DISTINCT FROM cur_val
          UNION ALL
          SELECT worker_id, event_date, property, old_value, new_value FROM (
            SELECT worker_id, valid_from AS event_date, 'reports_to' AS property,
                   CAST(lag(manager_worker_id) OVER w AS VARCHAR) AS old_value,
                   CAST(manager_worker_id AS VARCHAR) AS new_value,
                   lag(manager_worker_id) OVER w AS prev_val, manager_worker_id AS cur_val,
                   row_number() OVER w AS rn
            FROM people_hist_worker_attr
            WINDOW w AS (PARTITION BY worker_id ORDER BY valid_from, coalesce(valid_to, DATE '9999-12-31'))
          ) t WHERE rn > 1 AND prev_val IS DISTINCT FROM cur_val
        )
        SELECT
          coalesce(r.event_id, 'extract-' || h.worker_id || '-' || CAST(h.event_date AS VARCHAR) || '-' || h.property) AS event_id,
          h.worker_id,
          h.event_date,
          h.property,
          coalesce(r.old_value, h.old_value) AS old_value,
          coalesce(r.new_value, h.new_value) AS new_value,
          coalesce(r.old_canonical_id, h.old_value) AS old_canonical_id,
          coalesce(r.new_canonical_id, h.new_value) AS new_canonical_id,
          coalesce(r.source_object, 'Employee (extract diff)') AS source_object,
          CASE
            WHEN r.change_reason IN ('reorg', 'transfer', 'manager_departure') THEN r.change_reason
            WHEN h.property = 'reports_to' AND r.source_object LIKE 'Employee Transfer%' THEN 'transfer'
            WHEN h.property = 'reports_to' THEN coalesce(r.change_reason, 'reorg')
            ELSE r.change_reason
          END AS change_reason
        FROM hist_sw h
        LEFT JOIN raw r
          ON r.worker_id = h.worker_id AND r.event_date = h.event_date AND r.property = h.property
        QUALIFY row_number() OVER (
          PARTITION BY h.worker_id, h.event_date, h.property
          ORDER BY r.event_id NULLS LAST
        ) = 1;
        """
    )

    con.execute(
        """
        INSERT INTO people_evt_worker
        SELECT
          'mgr-' || ch.worker_id || '-' || CAST(ch.event_date AS VARCHAR),
          ch.worker_id,
          w.person_id,
          'manager_change',
          ch.event_date,
          CAST(ch.event_date AS TIMESTAMP),
          'frappe_hr',
          ch.source_object,
          ch.worker_id,
          NULL
        FROM people_evt_worker_change ch
        JOIN people_dim_worker w ON w.worker_id = ch.worker_id
        WHERE ch.property = 'reports_to'
          AND ch.change_reason IN ('reorg', 'transfer', 'manager_departure')
          AND ch.old_value IS DISTINCT FROM ch.new_value
          AND NOT EXISTS (
            SELECT 1 FROM people_evt_worker e
            WHERE e.worker_id = ch.worker_id
              AND e.event_date = ch.event_date
              AND e.event_type = 'manager_change'
          );
        """
    )

    con.execute("DROP TABLE IF EXISTS people_evt_promotion")
    con.execute("DROP VIEW IF EXISTS people_evt_promotion")
    con.execute("DROP TABLE IF EXISTS people_evt_transfer")
    con.execute("DROP VIEW IF EXISTS people_evt_transfer")
    con.execute("DROP TABLE IF EXISTS people_evt_manager_change")
    con.execute("DROP VIEW IF EXISTS people_evt_manager_change")
    con.execute("DROP TABLE IF EXISTS people_fact_separation")
    con.execute("DROP VIEW IF EXISTS people_fact_separation")
    con.execute(
        """
        CREATE OR REPLACE VIEW people_evt_promotion AS
        SELECT event_id AS promotion_id, worker_id, event_date FROM people_evt_worker WHERE event_type = 'promotion';
        CREATE OR REPLACE VIEW people_evt_transfer AS
        SELECT event_id AS transfer_id, worker_id, event_date FROM people_evt_worker WHERE event_type = 'transfer';
        CREATE OR REPLACE VIEW people_evt_manager_change AS
        SELECT
          w.event_id,
          w.worker_id,
          w.event_date,
          c.change_reason
        FROM people_evt_worker w
        LEFT JOIN people_evt_worker_change c
          ON c.worker_id = w.worker_id
         AND c.event_date = w.event_date
         AND c.property = 'reports_to'
        WHERE w.event_type = 'manager_change';
        CREATE OR REPLACE VIEW people_fact_separation AS
        SELECT name, employee, boarding_begins_on, boarding_status, docstatus
        FROM bronze_separation WHERE docstatus = 1;
        """
    )

    con.execute(
        """
        CREATE TABLE people_fact_comp_assignment_x AS
        WITH ordered AS (
          SELECT
            c.*,
            lead(c.from_date) OVER (PARTITION BY c.worker_id ORDER BY c.from_date, c.comp_assignment_id) AS next_from
          FROM people_fact_comp_assignment c
        )
        SELECT
          o.comp_assignment_id,
          o.worker_id,
          o.from_date,
          CASE
            WHEN o.next_from IS NOT NULL AND w.termination_date IS NOT NULL THEN least(o.next_from - 1, w.termination_date)
            WHEN o.next_from IS NOT NULL THEN o.next_from - 1
            ELSE w.termination_date
          END AS to_date,
          o.base,
          o.grade,
          o.docstatus
        FROM ordered o
        LEFT JOIN people_dim_worker w ON w.worker_id = o.worker_id;
        DROP TABLE people_fact_comp_assignment;
        ALTER TABLE people_fact_comp_assignment_x RENAME TO people_fact_comp_assignment;

        CREATE OR REPLACE TABLE people_fact_comp_assignment_restricted AS
        SELECT
          comp_assignment_id, worker_id, from_date, to_date,
          'GT-PROF-USD' AS salary_structure, base, CAST(round(base * 0.1) AS BIGINT) AS variable,
          'USD' AS currency, comp_assignment_id AS source_ssa
        FROM people_fact_comp_assignment;

        CREATE OR REPLACE TABLE people_fact_survey_score_restricted AS
        SELECT worker_id, wave_id, dimension, avg(score) AS score_mean, count(*) AS items_answered
        FROM people_fact_survey_score
        GROUP BY 1,2,3;
        """
    )

    con.execute(
        """
        CREATE TABLE people_ref_job_skill_target AS
        SELECT DISTINCT
          j.job_id,
          s.skill_id,
          3 AS target_proficiency,
          3.0 AS onet_importance
        FROM people_xw_job j
        JOIN people_fact_worker_skill s ON s.job_family = j.job_family
        WHERE s.skill_id IS NOT NULL;

        CREATE TABLE people_fact_candidate_eeoc_restricted AS
        SELECT application_id, race, gender, veteran_status, disability_status, CAST(submitted_at AS TIMESTAMP) AS submitted_at
        FROM bronze_eeoc;

        CREATE TABLE people_fact_candidate_demographic_restricted AS
        SELECT application_id, question_id, answer_option_id, free_form_text, CAST(submitted_at AS TIMESTAMP) AS submitted_at
        FROM bronze_demographic;
        """
    )

    con.execute(
        """
        CREATE TABLE people_dim_requisition_x AS
        SELECT
          r.requisition_id,
          r.gh_job_id,
          r.gh_opening_id,
          j.job_id,
          o.org_id,
          loc.location_id,
          hmw.person_id AS hiring_manager_person_id,
          rmw.person_id AS recruiter_person_id,
          r.opened_at,
          r.closed_at,
          r.status,
          r.close_reason,
          r.hired_application_id,
          r.close_reason_id,
          r.hiring_manager_id,
          r.recruiter_id,
          r.job_family,
          r.region
        FROM people_dim_requisition r
        LEFT JOIN people_dim_org o ON o.bg = r.job_family AND o.is_group = FALSE
        LEFT JOIN people_xw_job j ON j.job_family = r.job_family
        LEFT JOIN people_dim_location loc ON loc.region = r.region
        LEFT JOIN bronze_user hu ON hu.id = r.hiring_manager_id
        LEFT JOIN people_dim_worker hmw ON hmw.worker_id = hu.employee_id
        LEFT JOIN bronze_user ru ON ru.id = r.recruiter_id
        LEFT JOIN people_dim_worker rmw ON rmw.worker_id = ru.employee_id;
        DROP TABLE people_dim_requisition;
        ALTER TABLE people_dim_requisition_x RENAME TO people_dim_requisition;

        CREATE TABLE people_dim_candidate_x AS
        SELECT
          c.candidate_id,
          c.gh_candidate_id,
          w.person_id,
          c.created_at,
          fa.source_id AS first_source_id
        FROM people_dim_candidate c
        LEFT JOIN (
          SELECT candidate_id, source_id,
                 row_number() OVER (PARTITION BY candidate_id ORDER BY applied_at, application_id) AS rn
          FROM people_fact_application
        ) fa ON fa.candidate_id = c.candidate_id AND fa.rn = 1
        LEFT JOIN people_fact_application hired
          ON hired.candidate_id = c.candidate_id AND hired.status = 'hired'
        LEFT JOIN people_dim_worker w
          ON CAST(w.hired_via_application_id AS BIGINT) = hired.application_id;
        DROP TABLE people_dim_candidate;
        ALTER TABLE people_dim_candidate_x RENAME TO people_dim_candidate;

        CREATE TABLE people_fact_application_x AS
        SELECT
          a.application_id,
          a.candidate_id,
          a.requisition_id,
          a.applied_at,
          a.status,
          a.rejected_at,
          a.hired_at,
          a.source_id,
          CASE WHEN a.source_name = 'referral' THEN rmw.person_id ELSE NULL END AS referrer_person_id,
          a.rejection_reason_id,
          a.rejection_type,
          a.current_stage_id,
          a.source_name,
          a.created_at,
          a.recruiter_id,
          a.job_id
        FROM people_fact_application a
        LEFT JOIN bronze_user ru ON ru.id = a.recruiter_id
        LEFT JOIN people_dim_worker rmw ON rmw.worker_id = ru.employee_id;
        DROP TABLE people_fact_application;
        ALTER TABLE people_fact_application_x RENAME TO people_fact_application;

        CREATE TABLE people_fact_scorecard_x AS
        SELECT
          s.scorecard_id,
          s.application_id,
          coalesce(s.interview_id, i.interview_id) AS interview_id,
          sw.person_id AS submitted_by_person_id,
          s.submitted_at,
          s.overall_recommendation,
          s.interview_kit_id,
          s.submitter_id,
          s.interviewer_id,
          s.candidate_rating,
          s.status,
          s.hiring_manager_id,
          s.job_family
        FROM people_fact_scorecard s
        LEFT JOIN people_fact_interview i
          ON i.application_id = s.application_id AND i.stage_id = s.interview_kit_id
        LEFT JOIN bronze_user su ON su.id = s.submitter_id
        LEFT JOIN people_dim_worker sw ON sw.worker_id = su.employee_id;
        DROP TABLE people_fact_scorecard;
        ALTER TABLE people_fact_scorecard_x RENAME TO people_fact_scorecard;
        """
    )

    con.execute(
        """
        CREATE OR REPLACE TABLE people_snap_worker_month AS
        WITH event_flags AS (
          SELECT
            worker_id,
            date_trunc('month', event_date)::DATE AS month_start,
            bool_or(event_type = 'promotion') AS promoted_in_month,
            bool_or(event_type = 'transfer') AS transferred_in_month,
            bool_or(event_type = 'manager_change') AS manager_changed_in_month,
            bool_or(event_type = 'comp_change') AS comp_changed_in_month
          FROM people_evt_worker
          WHERE event_type IN ('promotion','transfer','manager_change','comp_change')
          GROUP BY 1, 2
        ),
        base AS (
          SELECT
            m.month_end,
            m.month_start,
            h.worker_id,
            h.person_id,
            h.hire_date,
            h.termination_date,
            h.org_id,
            o.org_path,
            h.job_id,
            h.job_family,
            h.grade_id,
            g.level_rank,
            h.location_id,
            loc.country,
            h.region,
            h.manager_worker_id,
            h.employment_type,
            h.is_rehire,
            h.via_t1,
            CASE
              WHEN h.termination_date IS NOT NULL AND h.termination_date <= m.month_end THEN 'Left'
              ELSE h.status
            END AS status,
            CASE
              WHEN date_diff('month', h.hire_date, m.month_end)
                   - CASE WHEN date_part('day', m.month_end) < date_part('day', h.hire_date) THEN 1 ELSE 0 END < 12 THEN '<1y'
              WHEN date_diff('month', h.hire_date, m.month_end)
                   - CASE WHEN date_part('day', m.month_end) < date_part('day', h.hire_date) THEN 1 ELSE 0 END < 36 THEN '1–3y'
              WHEN date_diff('month', h.hire_date, m.month_end)
                   - CASE WHEN date_part('day', m.month_end) < date_part('day', h.hire_date) THEN 1 ELSE 0 END < 60 THEN '3–5y'
              WHEN date_diff('month', h.hire_date, m.month_end)
                   - CASE WHEN date_part('day', m.month_end) < date_part('day', h.hire_date) THEN 1 ELSE 0 END < 120 THEN '5–10y'
              ELSE '10y+'
            END AS tenure_band,
            date_diff('month', h.hire_date, m.month_end) AS tenure_months,
            (h.hire_date >= m.month_start AND h.hire_date <= m.month_end) AS hired_in_month,
            (h.termination_date IS NOT NULL AND h.termination_date >= m.month_start AND h.termination_date <= m.month_end) AS terminated_in_month,
            w.termination_category,
            (
              CASE WHEN h.termination_date IS NOT NULL AND h.termination_date <= m.month_end THEN 'Left' ELSE h.status END
                IN ('Active','Suspended')
              AND h.employment_type IN ('Full-time','Part-time','Probation','Regular')
              AND h.hire_date <= m.month_end
              AND (h.termination_date IS NULL OR h.termination_date > m.month_end)
            ) AS is_certified,
            coalesce(f.promoted_in_month, FALSE) AS promoted_in_month,
            coalesce(f.transferred_in_month, FALSE) AS transferred_in_month,
            coalesce(f.manager_changed_in_month, FALSE) AS manager_changed_in_month,
            coalesce(f.comp_changed_in_month, FALSE) AS comp_changed_in_month
          FROM month_spine m
          JOIN people_hist_worker_attr h
            ON h.valid_from <= m.month_end
           AND (h.valid_to IS NULL OR h.valid_to > m.month_end)
          JOIN people_dim_worker w ON w.worker_id = h.worker_id
          LEFT JOIN people_dim_org o ON o.org_id = h.org_id
          LEFT JOIN people_dim_grade g ON g.grade_id = h.grade_id
          LEFT JOIN people_dim_location loc ON loc.location_id = h.location_id
          LEFT JOIN event_flags f
            ON f.worker_id = h.worker_id AND f.month_start = m.month_start
          WHERE h.hire_date <= m.month_end
            AND (h.termination_date IS NULL OR h.termination_date >= m.month_start)
        ),
        reports AS (
          SELECT month_end, manager_worker_id, count(*) AS direct_report_count
          FROM base
          WHERE is_certified AND manager_worker_id IS NOT NULL
          GROUP BY 1, 2
        ),
        latest_appr AS (
          SELECT worker_id, final_score,
                 row_number() OVER (PARTITION BY worker_id ORDER BY submitted_at DESC) AS rn
          FROM people_fact_appraisal
        )
        SELECT
          b.*,
          coalesce(r.direct_report_count, 0) AS direct_report_count,
          coalesce(r.direct_report_count, 0) > 0 AS is_manager,
          (
            b.terminated_in_month
            AND b.termination_category = 'voluntary'
            AND coalesce(a.final_score, 0) >= 4.0
          ) AS is_regrettable
        FROM base b
        LEFT JOIN reports r
          ON r.month_end = b.month_end AND r.manager_worker_id = b.worker_id
        LEFT JOIN latest_appr a ON a.worker_id = b.worker_id AND a.rn = 1;
        """
    )

    con.execute(
        """
        CREATE OR REPLACE TABLE people_snap_requisition_month AS
        SELECT
          m.month_end,
          r.requisition_id,
          r.job_family,
          r.hiring_manager_id,
          (
            CAST(r.opened_at AS DATE) <= m.month_end
            AND (r.closed_at IS NULL OR CAST(r.closed_at AS DATE) > m.month_end)
          ) AS is_open,
          date_diff('day', CAST(r.opened_at AS DATE), m.month_end) AS days_open,
          coalesce(a.applications_active, 0) AS applications_active,
          coalesce(o.offers_outstanding, 0) AS offers_outstanding
        FROM month_spine m
        JOIN people_dim_requisition r
          ON CAST(r.opened_at AS DATE) <= m.month_end
        LEFT JOIN (
          SELECT requisition_id,
                 date_trunc('month', CAST(applied_at AS DATE))::DATE AS month_start,
                 count(*) FILTER (WHERE status = 'active') AS applications_active
          FROM people_fact_application
          GROUP BY 1,2
        ) a ON a.requisition_id = r.requisition_id
           AND a.month_start = date_trunc('month', m.month_end)
        LEFT JOIN (
          SELECT requisition_id,
                 date_trunc('month', CAST(coalesce(sent_at, created_at) AS DATE))::DATE AS month_start,
                 count(*) FILTER (WHERE status NOT IN ('accepted','rejected','deprecated')) AS offers_outstanding
          FROM people_fact_offer
          GROUP BY 1,2
        ) o ON o.requisition_id = r.requisition_id
           AND o.month_start = date_trunc('month', m.month_end);

        CREATE OR REPLACE TABLE people_snap_recruiter_month AS
        WITH iv AS (
          SELECT
            date_trunc('month', CAST(i.start_at AS DATE))::DATE AS month_start,
            r.recruiter_id AS recruiter_user_id,
            count(*) AS interviews_scheduled
          FROM people_fact_interview i
          JOIN people_fact_application a ON a.application_id = i.application_id
          JOIN people_dim_requisition r ON r.requisition_id = a.requisition_id
          WHERE r.recruiter_id IS NOT NULL
          GROUP BY 1,2
        ),
        hired AS (
          SELECT
            date_trunc('month', CAST(o.resolved_at AS DATE))::DATE AS month_start,
            r.recruiter_id AS recruiter_user_id,
            count(*) AS hires
          FROM people_fact_offer o
          JOIN people_dim_requisition r ON r.requisition_id = o.requisition_id
          WHERE o.status = 'accepted' AND r.recruiter_id IS NOT NULL
          GROUP BY 1,2
        )
        SELECT
          s.month_end,
          r.recruiter_id AS recruiter_user_id,
          r.recruiter_person_id AS person_id,
          count(*) FILTER (WHERE s.is_open) AS open_requisitions,
          sum(s.applications_active) AS active_applications,
          coalesce(max(iv.interviews_scheduled), 0) AS interviews_scheduled,
          sum(s.offers_outstanding) AS offers_sent,
          coalesce(max(h.hires), 0) AS hires,
          count(*) FILTER (WHERE s.is_open) AS avg_req_load,
          sum(s.applications_active) AS candidate_load
        FROM people_snap_requisition_month s
        JOIN people_dim_requisition r
          ON r.requisition_id = s.requisition_id AND r.recruiter_id IS NOT NULL
        LEFT JOIN iv
          ON iv.recruiter_user_id = r.recruiter_id
         AND iv.month_start = date_trunc('month', s.month_end)
        LEFT JOIN hired h
          ON h.recruiter_user_id = r.recruiter_id
         AND h.month_start = date_trunc('month', s.month_end)
        GROUP BY 1,2,3;
        """
    )

    con.execute(
        """
        CREATE OR REPLACE TABLE people_mart_workforce_monthly AS
        SELECT month_end, org_id, org_path, region, tenure_band, job_family,
               count(*) FILTER (WHERE is_certified) AS headcount,
               count(*) FILTER (WHERE hired_in_month AND is_certified) AS hires,
               count(*) FILTER (WHERE terminated_in_month AND termination_category = 'voluntary') AS terms_vol,
               count(*) FILTER (WHERE terminated_in_month AND termination_category = 'involuntary') AS terms_invol
        FROM people_snap_worker_month
        GROUP BY 1,2,3,4,5,6;

        CREATE OR REPLACE TABLE people_mart_workforce_monthly_2d AS
        SELECT month_end, org_id, org_path, location_id, region, CAST(NULL AS VARCHAR) AS tenure_band,
               'org_location' AS grain,
               count(*) FILTER (WHERE is_certified) AS headcount,
               count(*) FILTER (WHERE hired_in_month AND is_certified) AS hires,
               count(*) FILTER (WHERE terminated_in_month AND termination_category = 'voluntary') AS terms_vol
        FROM people_snap_worker_month
        GROUP BY 1,2,3,4,5
        UNION ALL
        SELECT month_end, org_id, org_path, CAST(NULL AS VARCHAR) AS location_id, region, tenure_band,
               'org_tenure' AS grain,
               count(*) FILTER (WHERE is_certified),
               count(*) FILTER (WHERE hired_in_month AND is_certified),
               count(*) FILTER (WHERE terminated_in_month AND termination_category = 'voluntary')
        FROM people_snap_worker_month
        GROUP BY 1,2,3,5,6;

        CREATE OR REPLACE TABLE people_mart_mobility_monthly AS
        SELECT
          date_trunc('month', e.event_date)::DATE AS month_start,
          h.org_id,
          o.org_path,
          count(*) FILTER (WHERE e.event_type = 'promotion') AS promotions,
          count(*) FILTER (WHERE e.event_type = 'transfer') AS transfers,
          count(*) FILTER (WHERE e.event_type IN ('promotion','transfer')) AS internal_mobility,
          count(*) FILTER (WHERE e.event_type = 'manager_change') AS manager_changes
        FROM people_evt_worker e
        JOIN people_hist_worker_attr h
          ON h.worker_id = e.worker_id
         AND h.valid_from <= e.event_date
         AND (h.valid_to IS NULL OR h.valid_to > e.event_date)
        LEFT JOIN people_dim_org o ON o.org_id = h.org_id
        WHERE e.event_type IN ('promotion','transfer','manager_change')
        GROUP BY 1,2,3;

        CREATE OR REPLACE TABLE people_mart_recruiter_load_monthly AS
        SELECT * FROM people_snap_recruiter_month;

        CREATE OR REPLACE TABLE people_mart_stage_aging_monthly AS
        SELECT
          date_trunc('month', CAST(st.entered_at AS TIMESTAMP))::DATE AS month_start,
          st.canonical_stage,
          r.org_id,
          o.org_path,
          quantile_cont(date_diff('day', CAST(st.entered_at AS TIMESTAMP), CAST(coalesce(st.exited_at, st.entered_at) AS TIMESTAMP)), 0.5) AS aging_p50_days
        FROM people_evt_application_stage st
        JOIN people_fact_application a ON a.application_id = st.application_id
        JOIN people_dim_requisition r ON r.requisition_id = a.requisition_id
        LEFT JOIN people_dim_org o ON o.org_id = r.org_id
        GROUP BY 1,2,3,4;

        CREATE OR REPLACE TABLE people_mart_comp_monthly AS
        WITH comp_asof AS (
          SELECT
            s.month_end,
            s.org_id,
            s.org_path,
            s.job_family,
            s.region,
            s.grade_id,
            c.base * 1.0 / NULLIF(b.band_mid, 0) AS compa,
            row_number() OVER (PARTITION BY s.worker_id, s.month_end ORDER BY c.from_date DESC) AS rn
          FROM people_snap_worker_month s
          JOIN people_hist_worker_attr h
            ON h.worker_id = s.worker_id AND h.valid_from <= s.month_end
           AND (h.valid_to IS NULL OR h.valid_to > s.month_end)
          JOIN people_fact_comp_assignment c
            ON c.worker_id = s.worker_id AND c.from_date <= s.month_end
           AND (c.to_date IS NULL OR c.to_date >= s.month_end)
          JOIN people_ref_comp_band b ON b.grade_id = c.grade
          WHERE s.is_certified
        )
        SELECT
          month_end, org_id, org_path, job_family, region, grade_id,
          count(*) AS n,
          quantile_cont(compa, 0.25) AS compa_p25,
          quantile_cont(compa, 0.50) AS compa_p50,
          quantile_cont(compa, 0.75) AS compa_p75
        FROM comp_asof
        WHERE rn = 1
        GROUP BY 1,2,3,4,5,6
        HAVING count(*) >= 10;

        CREATE OR REPLACE TABLE people_mart_learning_monthly AS
        SELECT
          date_trunc('month', CAST(event_start AS DATE))::DATE AS month_start,
          count(DISTINCT worker_id) AS participants,
          coalesce(sum(hours),0) AS training_hours,
          count(DISTINCT training_event_id) AS completion
        FROM (
          SELECT t.*, e.start_time AS event_start
          FROM people_fact_training_participation t
          LEFT JOIN bronze_training_event e ON e.name = t.training_event_id
        )
        GROUP BY 1;

        CREATE OR REPLACE TABLE people_mart_skill_coverage_monthly AS
        WITH targets AS (
          SELECT job_id, skill_id, coalesce(target_proficiency, 3) AS target_proficiency
          FROM people_ref_job_skill_target
        ),
        target_n AS (
          SELECT job_id, count(*) AS n_target
          FROM targets
          GROUP BY 1
          HAVING count(*) > 0
        ),
        worker_cov AS (
          SELECT
            s.month_end,
            s.org_id,
            s.org_path,
            s.job_family,
            s.worker_id,
            count(*) FILTER (
              WHERE k.skill_id IS NOT NULL
                AND coalesce(k.proficiency, 0) >= t.target_proficiency
            ) * 1.0 / tn.n_target AS coverage_ratio
          FROM people_snap_worker_month s
          JOIN target_n tn ON tn.job_id = s.job_id
          JOIN targets t ON t.job_id = s.job_id
          LEFT JOIN people_fact_worker_skill k
            ON k.worker_id = s.worker_id AND k.skill_id = t.skill_id
          WHERE s.is_certified
          GROUP BY 1,2,3,4,5, tn.n_target
        )
        SELECT
          month_end, org_id, org_path, job_family,
          round(avg(coverage_ratio), 12) AS coverage_ratio
        FROM worker_cov
        GROUP BY 1,2,3,4;

        CREATE OR REPLACE TABLE people_mart_engagement_wave AS
        SELECT
          s.wave_id,
          s.dimension,
          w.org_id,
          w.org_path,
          count(DISTINCT s.worker_id) AS n,
          avg(s.score) AS mean,
          avg(CASE WHEN s.score >= 4 THEN 1.0 ELSE 0.0 END) AS favorable_pct
        FROM people_fact_survey_score s
        JOIN people_snap_worker_month w
          ON w.worker_id = s.worker_id AND w.month_end = DATE '2026-08-31'
        GROUP BY 1,2,3,4
        HAVING count(DISTINCT s.worker_id) >= 5;

        CREATE TABLE people_mart_source_health_daily AS
        SELECT * FROM (
          SELECT DATE '2026-08-07' AS extract_date, 'frappe_hr' AS source_system, 'Employee' AS source_object,
                 (SELECT count(*) FROM bronze_extract_prior) AS control_total,
                 (SELECT count(*) FROM bronze_extract_prior) AS rows_received,
                 24 AS freshness_hours, 0 AS tests_failed
          UNION ALL
          SELECT DATE '2026-08-14', 'frappe_hr', 'Employee', 0, 0, 24, 1
        );

        CREATE TABLE people_mart_applicant_flow AS
        SELECT
          r.job_family,
          e.race,
          e.gender,
          count(*) AS n
        FROM people_fact_candidate_eeoc_restricted e
        JOIN people_fact_application a ON a.application_id = e.application_id
        JOIN people_dim_requisition r ON r.requisition_id = a.requisition_id
        GROUP BY 1,2,3
        HAVING count(*) >= 10;
        """
    )
