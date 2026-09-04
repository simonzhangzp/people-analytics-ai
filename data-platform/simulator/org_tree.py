from __future__ import annotations

"""Department management trees: leader → managers → IC. Hash-stable, does not consume WorldEngine.rng."""

import hashlib
import math
import random

MANAGER_SHARE = 0.12
MAX_LEVEL = 7
SPAN_MEDIAN = 7.0
SPAN_SIGMA = 0.35
SPAN_LO = 3
SPAN_HI = 15


def hash_uniform(key: str) -> float:
    digest = hashlib.md5(key.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


def hash_pick(key: str, items: list):
    if not items:
        return None
    digest = hashlib.md5(key.encode("utf-8")).digest()
    return items[int.from_bytes(digest[:4], "big") % len(items)]


def hash_lognormal_span(key: str) -> int:
    rng = random.Random(int.from_bytes(hashlib.md5(key.encode("utf-8")).digest()[:8], "big"))
    mu = math.log(SPAN_MEDIAN)
    return max(SPAN_LO, min(SPAN_HI, int(round(rng.lognormvariate(mu, SPAN_SIGMA)))))


def descendants(workers: list[dict], root_id: str, children: dict[str, list[str]] | None = None) -> set[str]:
    if children is None:
        children = {}
        for w in workers:
            mgr = w.get("reports_to")
            if mgr and w.get("termination_date") is None:
                children.setdefault(mgr, []).append(w["worker_id"])
    out: set[str] = set()
    stack = list(children.get(root_id, []))
    while stack:
        nid = stack.pop()
        if nid in out:
            continue
        out.add(nid)
        stack.extend(children.get(nid, []))
    return out


def _split_proportionally(items: list, weights: list[int]) -> list[list]:
    if not weights:
        return []
    if not items:
        return [[] for _ in weights]
    total = sum(weights) or len(weights)
    sizes = [int(round(len(items) * w / total)) for w in weights]
    delta = len(items) - sum(sizes)
    i = 0
    while delta > 0:
        sizes[i % len(sizes)] += 1
        delta -= 1
        i += 1
    while delta < 0:
        idx = i % len(sizes)
        if sizes[idx] > 0:
            sizes[idx] -= 1
            delta += 1
        i += 1
    out: list[list] = []
    cursor = 0
    for sz in sizes:
        out.append(items[cursor : cursor + sz])
        cursor += sz
    if cursor < len(items) and out:
        out[-1].extend(items[cursor:])
    return out


def _can_manage(w: dict) -> bool:
    if w.get("employment_type") == "Intern":
        return False
    if w.get("status") not in (None, "Active", "Suspended"):
        return False
    return True


def fill_tree(leader: dict, remaining: list[dict], level: int) -> None:
    """Attach remaining workers: ~12% managers, lognormal span, depth ≤ MAX_LEVEL."""
    n = 1 + len(remaining)
    n_mgr_total = max(1, min(n, int(round(n * MANAGER_SHARE))))
    n_mid = max(0, n_mgr_total - 1)
    eligible = [w for w in remaining if _can_manage(w)]
    interns = [w for w in remaining if not _can_manage(w)]
    n_mid = min(n_mid, len(eligible))
    mid = eligible[:n_mid]
    ics = eligible[n_mid:] + interns
    leaves = _nest_managers(leader, mid, level)
    _attach_ics(leaves or [leader], ics)


def _nest_managers(leader: dict, mid: list[dict], level: int) -> list[dict]:
    if not mid:
        return [leader]
    if level >= MAX_LEVEL - 2:
        for mgr in mid:
            mgr["reports_to"] = leader["worker_id"]
            mgr["org_role"] = "manager"
            mgr["org_level"] = min(MAX_LEVEL - 1, level + 1)
        return mid
    span = hash_lognormal_span(leader["worker_id"])
    direct = mid[:span]
    rest = mid[span:]
    for mgr in direct:
        mgr["reports_to"] = leader["worker_id"]
        mgr["org_role"] = "manager"
        mgr["org_level"] = level + 1
    if not rest:
        return direct or [leader]
    if not direct:
        return [leader]
    weights = [hash_lognormal_span(f"{mgr['worker_id']}|nm") for mgr in direct]
    chunks = _split_proportionally(rest, weights)
    leaves: list[dict] = []
    for boss, chunk in zip(direct, chunks):
        if chunk:
            leaves.extend(_nest_managers(boss, chunk, level + 1))
        else:
            leaves.append(boss)
    return leaves


def _attach_ics(bosses: list[dict], ics: list[dict]) -> None:
    if not bosses:
        return
    counts = {b["worker_id"]: 0 for b in bosses}
    caps = {b["worker_id"]: hash_lognormal_span(b["worker_id"]) for b in bosses}
    for ic in ics:
        ordered = sorted(bosses, key=lambda b: hash_uniform(f"{ic['worker_id']}|{b['worker_id']}"))
        chosen = next((b for b in ordered if counts[b["worker_id"]] < caps[b["worker_id"]]), None)
        if chosen is None:
            chosen = min(bosses, key=lambda b: counts[b["worker_id"]])
        ic["reports_to"] = chosen["worker_id"]
        ic["org_role"] = "ic"
        ic["org_level"] = min(MAX_LEVEL, (chosen.get("org_level") or 1) + 1)
        counts[chosen["worker_id"]] += 1


def build_company_tree(workers: list[dict], dept_by_family: dict[str, str], exec_family: str = "Exec") -> str:
    """Mutate workers in place. Return CEO worker_id."""
    by_dept: dict[str, list[dict]] = {}
    for w in workers:
        by_dept.setdefault(dept_by_family[w["job_family"]], []).append(w)
    exec_dept = dept_by_family[exec_family]
    exec_workers = sorted(by_dept.get(exec_dept, []), key=lambda w: w["worker_id"])
    if not exec_workers:
        exec_workers = sorted(workers, key=lambda w: w["worker_id"])[:1]
    ceo = exec_workers[0]
    ceo["reports_to"] = None
    ceo["org_role"] = "leader"
    ceo["org_level"] = 0
    fill_tree(ceo, exec_workers[1:], level=0)
    for dept, rows in sorted(by_dept.items()):
        if dept == exec_dept:
            continue
        rows = sorted(rows, key=lambda w: w["worker_id"])
        if not rows:
            continue
        leader = rows[0]
        leader["reports_to"] = ceo["worker_id"]
        leader["org_role"] = "leader"
        leader["org_level"] = 1
        fill_tree(leader, rows[1:], level=1)
    return ceo["worker_id"]


def _active_in_dept(
    workers: list[dict],
    w: dict,
    dept_by_family: dict[str, str],
    pool: list[dict] | None = None,
) -> list[dict]:
    dept = dept_by_family[w["job_family"]]
    rows = pool if pool is not None else workers
    return [
        x
        for x in rows
        if x is not w
        and x.get("termination_date") is None
        and dept_by_family[x["job_family"]] == dept
    ]


def place_hire(
    workers: list[dict],
    w: dict,
    dept_by_family: dict[str, str],
    ceo_id: str | None,
    pool: list[dict] | None = None,
) -> None:
    active = _active_in_dept(workers, w, dept_by_family, pool)
    mgrs = [
        x
        for x in active
        if x.get("org_role") in ("leader", "manager")
        and _can_manage(x)
        and int(x.get("org_level") or 0) < MAX_LEVEL
    ]
    n = len(active) + 1
    n_mgr = len(mgrs)
    intern = w.get("employment_type") == "Intern"
    if not mgrs:
        w["org_role"] = "leader" if not intern else "ic"
        w["org_level"] = 1 if ceo_id else 0
        w["reports_to"] = ceo_id
        return
    span_counts: dict[str, int] = {}
    for x in active:
        mgr = x.get("reports_to")
        if mgr:
            span_counts[mgr] = span_counts.get(mgr, 0) + 1
    if (not intern) and n_mgr / n < MANAGER_SHARE:
        boss = min(
            mgrs,
            key=lambda b: (span_counts.get(b["worker_id"], 0), b["worker_id"]),
        )
        w["org_role"] = "manager"
        w["reports_to"] = boss["worker_id"]
        w["org_level"] = min(MAX_LEVEL - 1, (boss.get("org_level") or 1) + 1)
        return
    w["org_role"] = "ic"
    under = [b for b in mgrs if span_counts.get(b["worker_id"], 0) < SPAN_HI]
    pool_boss = under or mgrs
    boss = min(pool_boss, key=lambda b: (span_counts.get(b["worker_id"], 0), hash_uniform(f"{w['worker_id']}|{b['worker_id']}")))
    w["reports_to"] = boss["worker_id"]
    w["org_level"] = min(MAX_LEVEL, (boss.get("org_level") or 1) + 1)


def manager_candidates(
    workers: list[dict],
    w: dict,
    dept_by_family: dict[str, str],
    *,
    pool: list[dict] | None = None,
    children: dict[str, list[str]] | None = None,
) -> list[str]:
    dept = dept_by_family[w["job_family"]]
    banned = descendants(workers, w["worker_id"], children)
    banned.add(w["worker_id"])
    rows = pool if pool is not None else workers
    return [
        x["worker_id"]
        for x in rows
        if x.get("termination_date") is None
        and dept_by_family[x["job_family"]] == dept
        and _can_manage(x)
        and x.get("org_role") in ("leader", "manager")
        and int(x.get("org_level") or 0) < MAX_LEVEL
        and x["worker_id"] not in banned
    ]


def tree_stats(workers: list[dict]) -> dict:
    active = [w for w in workers if w.get("termination_date") is None]
    reports: dict[str, int] = {}
    for w in active:
        mgr = w.get("reports_to")
        if mgr:
            reports[mgr] = reports.get(mgr, 0) + 1
    managers = [w for w in active if reports.get(w["worker_id"], 0) > 0]
    spans = [reports[w["worker_id"]] for w in managers]
    levels: dict[int, int] = {}
    for w in active:
        lvl = int(w.get("org_level") or 0)
        levels[lvl] = levels.get(lvl, 0) + 1
    mean_span = (sum(spans) / len(spans)) if spans else 0.0
    return {
        "n_active": len(active),
        "n_managers": len(managers),
        "is_manager_share": (len(managers) / len(active)) if active else 0.0,
        "span_mean": mean_span,
        "span_min": min(spans) if spans else 0,
        "span_max": max(spans) if spans else 0,
        "max_level": max(levels) if levels else 0,
        "level_counts": {str(k): levels[k] for k in sorted(levels)},
    }
