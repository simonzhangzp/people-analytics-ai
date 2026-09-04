from __future__ import annotations

"""Five-year workforce + T1 recruiting engine. Opening stock has no T1; window hires always go through accepted offers."""

import calendar
import hashlib
import random
from datetime import date, timedelta
from pathlib import Path

from business_rules import e6_category, in_certified_headcount, tenure_band
from funnel import cancelled_openings_for_hires, lognormal_count, lognormal_days
from ids import person_id, utc
from org_tree import MAX_LEVEL, SPAN_HI, SPAN_MEDIAN, build_company_tree, hash_uniform, manager_candidates, place_hire
from transactions import t1_hire_instance
from world import load_baseline

ROOT = Path(__file__).resolve().parent
START = date(2021, 9, 1)
END = date(2026, 8, 31)
CASE3_FROM = date(2026, 3, 1)
COMPA_FROM = date(2025, 10, 1)
BRANCH = {"AMER": "AMER-NYC", "EMEA": "EMEA-LON", "APAC": "APAC-SIN"}
JOB_BY_FAMILY = {
    "Engineering": "Software Developer",
    "Sales": "Account Executive",
    "Exec": "VP Product",
    "Other": "Operations Specialist",
}
DEPT_BY_FAMILY = {
    "Engineering": "Engineering - Platform",
    "Sales": "Sales - Enterprise",
    "Exec": "Office of the CEO",
    "Other": "Operations - Core",
}
FAMILY_GRADES = {
    "Engineering": ["G4", "G5", "G6", "G7"],
    "Sales": ["G4", "G5", "G6"],
    "Exec": ["G8", "G9", "G10"],
    "Other": ["G3", "G4", "G5", "G6"],
}
BAND_MID = {
    "G1": 40000,
    "G2": 65000,
    "G3": 90000,
    "G4": 115000,
    "G5": 140000,
    "G6": 165000,
    "G7": 190000,
    "G8": 220000,
    "G9": 260000,
    "G10": 320000,
}
SOURCE_IDS = {"inbound": 1, "referral": 2, "sourced": 3, "internal": 4}
STAGE_IDS = {"Application Review": 1, "Phone Screen": 2, "Onsite": 3, "Offer": 4}
RECRUITER_USER_MIN = 201
REGIONS = ("AMER", "EMEA", "APAC")
CHANGE_REASONS = ("reorg", "transfer", "manager_departure")


def hash_pick(key: str, items: list):
    if not items:
        return None
    digest = hashlib.md5(key.encode("utf-8")).digest()
    return items[int.from_bytes(digest[:4], "big") % len(items)]


def accompany_reports_to(worker_id: str, day: date) -> bool:
    digest = hashlib.md5(f"{worker_id}|{day.isoformat()}|reports_to".encode("utf-8")).digest()[0]
    return digest < 51


def recruiter_id_for(family: str, region: str, opening_id: int, n_recruiters: int) -> int:
    """Assign every opening a recruiter in the org × region × job_family cell."""
    families = list(JOB_BY_FAMILY)
    n = max(1, int(n_recruiters))
    fi = families.index(family) if family in families else 0
    ri = list(REGIONS).index(region) if region in REGIONS else 0
    n_cells = len(families) * len(REGIONS)
    cell = fi * len(REGIONS) + ri
    start = RECRUITER_USER_MIN + (cell * n) // n_cells
    end = RECRUITER_USER_MIN + ((cell + 1) * n) // n_cells
    if end <= start:
        end = start + 1
    pool = list(range(start, end))
    return int(hash_pick(f"{opening_id}|rec|{family}|{region}", pool))


SKILLS = {
    "Engineering": ["Python", "SQL", "Kubernetes", "System Design", "Testing", "Cloud", "CI/CD", "Observability"],
    "Sales": ["Negotiation", "CRM", "Discovery", "Forecasting", "Presentation", "Pipeline", "MEDDPICC"],
    "Exec": ["Strategy", "Finance", "People Leadership", "Stakeholder", "Org Design", "Governance"],
    "Other": ["Excel", "Process", "Communication", "Compliance", "Operations", "Documentation"],
}
SURVEY_ITEMS = [
    ("E1", "engagement"),
    ("E2", "engagement"),
    ("E3", "engagement"),
    ("M1", "manager"),
    ("M2", "manager"),
    ("M3", "manager"),
    ("G1", "growth"),
    ("G2", "growth"),
    ("G3", "growth"),
    ("W1", "wellbeing"),
    ("W2", "wellbeing"),
    ("W3", "wellbeing"),
]


def month_ends(start: date, end: date) -> list[date]:
    cur = date(start.year, start.month, 1)
    out = []
    while cur <= end:
        last = calendar.monthrange(cur.year, cur.month)[1]
        me = date(cur.year, cur.month, last)
        if start <= me <= end:
            out.append(me)
        cur = date(cur.year + 1, 1, 1) if cur.month == 12 else date(cur.year, cur.month + 1, 1)
    return out


def annual_to_monthly(rate: float) -> float:
    return 1.0 - (1.0 - rate) ** (1.0 / 12.0)


def weighted_choice(rng: random.Random, weights: dict[str, float]) -> str:
    keys = list(weights)
    totals = [weights[k] for k in keys]
    s = sum(totals)
    roll = rng.random() * s
    acc = 0.0
    for key, w in zip(keys, totals):
        acc += w
        if roll <= acc:
            return key
    return keys[-1]


def case3_multiplier(as_of: date, region: str, family: str, band: str, apply: bool, spec: dict) -> float:
    if not apply:
        return 1.0
    target = spec.get("target") or {}
    effect = spec.get("effect") or {}
    if region != target.get("location_region"):
        return 1.0
    if family != target.get("job_family"):
        return 1.0
    lo, hi = (target.get("tenure_months") or [0, 36])[:2]
    months = {"<1y": 6, "1–3y": 24, "3–5y": 48, "5–10y": 84, "10y+": 144}[band]
    if not (lo <= months < hi):
        return 1.0
    start = date.fromisoformat(str(spec["effective"]["from"]))
    if as_of < start:
        return 1.0
    ramp = int(effect.get("ramp_months") or 0)
    mult = float(effect["hazard_multiplier"]["voluntary_separation"])
    if ramp <= 0:
        return mult
    elapsed = (as_of.year - start.year) * 12 + as_of.month - start.month
    progress = min(1.0, (elapsed + 1) / ramp)
    return 1.0 + (mult - 1.0) * progress


def in_case3_slice(w: dict, as_of: date, spec: dict) -> bool:
    target = spec.get("target") or {}
    if w["region"] != target.get("location_region"):
        return False
    if w["job_family"] != target.get("job_family"):
        return False
    lo, hi = (target.get("tenure_months") or [0, 36])[:2]
    months = {"<1y": 6, "1–3y": 24, "3–5y": 48, "5–10y": 84, "10y+": 144}[tenure_band(w["hire_date"], as_of)]
    return lo <= months < hi


class WorldEngine:
    def __init__(self, scale: float, seed: int, apply_case3: bool, lake: Path | None = None, prefix: str | None = None):
        self.scale = scale
        self.rng = random.Random(seed)
        self.apply_case3 = apply_case3
        self.lake = lake
        self.prefix = prefix
        self.baseline = load_baseline()
        self.case3 = _load_yaml("engineering_apac_attrition_rise")
        self.case4 = _load_yaml("hiring_slowdown_hm_latency")
        pop = self.baseline["population"]
        self.target_end = max(int(pop["ending_active_certified"] * scale), 8)
        self.opening_n = max(int(self.target_end * pop["opening_stock_share_of_ending"]), 4)
        self.hazard_grid = self.baseline["attrition"]["hazard_voluntary_annual"]
        self.invol_m = annual_to_monthly(float(self.baseline["attrition"]["involuntary_annual_point"]))
        self.accept_p = 0.85
        self.rehire_rate = float(pop["rehire_rate"])
        self.rec = self.baseline["recruiting"]
        self.n_recruiters = max(1, int(round(int(self.rec.get("recruiter_count") or 110) * self.scale)))
        self.promo_m = annual_to_monthly(float(self.baseline["movement"]["promotion_annual"]))
        self.transfer_m = annual_to_monthly(float(self.baseline["movement"]["transfer_annual"]))
        self.mgr_m = annual_to_monthly(float(self.baseline["movement"]["standalone_manager_change_annual"]))
        self._span_counts: dict[str, int] = {}
        self.slow_hms = [101, 102, 103]
        for sig in self.case4.get("correlated_signals") or []:
            ids = ((sig.get("target") or {}).get("hiring_manager_ids")) or []
            if ids:
                self.slow_hms = [int(x) for x in ids]
        self.workers: list[dict] = []
        self.ceo_id: str | None = None
        self._org_children: dict[str, list[str]] = {}
        self._org_by_dept: dict[str, list[dict]] = {}
        self._org_by_id: dict[str, dict] = {}
        self.employee_versions: list[dict] = []
        self._last_emp_idx: dict[str, int] = {}
        self.separations: list[dict] = []
        self.offers: list[dict] = []
        self.applications: list[dict] = []
        self.openings: list[dict] = []
        self.candidates: list[dict] = []
        self.identities: list[dict] = []
        self.application_stages: list[dict] = []
        self.interviews: list[dict] = []
        self.scorecards: list[dict] = []
        self.ssa: list[dict] = []
        self.appraisals: list[dict] = []
        self.appraisal_cycles: list[dict] = []
        self.promotions: list[dict] = []
        self.transfers: list[dict] = []
        self.manager_changes: list[dict] = []
        self.property_history: list[dict] = []
        self.training_events: list[dict] = []
        self.training_event_employees: list[dict] = []
        self.training_results: list[dict] = []
        self.training_result_employees: list[dict] = []
        self.skill_maps: list[dict] = []
        self.employee_skills: list[dict] = []
        self.survey_waves: list[dict] = []
        self.survey_responses: list[dict] = []
        self.left_pool: list[dict] = []
        self._employee_emit_seq = 0
        self.next_emp = 1
        self.next_offer = 77000
        self.next_app = 44000
        self.next_opening = 99000
        self.next_cand = 33000
        self.next_sep = 1
        self.next_job = 8800
        self.next_stage = 80000
        self.next_interview = 56000
        self.next_scorecard = 61000
        self.next_ssa = 1
        self.next_promo = 1
        self.next_transfer = 1
        self.next_apr = 1
        self.next_trn = 1
        self.next_skm = 1
        self.cumulative_hires = 0
        self.cumulative_cancelled = 0
        self.accepted_offer_count = 0
        self.cycle_years_emitted: set[int] = set()

    def _emp_name(self) -> str:
        name = f"HR-EMP-{self.next_emp:06d}"
        self.next_emp += 1
        return name

    def _hazard_m(self, w: dict, as_of: date) -> float:
        band = tenure_band(w["hire_date"], as_of)
        annual = self.hazard_grid[w["job_family"]][w["region"]][band]
        annual *= case3_multiplier(as_of, w["region"], w["job_family"], band, self.apply_case3, self.case3)
        return annual_to_monthly(annual)

    def _certified(self, w: dict, as_of: date) -> bool:
        status = w["status"] if w["termination_date"] is None or w["termination_date"] > as_of else "Left"
        return in_certified_headcount(status, w["employment_type"], w["hire_date"], w["termination_date"], as_of)

    def _recruiter_id(self, family: str, region: str, opening_id: int) -> int:
        return recruiter_id_for(family, region, opening_id, self.n_recruiters)

    def _hash01(self, key: str) -> float:
        return hash_uniform(key)

    def _certified_managers(self, day: date) -> dict[str, dict]:
        return {
            w["worker_id"]: w
            for w in self.workers
            if self._certified(w, day) and w.get("employment_type") != "Intern"
        }

    def _emit_employee(self, w: dict, modified: date) -> None:
        prev_i = self._last_emp_idx.get(w["worker_id"])
        if prev_i is not None:
            prev_d = date.fromisoformat(self.employee_versions[prev_i]["modified_date"])
            if modified < prev_d:
                modified = prev_d
        self._employee_emit_seq += 1
        row = {
            "name": w["worker_id"],
            "status": w["status"],
            "date_of_joining": w["hire_date"].isoformat(),
            "relieving_date": w["termination_date"].isoformat() if w["termination_date"] else None,
            "reason_for_leaving": w["reason"],
            "employment_type": w["employment_type"],
            "department": DEPT_BY_FAMILY[w["job_family"]],
            "designation": JOB_BY_FAMILY[w["job_family"]],
            "grade": w["grade"],
            "reports_to": w.get("reports_to"),
            "branch": BRANCH[w["region"]],
            "branch_region": w["region"],
            "job_family": w["job_family"],
            "person_id": w["person_id"],
            "is_rehire": w["is_rehire"],
            "via_t1": w["via_t1"],
            "hired_via_application_id": w.get("hired_via_application_id"),
            "change_reason": w.pop("_change_reason", None),
            "modified": utc(modified),
            "modified_date": modified.isoformat(),
            "emit_seq": self._employee_emit_seq,
            "docstatus": 0,
        }
        if prev_i is not None and self.employee_versions[prev_i].get("modified_date") == modified.isoformat():
            self.employee_versions[prev_i] = row
            return
        self._last_emp_idx[w["worker_id"]] = len(self.employee_versions)
        self.employee_versions.append(row)

    def _compa_ratio(self, w: dict, as_of: date) -> float:
        control = 0.98
        slice_ratio = 0.88
        for sig in self.case3.get("correlated_signals") or []:
            if sig.get("id") != "compa_ratio_lag":
                continue
            effect = sig.get("effect") or {}
            control = float(effect.get("control_compa_ratio_median") or control)
            slice_ratio = float(effect.get("slice_compa_ratio_median") or slice_ratio)
            start = date.fromisoformat(str(sig["from"]))
            if as_of >= start and in_case3_slice(w, as_of, self.case3):
                return slice_ratio
        return control

    def _emit_ssa(self, w: dict, from_date: date, grade: str | None = None) -> None:
        grade = grade or w["grade"]
        mid = BAND_MID[grade]
        base = int(round(mid * self._compa_ratio(w, from_date)))
        w["grade"] = grade
        w["base"] = base
        self.ssa.append(
            {
                "doctype": "Salary Structure Assignment",
                "name": f"HR-SSA-{self.next_ssa:06d}",
                "employee": w["worker_id"],
                "salary_structure": "GT-PROF-USD",
                "from_date": from_date.isoformat(),
                "base": base,
                "variable": int(round(base * 0.1)),
                "currency": "USD",
                "grade": grade,
                "docstatus": 1,
            }
        )
        self.next_ssa += 1

    def _emit_skills(self, w: dict, day: date) -> None:
        pool = SKILLS[w["job_family"]]
        lo, hi = self.baseline["skills"]["per_worker"]
        n = self.rng.randint(int(lo), int(hi))
        chosen = [pool[i % len(pool)] for i in range(n)]
        # Engineering gap: skip Kubernetes ~40% of the time
        if w["job_family"] == "Engineering" and self.rng.random() < 0.4:
            chosen = [s for s in chosen if s != "Kubernetes"]
            if len(chosen) < int(lo):
                chosen.append("Python")
        map_name = f"HR-SKM-{self.next_skm:06d}"
        self.next_skm += 1
        self.skill_maps.append({"doctype": "Employee Skill Map", "name": map_name, "employee": w["worker_id"]})
        seen = set()
        for skill in chosen:
            if skill in seen:
                continue
            seen.add(skill)
            self.employee_skills.append(
                {
                    "doctype": "Employee Skill",
                    "parent": map_name,
                    "skill": skill,
                    "proficiency": round(self.rng.uniform(0.4, 0.9), 2),
                    "evaluation_date": day.isoformat(),
                    "employee": w["worker_id"],
                    "job_family": w["job_family"],
                }
            )

    def _new_person_worker(
        self,
        hire: date,
        *,
        person: str | None,
        is_rehire: bool,
        via_t1: bool,
        emp_type: str | None = None,
        family: str | None = None,
        region: str | None = None,
    ) -> dict:
        pop = self.baseline["population"]
        region = region or weighted_choice(self.rng, pop["region_mix"])
        family = family or weighted_choice(self.rng, pop["job_family_mix"])
        emp_type = emp_type or weighted_choice(self.rng, pop["employment_type_mix"])
        emp = self._emp_name()
        if person is None:
            person = person_id("greenhouse_v3", "candidate", str(self.next_cand + 1))
        grade = self.rng.choice(FAMILY_GRADES[family])
        w = {
            "worker_id": emp,
            "person_id": person,
            "hire_date": hire,
            "termination_date": None,
            "reason": None,
            "termination_category": None,
            "region": region,
            "job_family": family,
            "employment_type": emp_type,
            "status": "Active",
            "is_rehire": is_rehire,
            "via_t1": via_t1,
            "hired_via_application_id": None,
            "grade": grade,
            "base": BAND_MID[grade],
            "reports_to": None,
        }
        self.workers.append(w)
        return w

    def _source(self) -> str:
        return weighted_choice(self.rng, self.rec["source_mix"])

    def _n_apps(self, family: str) -> int:
        medians = self.rec["apps_median_by_family"]
        median = float(medians.get(family) or medians.get("Other") or 100)
        return lognormal_count(self.rng, median, float(self.rec.get("apps_lognormal_sigma") or 0.55))

    def _hm_for(self, family: str, as_of: date) -> int:
        case4_from = date.fromisoformat(str(self.case4["effective"]["from"]))
        if family == "Sales" and as_of >= case4_from and self.rng.random() < 0.35:
            return self.rng.choice(self.slow_hms)
        return self.rng.randint(101, 120)

    def _delay_days(self, family: str, hm: int, day: date) -> tuple[int, int]:
        case4_from = date.fromisoformat(str(self.case4["effective"]["from"]))
        if family != "Sales" or day < case4_from or hm not in self.slow_hms:
            return 0, 0
        interview_d = 8
        scorecard_d = 10
        for sig in self.case4.get("correlated_signals") or []:
            effect = sig.get("effect") or {}
            interview_d = int(effect.get("interview_schedule_delay_days") or interview_d)
            scorecard_d = int(effect.get("scorecard_submit_delay_days") or scorecard_d)
        return interview_d, scorecard_d

    def _onsite_dwell_mult(self, family: str, day: date) -> float:
        case4_from = date.fromisoformat(str(self.case4["effective"]["from"]))
        if family != "Sales" or day < case4_from:
            return 1.0
        return float((self.case4.get("effect") or {}).get("stage_dwell_multiplier", {}).get("Onsite") or 1.6)

    def _lognormal_spec_days(self, spec: dict, default_median: float, default_sigma: float = 0.72) -> int:
        return lognormal_days(
            self.rng,
            float(spec.get("median") or spec.get("median_days") or default_median),
            float(spec.get("sigma") or default_sigma),
            lo=int(spec.get("lo") or 1),
            hi=int(spec.get("hi") or 240),
        )

    def _stage_dwell(
        self, name: str, *, family: str, day: date, hm: int, quick_reject: bool = False
    ) -> int:
        specs = self.rec.get("stage_dwell_lognormal") or {}
        if quick_reject and name == "Application Review":
            spec = specs.get("quick_reject_review") or {"median": 2, "sigma": 0.4, "lo": 1, "hi": 8}
            return self._lognormal_spec_days(spec, 2, 0.4)
        spec = specs.get(name) or {"median": 6, "sigma": 0.7}
        days = self._lognormal_spec_days(spec, 6, 0.7)
        if name == "Onsite":
            days = max(1, int(round(days * self._onsite_dwell_mult(family, day))))
            case4_from = date.fromisoformat(str(self.case4["effective"]["from"]))
            if family == "Sales" and hm in self.slow_hms and day >= case4_from:
                tail = self.rec.get("case4_slow_hm_tail") or {}
                days += lognormal_days(
                    self.rng,
                    float(tail.get("extra_onsite_median_days") or 12),
                    float(tail.get("extra_onsite_sigma") or 0.90),
                    lo=3,
                    hi=80,
                )
        return max(1, days)

    def _time_to_fill_days(self, family: str, hm: int, hire_day: date) -> int:
        spec = self.rec.get("time_to_fill_lognormal") or {}
        days = lognormal_days(
            self.rng,
            float(spec.get("median_days") or 32),
            float(spec.get("sigma") or 0.72),
            lo=int(spec.get("lo") or 10),
            hi=int(spec.get("hi") or 240),
        )
        case4_from = date.fromisoformat(str(self.case4["effective"]["from"]))
        if family == "Sales" and hm in self.slow_hms and hire_day >= case4_from:
            tail = self.rec.get("case4_slow_hm_tail") or {}
            days += lognormal_days(
                self.rng,
                float(tail.get("extra_ttf_median_days") or 18),
                float(tail.get("extra_ttf_sigma") or 0.85),
                lo=5,
                hi=90,
            )
        return max(10, days)

    def _emit_stage(self, app_id: int, name: str, entered: date, exited: date | None) -> None:
        self.next_stage += 1
        self.application_stages.append(
            {
                "id": self.next_stage,
                "application_id": app_id,
                "job_interview_stage_id": STAGE_IDS[name],
                "stage_name": name,
                "entered_at": utc(entered),
                "exited_at": utc(exited) if exited else None,
                "current": exited is None,
            }
        )

    def _ph(
        self,
        parent: str,
        parenttype: str,
        employee: str,
        day: date,
        fieldname: str,
        current,
        new,
        idx: int,
        change_reason: str | None = None,
    ) -> dict:
        return {
            "parent": parent,
            "parenttype": parenttype,
            "idx": idx,
            "property": fieldname,
            "fieldname": fieldname,
            "current": current,
            "new": new,
            "employee": employee,
            "event_date": day.isoformat(),
            "change_reason": change_reason,
        }

    def _hash_new_manager(self, w: dict, day: date) -> str | None:
        dept = DEPT_BY_FAMILY[w["job_family"]]
        pool = [
            x
            for x in (self._org_by_dept.get(dept) or self.workers)
            if x.get("termination_date") is None
            and DEPT_BY_FAMILY[x["job_family"]] == dept
            and self._certified(x, day)
        ]
        cands = manager_candidates(
            self.workers, w, DEPT_BY_FAMILY, pool=pool, children=self._org_children
        )
        under = [c for c in cands if self._span_counts.get(c, 0) < SPAN_HI]
        use = under or cands
        picked = hash_pick(f"{w['worker_id']}|{day.isoformat()}|mgr", use)
        if picked and picked != w.get("reports_to"):
            return picked
        rest = [c for c in use if c != w.get("reports_to")]
        return hash_pick(f"{w['worker_id']}|{day.isoformat()}|mgr2", rest)

    def _place_in_tree(self, w: dict) -> None:
        dept = DEPT_BY_FAMILY[w["job_family"]]
        pool = self._org_by_dept.setdefault(dept, [])
        place_hire(self.workers, w, DEPT_BY_FAMILY, self.ceo_id, pool=pool)
        pool.append(w)
        self._org_by_id[w["worker_id"]] = w
        mgr = w.get("reports_to")
        if mgr:
            self._org_children.setdefault(mgr, []).append(w["worker_id"])

    def _rewrite_last_employee(self, w: dict) -> None:
        for row in reversed(self.employee_versions):
            if row["name"] == w["worker_id"]:
                row["reports_to"] = w.get("reports_to")
                row["department"] = DEPT_BY_FAMILY[w["job_family"]]
                row["designation"] = JOB_BY_FAMILY[w["job_family"]]
                row["job_family"] = w["job_family"]
                break

    def _rebuild_org_index(self) -> None:
        children: dict[str, list[str]] = {}
        by_dept: dict[str, list[dict]] = {}
        by_id: dict[str, dict] = {}
        for w in self.workers:
            by_id[w["worker_id"]] = w
            if w.get("termination_date") is not None:
                continue
            dept = DEPT_BY_FAMILY[w["job_family"]]
            by_dept.setdefault(dept, []).append(w)
            mgr = w.get("reports_to")
            if mgr:
                children.setdefault(mgr, []).append(w["worker_id"])
        self._org_children = children
        self._org_by_dept = by_dept
        self._org_by_id = by_id
        self._span_counts = {wid: len(ch) for wid, ch in children.items()}

    def _pick_manager(self, w: dict, day: date, cands: list[dict]) -> dict | None:
        pool = [c for c in cands if c["worker_id"] != w["worker_id"]]
        if not pool:
            return None
        under = [c for c in pool if self._span_counts.get(c["worker_id"], 0) < SPAN_HI]
        if not under:
            return None
        return hash_pick(f"{w['worker_id']}|{day.isoformat()}|mgrpick", under)

    def _reassign_reports(self, old: dict, day: date) -> None:
        living = self._certified_managers(day)
        cands = [
            x
            for x in self.workers
            if x["worker_id"] != old["worker_id"]
            and x["worker_id"] in living
            and x.get("org_role") in ("leader", "manager")
            and int(x.get("org_level") or 0) < MAX_LEVEL
        ]
        if old["worker_id"] == self.ceo_id and cands:
            suc = cands[0]
            suc["reports_to"] = None
            suc["org_role"] = "leader"
            suc["org_level"] = 0
            suc["_change_reason"] = "manager_departure"
            self.ceo_id = suc["worker_id"]
            self._emit_employee(suc, day)
        if not cands and self.ceo_id in living:
            cands = [living[self.ceo_id]]
        if not cands:
            return
        reports = [
            x
            for x in self.workers
            if x.get("reports_to") == old["worker_id"] and x.get("termination_date") is None
        ]
        for x in reports:
            new_mgr = self._pick_manager(x, day, cands)
            if new_mgr is None:
                open_cands = [c for c in cands if self._span_counts.get(c["worker_id"], 0) < SPAN_HI]
                new_mgr = open_cands[0] if open_cands else (cands[0] if cands else None)
            if not new_mgr or new_mgr["worker_id"] == x["worker_id"]:
                if self.ceo_id and self.ceo_id != x["worker_id"]:
                    x["reports_to"] = self.ceo_id
                    x["_change_reason"] = "manager_departure"
                    self._span_counts[self.ceo_id] = self._span_counts.get(self.ceo_id, 0) + 1
                    self._emit_employee(x, day)
                continue
            x["reports_to"] = new_mgr["worker_id"]
            x["_change_reason"] = "manager_departure"
            self._span_counts[new_mgr["worker_id"]] = self._span_counts.get(new_mgr["worker_id"], 0) + 1
            self._emit_employee(x, day)

    def _living_managers(self) -> dict[str, dict]:
        return self._certified_managers(END)

    def _certified_reports(self, day: date) -> dict[str, list[dict]]:
        out: dict[str, list[dict]] = {}
        for w in self.workers:
            if w["worker_id"] == self.ceo_id:
                continue
            if not self._certified(w, day):
                continue
            mgr = w.get("reports_to")
            if mgr:
                out.setdefault(mgr, []).append(w)
        return out

    def _certified_depths(self, day: date) -> dict[str, int]:
        living = {w["worker_id"]: w for w in self.workers if self._certified(w, day)}
        children: dict[str, list[str]] = {}
        for w in living.values():
            mgr = w.get("reports_to")
            if mgr:
                children.setdefault(mgr, []).append(w["worker_id"])
        depths: dict[str, int] = {}
        if self.ceo_id not in living:
            return depths
        stack = [self.ceo_id]
        depths[self.ceo_id] = 0
        i = 0
        while i < len(stack):
            nid = stack[i]
            i += 1
            d = depths[nid]
            for cid in children.get(nid, []):
                if cid in depths or cid not in living:
                    continue
                depths[cid] = d + 1
                stack.append(cid)
        return depths

    def _capacity_manager_ids(
        self,
        day: date,
        depths: dict[str, int],
        reports: dict[str, list[dict]],
        *,
        exclude: set[str],
    ) -> list[str]:
        max_mgr_depth = 7
        out: list[str] = []
        fallback: list[str] = []
        for w in self.workers:
            if not self._certified(w, day):
                continue
            wid = w["worker_id"]
            if wid in exclude:
                continue
            if depths.get(wid, 99) > max_mgr_depth:
                continue
            if len(reports.get(wid, [])) >= SPAN_HI:
                continue
            fallback.append(wid)
            if w.get("org_role") in ("leader", "manager") or wid == self.ceo_id:
                out.append(wid)
        return out or fallback

    def _promote_shallow_ic(
        self, day: date, depths: dict[str, int], reports: dict[str, list[dict]]
    ) -> str | None:
        cands = [
            w
            for w in self.workers
            if self._certified(w, day)
            and w.get("org_role") == "ic"
            and w.get("employment_type") != "Intern"
            and 1 <= depths.get(w["worker_id"], 99) <= 7
        ]
        if not cands:
            return None
        promo = sorted(cands, key=lambda x: (depths.get(x["worker_id"], 99), x["worker_id"]))[0]
        promo["org_role"] = "manager"
        promo["_change_reason"] = "reorg"
        self._emit_employee(promo, day)
        reports.setdefault(promo["worker_id"], [])
        return promo["worker_id"]

    def _move_report(self, w: dict, new_mgr: str, day: date, reason: str) -> None:
        if not new_mgr or new_mgr == w["worker_id"] or new_mgr == w.get("reports_to"):
            return
        w["reports_to"] = new_mgr
        w["_change_reason"] = reason
        self._emit_employee(w, day)

    def _split_over_span(
        self,
        mgr_id: str,
        reps: list[dict],
        day: date,
        depths: dict[str, int],
        reports: dict[str, list[dict]],
    ) -> None:
        ordered = sorted(reps, key=lambda x: x["worker_id"])
        if len(ordered) <= SPAN_HI:
            return
        for x in ordered[SPAN_HI:]:
            targets = self._capacity_manager_ids(
                day, depths, reports, exclude={x["worker_id"], mgr_id}
            )
            if not targets:
                promo = self._promote_shallow_ic(day, depths, reports)
                if promo:
                    targets = [promo]
            if not targets:
                continue
            new_mgr = min(
                targets,
                key=lambda t: (len(reports.get(t, [])), depths.get(t, 99), t),
            )
            self._move_report(x, new_mgr, day, "reorg")
            reports[mgr_id] = [r for r in reports.get(mgr_id, []) if r["worker_id"] != x["worker_id"]]
            reports.setdefault(new_mgr, []).append(x)
            depths[x["worker_id"]] = depths.get(new_mgr, 0) + 1

    def _rebalance_tree(self, day: date) -> None:
        for _ in range(4):
            depths = self._certified_depths(day)
            reports = self._certified_reports(day)
            span_n = {mgr: len(reps) for mgr, reps in reports.items()}
            cap = self._capacity_manager_ids(day, depths, reports, exclude=set())
            by_id = {w["worker_id"]: w for w in self.workers}
            hc = sum(1 for w in self.workers if self._certified(w, day))
            n_mgr = sum(1 for n in span_n.values() if n > 0)
            moved = False

            def take_target(exclude: set[str]) -> str | None:
                nonlocal cap, n_mgr
                soft = int(round(SPAN_MEDIAN))
                share = (n_mgr / hc) if hc else 0.0

                def usable_below(limit: int) -> list[str]:
                    return [
                        t
                        for t in cap
                        if t not in exclude
                        and span_n.get(t, 0) < limit
                        and depths.get(t, 99) <= 7
                    ]

                under_soft = usable_below(soft)
                if under_soft:
                    return min(under_soft, key=lambda t: (depths.get(t, 99), span_n.get(t, 0), t))
                if share < 0.13:
                    promo = self._promote_shallow_ic(day, depths, reports)
                    if promo:
                        cap.append(promo)
                        span_n.setdefault(promo, 0)
                        pw = by_id[promo]
                        depths[promo] = depths.get(pw.get("reports_to") or "", 0) + 1
                        return promo
                under_hi = usable_below(SPAN_HI)
                if under_hi:
                    return min(under_hi, key=lambda t: (depths.get(t, 99), span_n.get(t, 0), t))
                promo = self._promote_shallow_ic(day, depths, reports)
                if not promo:
                    return None
                cap.append(promo)
                span_n.setdefault(promo, 0)
                pw = by_id[promo]
                depths[promo] = depths.get(pw.get("reports_to") or "", 0) + 1
                return promo

            def apply_move(w: dict, new_mgr: str, old: str | None) -> None:
                nonlocal cap, n_mgr
                self._move_report(w, new_mgr, day, "reorg")
                if old:
                    prev = span_n.get(old, 1)
                    span_n[old] = max(0, prev - 1)
                    if prev > 0 and span_n[old] == 0:
                        n_mgr = max(0, n_mgr - 1)
                    if span_n[old] < SPAN_HI and old not in cap and depths.get(old, 99) <= 7:
                        cap.append(old)
                prev_new = span_n.get(new_mgr, 0)
                span_n[new_mgr] = prev_new + 1
                if prev_new == 0:
                    n_mgr += 1
                if span_n[new_mgr] >= SPAN_HI:
                    cap = [c for c in cap if c != new_mgr]
                depths[w["worker_id"]] = depths.get(new_mgr, 0) + 1

            for w in self.workers:
                if not self._certified(w, day) or w["worker_id"] == self.ceo_id:
                    continue
                if depths.get(w["worker_id"], 99) <= 8:
                    continue
                new_mgr = take_target({w["worker_id"]})
                if not new_mgr:
                    continue
                apply_move(w, new_mgr, w.get("reports_to"))
                moved = True

            overs = {mgr for mgr, n in span_n.items() if n > SPAN_HI}
            if overs:
                by_mgr: dict[str, list[dict]] = {}
                for w in self.workers:
                    if not self._certified(w, day):
                        continue
                    mgr = w.get("reports_to")
                    if mgr in overs:
                        by_mgr.setdefault(mgr, []).append(w)
                for mgr_id, reps in by_mgr.items():
                    extras = sorted(reps, key=lambda x: x["worker_id"])[SPAN_HI:]
                    for x in extras:
                        new_mgr = take_target({x["worker_id"], mgr_id})
                        if not new_mgr:
                            continue
                        apply_move(x, new_mgr, mgr_id)
                        moved = True
            keep = max(5, int(round(SPAN_MEDIAN)))
            mean = (sum(span_n.values()) / n_mgr) if n_mgr else 0.0
            share_now = (n_mgr / hc) if hc else 0.0
            high = {mgr for mgr, n in span_n.items() if n > keep} if (mean > 9.0 or share_now < 0.10) else set()
            if high:
                by_high: dict[str, list[dict]] = {}
                for w in self.workers:
                    if not self._certified(w, day):
                        continue
                    mgr = w.get("reports_to")
                    if mgr in high:
                        by_high.setdefault(mgr, []).append(w)
                for mgr_id, reps in by_high.items():
                    extras = sorted(reps, key=lambda x: x["worker_id"])[keep:]
                    for x in extras:
                        new_mgr = take_target({x["worker_id"], mgr_id})
                        if not new_mgr:
                            continue
                        apply_move(x, new_mgr, mgr_id)
                        moved = True
            if not moved:
                break
            self._rebuild_org_index()

    def _clip_depth(self, day: date) -> None:
        depths = self._certified_depths(day)
        reports = self._certified_reports(day)
        d1 = [
            wid
            for wid, dpth in depths.items()
            if dpth == 1 and len(reports.get(wid, [])) < SPAN_HI
        ]
        for w in self.workers:
            if not self._certified(w, day) or w["worker_id"] == self.ceo_id:
                continue
            if depths.get(w["worker_id"], 99) <= 8:
                continue
            if d1:
                tgt = min(d1, key=lambda t: (len(reports.get(t, [])), t))
            else:
                tgt = self.ceo_id
            if not tgt or tgt == w["worker_id"]:
                continue
            old = w.get("reports_to")
            self._move_report(w, tgt, day, "reorg")
            if old:
                reports[old] = [r for r in reports.get(old, []) if r["worker_id"] != w["worker_id"]]
            reports.setdefault(tgt, []).append(w)
            if len(reports.get(tgt, [])) >= SPAN_HI:
                d1 = [x for x in d1 if x != tgt]
        self._rebuild_org_index()

    def _sync_employee_if_stale(self, w: dict, day: date) -> None:
        idx = self._last_emp_idx.get(w["worker_id"])
        if idx is None:
            self._emit_employee(w, day)
            return
        last = self.employee_versions[idx]
        status = (
            "Left"
            if w.get("termination_date") is not None and w["termination_date"] <= day
            else w["status"]
        )
        if (
            last.get("reports_to") != w.get("reports_to")
            or last.get("status") != status
            or last.get("employment_type") != w["employment_type"]
            or last.get("grade") != w.get("grade")
        ):
            self._emit_employee(w, day)

    def _repair_org(self, day: date) -> None:
        living = self._certified_managers(day)
        if self.ceo_id not in living:
            suc = next(iter(living.values()), None)
            if suc is None:
                return
            suc["reports_to"] = None
            suc["org_role"] = "leader"
            suc["org_level"] = 0
            suc["_change_reason"] = "manager_departure"
            self.ceo_id = suc["worker_id"]
            self._emit_employee(suc, day)
            living = self._certified_managers(day)
        ceo = living.get(self.ceo_id)
        if ceo is not None and ceo.get("reports_to") is not None:
            ceo["reports_to"] = None
            ceo["_change_reason"] = "reorg"
            self._emit_employee(ceo, day)
        for w in self.workers:
            if w.get("termination_date") is not None:
                continue
            if not self._certified(w, day):
                continue
            if w["worker_id"] == self.ceo_id:
                if w.get("reports_to") is not None:
                    w["reports_to"] = None
                    w["_change_reason"] = "reorg"
                    self._emit_employee(w, day)
                continue
            mgr = w.get("reports_to")
            boss = living.get(mgr) if mgr else None
            reason = None
            if boss is not None and int(boss.get("org_level") or 0) >= MAX_LEVEL:
                w["reports_to"] = boss.get("reports_to") or self.ceo_id
                reason = "reorg"
            elif mgr in living and mgr != w["worker_id"]:
                pass
            else:
                new_mgr = self._hash_new_manager(w, day) or self.ceo_id
                if new_mgr and new_mgr != mgr:
                    w["reports_to"] = new_mgr
                    boss = living.get(new_mgr)
                    w["org_level"] = min(MAX_LEVEL, ((boss.get("org_level") or 0) + 1) if boss else 1)
                    reason = "manager_departure" if mgr and mgr not in living else "reorg"
            if reason:
                w["_change_reason"] = reason
                self._emit_employee(w, day)
        extra_roots = [
            w
            for w in self.workers
            if self._certified(w, day)
            and w["worker_id"] != self.ceo_id
            and not w.get("reports_to")
        ]
        for w in extra_roots:
            w["reports_to"] = self.ceo_id
            w["_change_reason"] = "reorg"
            self._emit_employee(w, day)
        self._rebuild_org_index()
        self._rebalance_tree(day)
        self._clip_depth(day)
        for w in self.workers:
            if w.get("hire_date") and w["hire_date"] > day:
                continue
            if w.get("termination_date") is not None and w["termination_date"] < day:
                continue
            self._sync_employee_if_stale(w, day)
        self._rebuild_org_index()

    def _business_day(self, month_start: date, me: date, w: dict) -> date:
        day = month_start + timedelta(days=self.rng.randint(0, me.day - 1))
        return max(day, w["hire_date"])

    def _emit_interview_scorecard(
        self, app_id: int, stage_name: str, day: date, family: str, hm: int, opened: date
    ) -> None:
        interview_d, scorecard_d = self._delay_days(family, hm, day)
        starts = day + timedelta(days=interview_d)
        submitted = starts + timedelta(days=1 + scorecard_d)
        self.next_interview += 1
        interview_id = self.next_interview
        self.interviews.append(
            {
                "id": interview_id,
                "application_id": app_id,
                "job_interview_id": STAGE_IDS[stage_name],
                "starts_at": utc(starts, 14),
                "ends_at": utc(starts, 15),
                "status": "complete",
                "hiring_manager_id": hm,
                "job_family": family,
            }
        )
        self.next_scorecard += 1
        rating = "yes" if self.rng.random() < 0.55 else "no"
        self.scorecards.append(
            {
                "id": self.next_scorecard,
                "application_id": app_id,
                "interview_kit_id": STAGE_IDS[stage_name],
                "interview_id": interview_id,
                "submitter_id": hm,
                "interviewer_id": hm,
                "candidate_rating": rating,
                "overall_recommendation": rating,
                "submitted_at": utc(submitted, 16),
                "status": "complete",
                "hiring_manager_id": hm,
                "job_family": family,
            }
        )

    def _walk_crowd_app(
        self,
        *,
        job_id: int,
        opening_id: int,
        family: str,
        hm: int,
        opened: date,
        close_day: date,
        hired_app: bool,
        region: str | None = None,
    ) -> None:
        region = region or REGIONS[opening_id % len(REGIONS)]
        self.next_cand += 1
        cand_id = self.next_cand
        self.next_app += 1
        app_id = self.next_app
        source = "referral" if hired_app and self.rng.random() < 0.4 else self._source()
        created = opened + timedelta(days=self.rng.randint(0, max(1, (close_day - opened).days // 3)))
        self.candidates.append({"id": cand_id, "created_at": utc(created - timedelta(days=1))})
        cursor = created
        reached = ["Application Review"]
        rejected = False
        quick_reject = False
        if hired_app:
            reached = ["Application Review", "Phone Screen", "Onsite", "Offer"]
        else:
            conv = float(self.rec["review_to_screen"].get(source) or 0.1)
            roll = self.rng.random()
            inbound_quick = float(self.rec.get("inbound_review_quick_reject") or 0.65)
            if roll < conv:
                reached.append("Phone Screen")
                if self.rng.random() < float(self.rec.get("screen_to_onsite") or 0.5):
                    reached.append("Onsite")
                    if self.rng.random() < float(self.rec.get("onsite_to_offer") or 0.4):
                        reached.append("Offer")
            else:
                rejected = True
                if source == "inbound" and roll < conv + inbound_quick:
                    quick_reject = True
        dwells = {
            "Application Review": self._stage_dwell(
                "Application Review", family=family, day=created, hm=hm, quick_reject=quick_reject
            ),
            "Phone Screen": self._stage_dwell("Phone Screen", family=family, day=created, hm=hm),
            "Onsite": self._stage_dwell("Onsite", family=family, day=created, hm=hm),
            "Offer": self._stage_dwell("Offer", family=family, day=created, hm=hm),
        }
        last_status = "hired" if hired_app else "rejected"
        last_stage_id = STAGE_IDS[reached[-1]]
        for idx, name in enumerate(reached):
            is_last = idx == len(reached) - 1
            exited = None if (is_last and hired_app) else cursor + timedelta(days=dwells[name])
            self._emit_stage(app_id, name, cursor, exited)
            if name in ("Phone Screen", "Onsite"):
                self._emit_interview_scorecard(app_id, name, cursor, family, hm, opened)
            if exited:
                cursor = exited
        self.applications.append(
            {
                "id": app_id,
                "candidate_id": cand_id,
                "job_id": job_id,
                "status": last_status,
                "created_at": utc(created),
                "job_interview_stage_id": last_stage_id,
                "recruiter_id": self._recruiter_id(family, region, opening_id),
                "source_id": SOURCE_IDS[source],
                "source_name": source,
                "opening_id": opening_id,
                "rejected_at": None if hired_app else utc(cursor),
                "hired_at": utc(cursor) if hired_app else None,
                "rejection_reason_id": 1 if hired_app else 10,
            }
        )
        return app_id if hired_app else None

    def _t1_fill_opening(self, hire_day: date, w: dict) -> None:
        job_id = self.next_job
        self.next_job += 1
        opening_id = self.next_opening
        self.next_opening += 1
        n_apps = self._n_apps(w["job_family"])
        hm = self._hm_for(w["job_family"], hire_day)
        opened = hire_day - timedelta(days=self._time_to_fill_days(w["job_family"], hm, hire_day))
        if opened >= hire_day:
            opened = hire_day - timedelta(days=10)
        accept_p = self.accept_p
        case4_from = date.fromisoformat(str(self.case4["effective"]["from"]))
        if hire_day >= case4_from and w["job_family"] == "Sales":
            accept_p += float((self.case4.get("effect") or {}).get("offer_acceptance_delta") or -0.08)
        crowd = max(0, n_apps - 1)
        for _ in range(crowd):
            self._walk_crowd_app(
                job_id=job_id,
                opening_id=opening_id,
                family=w["job_family"],
                hm=hm,
                opened=opened,
                close_day=hire_day,
                hired_app=False,
                region=w["region"],
            )
        version = 1
        hired = False
        last_opening_row = None
        bundle = None
        for _try in range(6):
            self.next_cand += 1
            cand_id = self.next_cand
            self.next_app += 1
            app_id = self.next_app
            self.next_offer += 1
            offer_id = self.next_offer
            accept = hired is False and (self.rng.random() < accept_p or _try == 5)
            bundle = t1_hire_instance(
                hire_day,
                emp=w["worker_id"],
                app_id=app_id,
                job_id=job_id,
                opening_id=opening_id,
                offer_id=offer_id,
                cand_id=cand_id,
                offer_status="Accepted" if accept else "Rejected",
                offer_version=version,
                employment_type=w["employment_type"],
                department=DEPT_BY_FAMILY[w["job_family"]],
                designation=JOB_BY_FAMILY[w["job_family"]],
                grade=w["grade"],
                branch=BRANCH[w["region"]],
                person_id_value=w["person_id"],
            )
            offer = bundle["offer"]
            app = bundle["application"]
            app["source_id"] = SOURCE_IDS["referral"] if accept else SOURCE_IDS[self._source()]
            app["source_name"] = "referral" if accept else "inbound"
            app["opening_id"] = opening_id
            app["recruiter_id"] = self._recruiter_id(w["job_family"], w["region"], opening_id)
            app["hired_at"] = utc(hire_day) if accept else None
            app["rejected_at"] = None if accept else utc(hire_day)
            app["rejection_reason_id"] = 1 if accept else 10
            self.offers.append(offer)
            self.applications.append(app)
            self.candidates.append(bundle["candidate"])
            last_opening_row = bundle["opening"]
            last_opening_row["hiring_manager_id"] = hm
            last_opening_row["job_family"] = w["job_family"]
            last_opening_row["recruiter_id"] = self._recruiter_id(w["job_family"], w["region"], opening_id)
            last_opening_row["region"] = w["region"]
            created = date.fromisoformat(app["created_at"][:10])
            cursor = created
            path = ["Application Review", "Phone Screen", "Onsite", "Offer"]
            dwells = [
                self._stage_dwell(name, family=w["job_family"], day=hire_day, hm=hm) for name in path
            ]
            for idx, name in enumerate(path):
                is_last = idx == len(path) - 1
                exited = None if (is_last and accept) else cursor + timedelta(days=dwells[idx])
                self._emit_stage(app_id, name, cursor, exited)
                if name in ("Phone Screen", "Onsite"):
                    self._emit_interview_scorecard(app_id, name, cursor, w["job_family"], hm, opened)
                if exited:
                    cursor = exited
            if accept:
                self.identities.append(bundle["identity"])
                hired = True
                self.accepted_offer_count += 1
                w["hired_via_application_id"] = app_id
                break
            version += 1
        last_opening_row["open"] = False
        last_opening_row["closed_at"] = utc(hire_day, 9)
        last_opening_row["application_id"] = bundle["application"]["id"]
        last_opening_row["close_reason_id"] = 1
        last_opening_row["opened_at"] = utc(opened)
        last_opening_row["hiring_manager_id"] = hm
        last_opening_row["job_family"] = w["job_family"]
        last_opening_row["recruiter_id"] = self._recruiter_id(w["job_family"], w["region"], opening_id)
        last_opening_row["region"] = w["region"]
        self.openings.append(last_opening_row)

    def _emit_cancelled_opening(self, month_start: date, me: date) -> None:
        family = weighted_choice(self.rng, self.baseline["population"]["job_family_mix"])
        job_id = self.next_job
        self.next_job += 1
        opening_id = self.next_opening
        self.next_opening += 1
        opened = month_start + timedelta(days=self.rng.randint(0, max(0, me.day - 10)))
        closed = me
        hm = self._hm_for(family, closed)
        n_apps = self._n_apps(family)
        for _ in range(n_apps):
            self._walk_crowd_app(
                job_id=job_id,
                opening_id=opening_id,
                family=family,
                hm=hm,
                opened=opened,
                close_day=closed,
                hired_app=False,
            )
        self.openings.append(
            {
                "id": opening_id,
                "job_id": job_id,
                "open": False,
                "opened_at": utc(opened),
                "closed_at": utc(closed),
                "application_id": None,
                "close_reason_id": 99,
                "hiring_manager_id": hm,
                "job_family": family,
                "recruiter_id": self._recruiter_id(family, REGIONS[opening_id % len(REGIONS)], opening_id),
                "region": REGIONS[opening_id % len(REGIONS)],
            }
        )

    def _hire_via_t1(self, hire_day: date, is_rehire: bool = False) -> dict:
        person = None
        if is_rehire and self.left_pool:
            prior = self.left_pool.pop(0)
            person = prior["person_id"]
        w = self._new_person_worker(hire_day, person=person, is_rehire=is_rehire, via_t1=True)
        self._place_in_tree(w)
        self._t1_fill_opening(hire_day, w)
        self._emit_employee(w, hire_day)
        self._emit_ssa(w, hire_day)
        self._emit_skills(w, hire_day)
        return w

    def _assign_managers(self) -> None:
        self.ceo_id = build_company_tree(self.workers, DEPT_BY_FAMILY)
        last_by_name = {}
        for row in self.employee_versions:
            last_by_name[row["name"]] = row
        for w in self.workers:
            row = last_by_name.get(w["worker_id"])
            if row is None:
                continue
            row["reports_to"] = w.get("reports_to")
            row["department"] = DEPT_BY_FAMILY[w["job_family"]]
            row["designation"] = JOB_BY_FAMILY[w["job_family"]]
            row["job_family"] = w["job_family"]
        self._rebuild_org_index()

    def seed_opening_stock(self) -> None:
        pop = self.baseline["population"]
        mix = pop["t0_tenure_mix"]
        days = pop["t0_tenure_days"]
        for _ in range(self.opening_n):
            band = weighted_choice(self.rng, mix)
            lo, hi = days[band]
            age = self.rng.randint(lo, hi)
            hire = START - timedelta(days=max(age, 1))
            w = self._new_person_worker(hire, person=None, is_rehire=False, via_t1=False)
            w["person_id"] = person_id("frappe_hr", "Employee", w["worker_id"])
            self._emit_employee(w, hire)
            self._emit_ssa(w, hire)
            self._emit_skills(w, hire)
        self._assign_managers()
        self.opening_certified = sum(1 for w in self.workers if self._certified(w, START))
        print("seed_opening_stock", len(self.workers), "certified", self.opening_certified, flush=True)

    def _terminate(self, w: dict, day: date, reason: str) -> None:
        w["termination_date"] = max(day, w["hire_date"])
        w["reason"] = reason
        w["termination_category"] = e6_category(reason)
        w["status"] = "Left"
        self.left_pool.append(w)
        self._emit_employee(w, day)
        self._reassign_reports(w, day)
        self.separations.append(
            {
                "doctype": "Employee Separation",
                "name": f"HR-EMP-SEP-{self.next_sep:06d}",
                "employee": w["worker_id"],
                "boarding_begins_on": day.isoformat(),
                "boarding_status": "Completed",
                "docstatus": 1,
            }
        )
        self.next_sep += 1

    def _maybe_mobility(self, w: dict, month_start: date, me: date) -> None:
        if w["status"] != "Active":
            return
        if w["worker_id"] == self.ceo_id:
            return
        mgr_m = self.mgr_m
        if me >= COMPA_FROM and in_case3_slice(w, me, self.case3):
            mgr_m *= 3.0
            for sig in self.case3.get("correlated_signals") or []:
                if sig.get("id") == "manager_change_cluster":
                    mgr_m = self.mgr_m * float((sig.get("effect") or {}).get("manager_change_annual_multiplier") or 3.0)
                    break
        if self._hash01(f"{w['worker_id']}|promo|{me.isoformat()}") < self.promo_m:
            grades = FAMILY_GRADES[w["job_family"]]
            idx = grades.index(w["grade"]) if w["grade"] in grades else 0
            old_grade = w["grade"]
            new_grade = grades[min(idx + 1, len(grades) - 1)]
            day = self._business_day(month_start, me, w)
            promo_name = f"HR-EMP-PRO-{self.next_promo:06d}"
            self.promotions.append(
                {
                    "doctype": "Employee Promotion",
                    "name": promo_name,
                    "employee": w["worker_id"],
                    "promotion_date": day.isoformat(),
                    "docstatus": 1,
                    "grade": new_grade,
                }
            )
            self.next_promo += 1
            ph_idx = 1
            if old_grade != new_grade:
                self.property_history.append(
                    self._ph(promo_name, "Employee Promotion", w["worker_id"], day, "grade", old_grade, new_grade, ph_idx)
                )
                ph_idx += 1
            if accompany_reports_to(w["worker_id"], day):
                old_mgr = w.get("reports_to")
                new_mgr = self._hash_new_manager(w, day)
                if new_mgr and new_mgr != old_mgr:
                    w["reports_to"] = new_mgr
                    self.property_history.append(
                        self._ph(
                            promo_name,
                            "Employee Promotion",
                            w["worker_id"],
                            day,
                            "reports_to",
                            old_mgr,
                            new_mgr,
                            ph_idx,
                            change_reason="transfer",
                        )
                    )
            w["grade"] = new_grade
            self._emit_ssa(w, day, new_grade)
            self._emit_employee(w, day)
            return
        if self._hash01(f"{w['worker_id']}|xfer|{me.isoformat()}") < self.transfer_m and w.get("org_role") == "ic":
            day = self._business_day(month_start, me, w)
            xfer_name = f"HR-EMP-TRN-{self.next_transfer:06d}"
            self.transfers.append(
                {
                    "doctype": "Employee Transfer",
                    "name": xfer_name,
                    "employee": w["worker_id"],
                    "transfer_date": day.isoformat(),
                    "docstatus": 1,
                }
            )
            self.next_transfer += 1
            families = [f for f in FAMILY_GRADES if f != w["job_family"]]
            new_family = hash_pick(f"{w['worker_id']}|{day.isoformat()}|xfer_fam", families)
            old_dept = DEPT_BY_FAMILY[w["job_family"]]
            old_desig = JOB_BY_FAMILY[w["job_family"]]
            old_mgr = w.get("reports_to")
            w["job_family"] = new_family
            new_dept = DEPT_BY_FAMILY[new_family]
            new_desig = JOB_BY_FAMILY[new_family]
            new_mgr = self._hash_new_manager(w, day)
            if not new_mgr:
                leaders = [
                    x["worker_id"]
                    for x in self.workers
                    if x.get("termination_date") is None
                    and DEPT_BY_FAMILY[x["job_family"]] == new_dept
                    and x.get("org_role") == "leader"
                    and x["worker_id"] != w["worker_id"]
                ]
                new_mgr = leaders[0] if leaders else self.ceo_id
            ph_idx = 1
            self.property_history.append(
                self._ph(xfer_name, "Employee Transfer", w["worker_id"], day, "department", old_dept, new_dept, ph_idx)
            )
            ph_idx += 1
            self.property_history.append(
                self._ph(xfer_name, "Employee Transfer", w["worker_id"], day, "designation", old_desig, new_desig, ph_idx)
            )
            ph_idx += 1
            if new_mgr and new_mgr != old_mgr:
                w["reports_to"] = new_mgr
                self.property_history.append(
                    self._ph(
                        xfer_name,
                        "Employee Transfer",
                        w["worker_id"],
                        day,
                        "reports_to",
                        old_mgr,
                        new_mgr,
                        ph_idx,
                        change_reason="transfer",
                    )
                )
            boss = next((x for x in self.workers if x["worker_id"] == w.get("reports_to")), None)
            w["org_role"] = "ic"
            w["org_level"] = min(MAX_LEVEL, ((boss.get("org_level") or 1) + 1) if boss else 2)
            self._emit_employee(w, day)
            return
        if self._hash01(f"{w['worker_id']}|t7|{me.isoformat()}") < mgr_m:
            day = month_start + timedelta(days=int(self._hash01(f"{w['worker_id']}|t7day|{me.isoformat()}") * me.day))
            day = max(day, w["hire_date"])
            new_mgr = self._hash_new_manager(w, day)
            if not new_mgr:
                return
            current = w.get("reports_to")
            if new_mgr == current:
                return
            w["reports_to"] = new_mgr
            w["_change_reason"] = "reorg"
            self.manager_changes.append(
                {
                    "employee": w["worker_id"],
                    "change_date": day.isoformat(),
                    "current": current,
                    "new": new_mgr,
                    "region": w["region"],
                    "job_family": w["job_family"],
                    "tenure_band": tenure_band(w["hire_date"], day),
                    "change_reason": "reorg",
                }
            )
            self._emit_employee(w, day)

    def _maybe_comp_cycle(self, me: date) -> None:
        if me.month != int(self.baseline["compensation"]["cycle_month"]):
            return
        if me.year in self.cycle_years_emitted:
            return
        self.cycle_years_emitted.add(me.year)
        cycle_day = date(me.year, 4, 1)
        for w in self.workers:
            if w["termination_date"] is not None and w["termination_date"] < cycle_day:
                continue
            if w["hire_date"] > cycle_day:
                continue
            self._emit_ssa(w, cycle_day)

    def _maybe_case3_compa(self, me: date, month_start: date) -> None:
        if not (month_start <= COMPA_FROM <= me):
            return
        for w in self.workers:
            if w["termination_date"] is not None and w["termination_date"] < COMPA_FROM:
                continue
            if not in_case3_slice(w, COMPA_FROM, self.case3):
                continue
            self._emit_ssa(w, COMPA_FROM)

    def _maybe_appraisals(self, me: date) -> None:
        if me.month != 6:
            return
        year = me.year
        cycle_name = f"FY{year}"
        if not any(c["name"] == cycle_name for c in self.appraisal_cycles):
            self.appraisal_cycles.append(
                {
                    "doctype": "Appraisal Cycle",
                    "name": cycle_name,
                    "cycle_name": cycle_name,
                    "start_date": f"{year}-01-01",
                    "end_date": f"{year}-12-31",
                    "status": "Completed",
                    "calculate_final_score_based_on_formula": 0,
                }
            )
        day = date(year, 6, 15)
        for w in self.workers:
            if w["termination_date"] is not None and w["termination_date"] < day:
                continue
            months_ten = (day.year - w["hire_date"].year) * 12 + day.month - w["hire_date"].month
            if months_ten < 6:
                continue
            score = round(self.rng.uniform(2.4, 4.8), 2)
            self.appraisals.append(
                {
                    "doctype": "Appraisal",
                    "name": f"HR-APR-{self.next_apr:06d}",
                    "employee": w["worker_id"],
                    "appraisal_cycle": cycle_name,
                    "total_score": score,
                    "self_score": min(5.0, round(score + 0.2, 2)),
                    "avg_feedback_score": score,
                    "final_score": score,
                    "docstatus": 1,
                    "modified": utc(day),
                    "submitted_at": utc(day, 12),
                }
            )
            self.next_apr += 1

    def _maybe_training(self, month_start: date, me: date) -> None:
        learn = self.baseline["learning"]
        annual = float(learn.get("training_events_per_year") or 9000)
        n = max(1, int(round(annual * self.scale / 12.0)))
        attendee_n = int(learn.get("attendees_per_event") or 22)
        hours_choices = learn.get("hours_choices") or [4, 5, 6]
        active = [w for w in self.workers if w["termination_date"] is None or w["termination_date"] > month_start]
        if not active:
            return
        for _ in range(n):
            day = month_start + timedelta(days=self.rng.randint(0, me.day - 1))
            event_name = f"HR-TRN-EVT-{self.next_trn:06d}"
            result_name = f"HR-TRN-RES-{self.next_trn:06d}"
            self.next_trn += 1
            hours = float(self.rng.choice(list(hours_choices)))
            self.training_events.append(
                {
                    "doctype": "Training Event",
                    "name": event_name,
                    "event_name": "Internal course",
                    "start_time": utc(day, 9),
                    "end_time": utc(day, 9 + int(max(1, hours))),
                    "level": "Intermediate",
                    "course": "GlobalTech Academy",
                    "docstatus": 1,
                }
            )
            self.training_results.append(
                {
                    "doctype": "Training Result",
                    "name": result_name,
                    "training_event": event_name,
                    "docstatus": 1,
                }
            )
            attendees = self.rng.sample(active, k=min(attendee_n, len(active)))
            for w in attendees:
                self.training_event_employees.append(
                    {
                        "doctype": "Training Event Employee",
                        "parent": event_name,
                        "employee": w["worker_id"],
                        "attendance": "Present",
                        "status": "Completed",
                    }
                )
                self.training_result_employees.append(
                    {
                        "doctype": "Training Result Employee",
                        "parent": result_name,
                        "employee": w["worker_id"],
                        "hours": hours,
                        "grade": "A",
                        "training_event": event_name,
                    }
                )

    def _maybe_engagement(self, me: date) -> None:
        if me.month not in (6, 11):
            return
        wave_id = f"WAV-{me.year}-{me.month:02d}"
        if any(w["wave_id"] == wave_id for w in self.survey_waves):
            return
        lo, hi = self.baseline["engagement"]["response_rate"]
        rate = self.rng.uniform(float(lo), float(hi))
        active = [w for w in self.workers if w["termination_date"] is None or w["termination_date"] > me]
        self.survey_waves.append(
            {
                "wave_id": wave_id,
                "instrument_version": "engagement_ext.instrument.v1",
                "start_date": date(me.year, me.month, 1).isoformat(),
                "end_date": me.isoformat(),
                "target_population": "active_workers",
                "response_rate": round(rate, 4),
                "n_invited": len(active),
            }
        )
        n_resp = int(round(len(active) * rate))
        responders = self.rng.sample(active, k=min(n_resp, len(active))) if active else []
        for w in responders:
            for item, dim in SURVEY_ITEMS:
                score = self.rng.randint(3, 5) if item[-1] != "3" else self.rng.randint(2, 4)
                self.survey_responses.append(
                    {
                        "response_id": f"RSP-{w['worker_id']}-{wave_id}-{item}",
                        "wave_id": wave_id,
                        "worker_id": w["worker_id"],
                        "item_id": item,
                        "dimension": dim,
                        "score": score,
                    }
                )

    def _flush_recruiting(self, month_end: date) -> None:
        if self.lake is None or self.prefix is None:
            return
        from emit_bronze import write_rows

        root = self.lake / "people_bronze" / self.prefix
        tag = month_end.isoformat()[:7]
        pairs = [
            ("greenhouse_v3/application", self.applications),
            ("greenhouse_v3/application_stage", self.application_stages),
            ("greenhouse_v3/interview", self.interviews),
            ("greenhouse_v3/scorecard", self.scorecards),
            ("greenhouse_v3/candidate", self.candidates),
            ("greenhouse_v3/offer", self.offers),
            ("greenhouse_v3/opening", self.openings),
            ("engagement_ext/survey_response", self.survey_responses),
            ("frappe_hr/Salary_Structure_Assignment", self.ssa),
            ("frappe_hr/Appraisal", self.appraisals),
            ("frappe_hr/Employee_Skill", self.employee_skills),
        ]
        for rel, rows in pairs:
            if not rows:
                continue
            write_rows(root / rel / f"month={tag}" / "part.parquet", rows)
            rows.clear()

    def _emit_open_pipeline(self) -> None:
        """Stock open reqs so as-of open ≈ monthly hires × TTF months (Little's law)."""
        ttf_days = float((self.rec.get("time_to_fill_lognormal") or {}).get("median_days") or 32)
        ttf_months = ttf_days / 30.44
        n_months = max(1, (END.year - START.year) * 12 + END.month - START.month)
        monthly_hires = max(1.0, self.cumulative_hires / n_months)
        n_open = max(self.n_recruiters, int(round(monthly_hires * ttf_months)))
        families = list(JOB_BY_FAMILY)
        for i in range(n_open):
            family = hash_pick(f"openpipe|{i}|fam", families)
            region = hash_pick(f"openpipe|{i}|reg", list(REGIONS))
            job_id = self.next_job
            self.next_job += 1
            opening_id = self.next_opening
            self.next_opening += 1
            opened = END - timedelta(days=7 + (i % max(1, int(ttf_days))))
            hm = self._hm_for(family, END)
            n_apps = max(4, self._n_apps(family) // 8)
            for _ in range(n_apps):
                self._walk_crowd_app(
                    job_id=job_id,
                    opening_id=opening_id,
                    family=family,
                    hm=hm,
                    opened=opened,
                    close_day=END,
                    hired_app=False,
                    region=region,
                )
            self.openings.append(
                {
                    "id": opening_id,
                    "job_id": job_id,
                    "open": True,
                    "opened_at": utc(opened),
                    "closed_at": None,
                    "application_id": None,
                    "close_reason_id": None,
                    "hiring_manager_id": hm,
                    "job_family": family,
                    "recruiter_id": self._recruiter_id(family, region, opening_id),
                    "region": region,
                }
            )

    def simulate(self) -> dict:
        months = month_ends(START, END)
        self.seed_opening_stock()
        for i, me in enumerate(months):
            self._rebuild_org_index()
            month_start = date(me.year, me.month, 1)
            certified_now = sum(1 for w in self.workers if self._certified(w, month_start - timedelta(days=1) if month_start > START else START))
            if i == 0:
                certified_now = sum(1 for w in self.workers if self._certified(w, START))
            progress = (i + 1) / len(months)
            target = self.opening_certified + progress * (self.target_end - self.opening_certified)
            expected_terms = 0.0
            for w in self.workers:
                if w["termination_date"] is not None:
                    continue
                if not self._certified(w, me):
                    continue
                expected_terms += self._hazard_m(w, me)
            n_hire = max(0, int(round(target - certified_now + expected_terms)))
            print(
                f"sim_month {me.isoformat()} workers={len(self.workers)} n_hire={n_hire}",
                flush=True,
            )
            for _ in range(n_hire):
                hire_day = month_start + timedelta(days=self.rng.randint(0, me.day - 1))
                is_rehire = bool(self.left_pool) and self.rng.random() < self.rehire_rate
                self._hire_via_t1(hire_day, is_rehire=is_rehire)
            print(f"sim_month_hires_done {me.isoformat()}", flush=True)
            self._rebuild_org_index()
            self.cumulative_hires += n_hire
            want_cancel = cancelled_openings_for_hires(self.cumulative_hires, float(self.rec["openings_vs_hires_cancel_rate"]))
            for _ in range(max(0, want_cancel - self.cumulative_cancelled)):
                self._emit_cancelled_opening(month_start, me)
            self.cumulative_cancelled = want_cancel
            self._maybe_comp_cycle(me)
            self._maybe_case3_compa(me, month_start)
            self._maybe_appraisals(me)
            self._maybe_training(month_start, me)
            self._maybe_engagement(me)
            for w in list(self.workers):
                if w["termination_date"] is not None or w["hire_date"] > me:
                    continue
                haz = self._hazard_m(w, me)
                wid = w["worker_id"]
                if self._hash01(f"{wid}|vol|{me.isoformat()}") < haz:
                    term_day = month_start + timedelta(
                        days=int(self._hash01(f"{wid}|vol_day|{me.isoformat()}") * me.day)
                    )
                    reason = (
                        "Resignation - Better opportunity"
                        if self._hash01(f"{wid}|vol_reason|{me.isoformat()}") < 0.7
                        else "Resignation - Personal"
                    )
                    self._terminate(w, max(term_day, w["hire_date"]), reason)
                    continue
                if self._hash01(f"{wid}|invol|{me.isoformat()}") < self.invol_m:
                    term_day = month_start + timedelta(
                        days=int(self._hash01(f"{wid}|invol_day|{me.isoformat()}") * me.day)
                    )
                    self._terminate(w, max(term_day, w["hire_date"]), "Termination - Performance")
                    continue
                if w["employment_type"] == "Intern":
                    months_ten = (me.year - w["hire_date"].year) * 12 + me.month - w["hire_date"].month
                    if months_ten >= 12 and self._hash01(f"{wid}|intern_ft|{me.isoformat()}") < 0.25:
                        w["employment_type"] = "Full-time"
                        self._emit_employee(w, me)
                        continue
                rolled = False
                if w["status"] == "Active" and self._hash01(f"{wid}|inactive|{me.isoformat()}") < 0.001:
                    w["status"] = "Inactive"
                    self._emit_employee(w, me)
                    self._reassign_reports(w, me)
                    rolled = True
                elif w["status"] == "Inactive" and self._hash01(f"{wid}|reactivate|{me.isoformat()}") < 0.4:
                    w["status"] = "Active"
                    self._emit_employee(w, me)
                    rolled = True
                if rolled:
                    continue
                if w["status"] == "Active" and self._hash01(f"{wid}|susp|{me.isoformat()}") < 0.0015:
                    w["status"] = "Suspended"
                    self._emit_employee(w, me)
                    continue
                if w["status"] == "Suspended" and self._hash01(f"{wid}|unsusp|{me.isoformat()}") < 0.5:
                    w["status"] = "Active"
                    self._emit_employee(w, me)
                    continue
                self._maybe_mobility(w, month_start, me)
            self._repair_org(me)
            self._flush_recruiting(me)
            print(f"sim_month_flushed {me.isoformat()}", flush=True)
        self._emit_open_pipeline()
        accepted = self.accepted_offer_count
        window_hires = [w for w in self.workers if w["via_t1"]]
        return {
            "workers": self.workers,
            "employee_versions": self.employee_versions,
            "separations": self.separations,
            "offers": self.offers,
            "applications": self.applications,
            "openings": self.openings,
            "candidates": self.candidates,
            "identities": self.identities,
            "application_stages": self.application_stages,
            "interviews": self.interviews,
            "scorecards": self.scorecards,
            "ssa": self.ssa,
            "appraisals": self.appraisals,
            "appraisal_cycles": self.appraisal_cycles,
            "promotions": self.promotions,
            "transfers": self.transfers,
            "manager_changes": self.manager_changes,
            "property_history": self.property_history,
            "training_events": self.training_events,
            "training_event_employees": self.training_event_employees,
            "training_results": self.training_results,
            "training_result_employees": self.training_result_employees,
            "skill_maps": self.skill_maps,
            "employee_skills": self.employee_skills,
            "survey_waves": self.survey_waves,
            "survey_responses": self.survey_responses,
            "cancelled_openings": self.cumulative_cancelled,
            "accepted_offers": accepted,
            "window_hires": len(window_hires),
            "opening_stock": self.opening_n,
            "target_end": self.target_end,
            "comp_bands": [{"grade_id": g, "band_mid": m, "country": "US", "currency": "USD"} for g, m in BAND_MID.items()],
        }


def _load_yaml(scenario_id: str) -> dict:
    import yaml

    path = ROOT / "scenario" / "scenarios" / f"{scenario_id}.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))
