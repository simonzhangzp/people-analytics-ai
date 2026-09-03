from __future__ import annotations

"""scale=1.0 five-year lake backfill: bronze → mappings → silver/gold parquet. No Postgres publish.

Requires owner approval: PEOPLE_FULL_BACKFILL_APPROVED=1 or --i-have-owner-approval.
Prior misfire (2026-09-02): a GATE 2 5% pass was treated as automatic license to start
scale=1 before the owner approved step 5 second segment. That process was killed.
"""

import json
import os
import sys
from datetime import date
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent
DP = ROOT.parent
if str(DP) not in sys.path:
    sys.path.insert(0, str(DP))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from case3_closed_form import expected_rates
from emit_bronze import emit_bronze, emit_case2_extracts
from engine import END, START, WorldEngine
from pipeline.coverage import case_signals, coverage_matrix, engineering_trailing_3m, funnel_distribution
from pipeline.dq import run_gold_dq
from pipeline.landing_estimate import parquet_sizes
from pipeline.transform import transform

LAKE = DP / "lake"
SCALE = 1.0
SEED = 20260301
PREFIX = "rehearsal_1p00"
CONTROL_PREFIX = "rehearsal_1p00_nocase3"
FAULT_DAY = date(2026, 8, 14)
PRIOR_FULL = date(2026, 8, 7)
OUT = ROOT / "fixtures" / PREFIX
APPROVAL_FLAG = "--i-have-owner-approval"
APPROVAL_ENV = "PEOPLE_FULL_BACKFILL_APPROVED"
BASELINE = ROOT / "scenario" / "baseline.yaml"


def require_owner_approval(argv: list[str]) -> None:
    if APPROVAL_FLAG in argv or os.environ.get(APPROVAL_ENV) == "1":
        print("owner_approval_ok")
        return
    raise SystemExit(
        "refused: full lake backfill requires PEOPLE_FULL_BACKFILL_APPROVED=1 or "
        "--i-have-owner-approval. Do not start scale=1 just because 5% passed."
    )


def _a7_lake_only() -> bool:
    text = BASELINE.read_text(encoding="utf-8")
    return "postgres_publish_restricted_person_level: lake_only" in text


def _roll_forward(dq: list[dict]) -> dict | None:
    for row in dq:
        if row.get("test_name") == "snapshot_roll_forward":
            return row
    return None


def _run_world(prefix: str, apply_case3: bool) -> tuple[dict, object]:
    engine = WorldEngine(SCALE, SEED, apply_case3=apply_case3, lake=LAKE, prefix=prefix)
    state = engine.simulate()
    bronze = emit_bronze(state, LAKE, prefix)
    silver = LAKE / "people_silver" / prefix
    gold = LAKE / "people_gold" / prefix
    con = transform(bronze, silver, gold)
    return state, con


def _state_from_bronze(prefix: str) -> dict:
    emp = LAKE / "people_bronze" / prefix / "frappe_hr" / "Employee" / "part.parquet"
    if not emp.exists():
        raise SystemExit(f"missing bronze employee parquet: {emp}")
    return {"employee_versions": pq.read_table(emp).to_pylist()}


def _rebuild_from_bronze(prefix: str) -> tuple[dict, object]:
    bronze = LAKE / "people_bronze" / prefix
    silver = LAKE / "people_silver" / prefix
    gold = LAKE / "people_gold" / prefix
    print("rebuild_from_bronze", bronze, flush=True)
    con = transform(bronze, silver, gold)
    return _state_from_bronze(prefix), con


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--from-report" in argv:
        report = json.loads((OUT / "report.json").read_text(encoding="utf-8"))
        dest = _write_markdown(report)
        print("rewrote", dest)
        return 0
    require_owner_approval(argv)
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:
        pass
    print("scale", SCALE, "seed", SEED, "publish", False, flush=True)
    if "--from-bronze" in argv:
        state, con = _rebuild_from_bronze(PREFIX)
    else:
        state, con = _run_world(PREFIX, True)
    coverage = coverage_matrix(con)
    funnel = funnel_distribution(con)
    signals = case_signals(con)
    dq = run_gold_dq(con, backfill=True)
    dq_failed = [t for t in dq if t["status"] != "passed"]
    if dq_failed:
        print("blocking_dq_failed", json.dumps(dq_failed, default=str)[:4000])
        return 1
    ending = con.execute(
        """
        SELECT region, count(*) AS n
        FROM people_snap_worker_month
        WHERE month_end = DATE '2026-08-31' AND is_certified
        GROUP BY 1 ORDER BY 1
        """
    ).fetchdf()
    ending_by_region = {str(r.region): int(r.n) for r in ending.itertuples()}
    hires = con.execute("SELECT count(*) FROM people_dim_worker WHERE via_t1").fetchone()[0]
    accepted = con.execute("SELECT count(*) FROM people_fact_offer WHERE status = 'accepted'").fetchone()[0]
    if hires != accepted:
        print("blocking_hires_ne_accepted", hires, accepted)
        return 1
    rec = coverage["recruiting"]
    ttf_ratio = float(rec.get("time_to_fill_p90_over_p50") or 0)
    if ttf_ratio < 2.0:
        print("blocking_ttf_ratio", ttf_ratio)
        return 1
    case4_ttf = {r["group"]: r for r in signals.get("case4_time_to_fill") or []}
    case4_age = {r["group"]: r for r in signals.get("case4_onsite_aging") or []}
    slow_visible = (
        "slow_hm" in case4_ttf
        and "other_hm" in case4_ttf
        and case4_ttf["slow_hm"]["ttf_p90_days"] > case4_ttf["other_hm"]["ttf_p90_days"]
        and "slow_hm" in case4_age
        and "other_hm" in case4_age
        and case4_age["slow_hm"]["aging_p90_days"] > case4_age["other_hm"]["aging_p90_days"]
    )
    if not slow_visible:
        print("blocking_case4_tail", case4_ttf, case4_age)
        return 1
    certified_0807 = con.execute(
        """
        SELECT count(*) FROM people_hist_worker_attr h
        WHERE h.valid_from <= DATE '2026-08-07'
          AND (h.valid_to IS NULL OR h.valid_to > DATE '2026-08-07')
          AND h.hire_date <= DATE '2026-08-07'
          AND (h.termination_date IS NULL OR h.termination_date > DATE '2026-08-07')
          AND h.status IN ('Active','Suspended')
          AND h.employment_type IN ('Full-time','Part-time','Probation')
        """
    ).fetchone()[0]
    extracts = emit_case2_extracts(state, LAKE, PREFIX, FAULT_DAY, PRIOR_FULL, certified_0807)
    case3_with = engineering_trailing_3m(con)
    print("case3_control_start")
    _, con_ctrl = _run_world(CONTROL_PREFIX, False)
    case3_without = engineering_trailing_3m(con_ctrl)
    closed = expected_rates()
    measured_delta_pp = round((case3_with["annualized"] - case3_without["annualized"]) * 100, 2)
    bronze_sizes = parquet_sizes(LAKE / "people_bronze" / PREFIX)
    silver_sizes = parquet_sizes(LAKE / "people_silver" / PREFIX)
    gold_sizes = parquet_sizes(LAKE / "people_gold" / PREFIX)
    roll = _roll_forward(dq)
    report = {
        "scale": SCALE,
        "seed": SEED,
        "window": {"start": START.isoformat(), "end": END.isoformat()},
        "publish": False,
        "owner_approval": True,
        "path": "bronze → people_mappings → silver parquet → gold parquet (DuckDB)",
        "ending_certified_headcount": sum(ending_by_region.values()),
        "ending_headcount_by_region": ending_by_region,
        "recruiting": {"hires": int(hires), "offers_accepted": int(accepted), **rec},
        "coverage_matrix": coverage,
        "funnel_distribution": funnel,
        "case_signals": signals,
        "dq_failed": dq_failed,
        "roll_forward": roll,
        "case2": {
            "fault": {k: extracts["fault"][k] for k in ("extract_date", "mode", "control_total", "rows_received", "isolated", "pointer_moved", "replay")},
            "prior_full": {k: extracts["prior"][k] for k in ("extract_date", "mode", "control_total", "rows_received", "volume_test_ok")},
        },
        "case3_measured": {
            "with_scenario": case3_with,
            "without_scenario": case3_without,
            "delta_pp": measured_delta_pp,
            "closed_form_delta_pp": closed["engineering_overall"]["delta_pp"],
        },
        "case3_closed_form": closed,
        "parquet_bytes": {"bronze": bronze_sizes, "silver": silver_sizes, "gold": gold_sizes},
        "control_prefix": CONTROL_PREFIX,
        "control_prefix_role": "case3_control_only_not_serving",
        "a7_restricted_person_level": "lake_only" if _a7_lake_only() else "as_designed",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    logs = LAKE / "people_logs" / PREFIX
    logs.mkdir(parents=True, exist_ok=True)
    (logs / "report.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    _write_markdown(report)
    print("scale", SCALE, "ending", report["ending_certified_headcount"], "hires", hires, "accepted", accepted)
    print("ttf_ratio", ttf_ratio, "case3_delta_pp", measured_delta_pp)
    print("wrote", OUT / "report.json")
    return 0


def _write_markdown(report: dict) -> Path:
    dest = DP.parent / "docs" / "PEOPLE_REHEARSAL_1P00.md"
    regions = report["ending_headcount_by_region"]
    rec = report["recruiting"]
    funnel = report.get("funnel_distribution") or {}
    coverage = report.get("coverage_matrix") or {}
    signals = report.get("case_signals") or {}
    c2 = report.get("case2") or {}
    c3 = report["case3_measured"]
    parquet = report.get("parquet_bytes") or {}
    roll = report.get("roll_forward") or {}
    observed = roll.get("observed_value") or {}
    if not isinstance(observed, dict):
        observed = {}
    sample = observed.get("sample") or []
    stage = rec.get("stage_aging") or []
    mix = {row["source"]: row for row in funnel.get("source_mix") or []}
    r2s = {row["source"]: row for row in funnel.get("review_to_screen") or []}
    apps_fam = {row["job_family"]: row for row in funnel.get("apps_per_opening_by_family") or []}
    quick = funnel.get("inbound_review_quick_reject") or {}
    c4_ttf = {row["group"]: row for row in signals.get("case4_time_to_fill") or []}
    c4_age = {row["group"]: row for row in signals.get("case4_onsite_aging") or []}
    c4_sc = {row["group"]: row for row in signals.get("case4_scorecard_delay") or []}
    c3_compa = {row["group"]: row for row in signals.get("case3_compa_ratio") or []}
    c3_mgr = {row["group"]: row for row in signals.get("case3_manager_change") or []}
    waves = (coverage.get("engagement") or {}).get("waves") or []
    rr = [float(w["response_rate"]) for w in waves if w.get("response_rate") is not None]
    perf = coverage.get("performance") or {}
    bins = {int(row["score_bin"]): int(row["n"]) for row in perf.get("final_score_bins") or []}
    mobility = coverage.get("mobility") or {}
    learning = coverage.get("learning") or {}
    skills = coverage.get("skills") or {}
    gap0 = (skills.get("gap_top") or [{}])[0]
    fault = c2.get("fault") or {}
    prior = c2.get("prior_full") or {}
    bronze = parquet.get("bronze") or {}
    silver = parquet.get("silver") or {}
    gold = parquet.get("gold") or {}
    apps_n = rec.get("applications") or sum(int(row.get("n") or 0) for row in funnel.get("source_mix") or [])

    def _sum(d: dict) -> int:
        return int(sum(int(v) for v in d.values()))

    lines = [
        "# 全量 5 年 lake 回填报告（scale=1.0，不 publish）",
        "",
        "**Stop.** 步骤 5 第二段 lake 回填已完成。未 publish，未建 Postgres Silver/Gold DDL，未改线上站。"
        "全量 gold 在 lake：`people_bronze/rehearsal_1p00/`、`people_silver/rehearsal_1p00/`、`people_gold/rehearsal_1p00/`。",
        "",
        "JSON：`data-platform/simulator/fixtures/rehearsal_1p00/report.json`",
        "",
        f"seed `{report['seed']}` · 窗口 `{report['window']['start']}`–`{report['window']['end']}` · "
        "`python backfill.py --i-have-owner-approval`",
        "",
        "无 scenario 对照前缀：`rehearsal_1p00_nocase3`（**control-only**，不进 serving gold）。",
        "",
        "## 期末 certified headcount 按 region",
        "",
        "As-of 2026-08-31，gold `people_snap_worker_month`。",
        "",
        "| Region | Headcount |",
        "| --- | ---: |",
    ]
    for region in ("AMER", "EMEA", "APAC"):
        if region in regions:
            lines.append(f"| {region} | {regions[region]:,} |")
    lines += [
        f"| **合计** | **{report['ending_certified_headcount']:,}** |",
        "",
        "## 招聘完整性",
        "",
        "| 指标 | 值 |",
        "| --- | ---: |",
        f"| Hires（via T1） | {rec['hires']:,} |",
        f"| Offers accepted | {rec['offers_accepted']:,} |",
        f"| Openings | {rec.get('openings', 0):,} |",
        f"| Cancelled | {rec.get('cancelled', 0):,} |",
        f"| Cancel rate | **{rec.get('cancel_rate', 0):.4f}** |",
        f"| Applications | {int(apps_n):,} |",
        f"| time_to_fill p50 / p90 | {rec.get('time_to_fill_p50')} / {rec.get('time_to_fill_p90')} |",
        f"| p90 / p50 | **{rec.get('time_to_fill_p90_over_p50')}**（门槛 ≥ 2.0） |",
        "",
        "`hires == accepted`。Gold DQ **全部通过**（blocking 失败即停；本跑 `dq_failed = []`）。",
        "",
        "### Stage aging（全历史 lake）",
        "",
        "| Stage | p50 天 | p90 天 |",
        "| --- | ---: | ---: |",
    ]
    for row in sorted(stage, key=lambda r: str(r.get("canonical_stage") or "")):
        lines.append(
            f"| {row.get('canonical_stage')} | {int(row.get('aging_p50_days') or 0)} | {int(row.get('aging_p90_days') or 0)} |"
        )
    lines += [
        "",
        "### Source mix 与 Review→Screen",
        "",
        "| Source | Share | Review→Screen |",
        "| --- | ---: | ---: |",
    ]
    for source in ("inbound", "sourced", "referral", "internal"):
        share = mix.get(source, {}).get("share")
        conv = r2s.get(source, {}).get("conv")
        if share is None and conv is None:
            continue
        lines.append(
            f"| {source} | {float(share or 0):.2%} | {float(conv or 0):.2%} |"
        )
    qshare = quick.get("share_rejected_in_review_within_5d")
    lines += [
        "",
        f"Inbound Review 5 日内拒绝 **{float(qshare or 0):.2%}**（校准带 60–80%；lognormal dwell）。",
        "",
        "Apps / opening 均值："
        f"Engineering {apps_fam.get('Engineering', {}).get('apps_per_opening')} · "
        f"Sales {apps_fam.get('Sales', {}).get('apps_per_opening')} · "
        f"Exec {apps_fam.get('Exec', {}).get('apps_per_opening')} · "
        f"Other {apps_fam.get('Other', {}).get('apps_per_opening')}。",
        "",
        "## Roll-forward（59 个月）",
        "",
        f"`max_abs_residual = {observed.get('max_abs_residual', 0)}`，"
        f"`t1_bypass = {observed.get('t1_bypass', 0)}`，"
        f"`months = {observed.get('months', 0)}`。",
        "",
        "| Month | Active | Hires | Rehires | Terms | Status in/out | Type in/out | Residual |",
        "| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |",
    ]
    for row in sample:
        month = str(row.get("month_end") or "")[:7]
        lines.append(
            f"| {month} | {row.get('active', 0):,} | {row.get('hires', 0):,} | {row.get('rehires', 0):,} | "
            f"{row.get('terms', 0):,} | {row.get('status_in', 0)} / {row.get('status_out', 0)} | "
            f"{row.get('type_in', 0)} / {row.get('type_out', 0)} | {row.get('residual', 0)} |"
        )
    replay = fault.get("replay") or {}
    lines += [
        "",
        "## Case 2 隔离",
        "",
        "Employee full **仅周五**；08-07 与 08-14 均为周五，scenario 强制 full。`control_total` = 全部文档（含 Left）。",
        "",
        "| 项 | 08-07 prior | 08-14 故障 |",
        "| --- | --- | --- |",
        f"| mode | {prior.get('mode')} | {fault.get('mode')} |",
        f"| control_total | {int(prior.get('control_total') or 0):,} | **{int(fault.get('control_total') or 0):,}** |",
        f"| rows_received | {int(prior.get('rows_received') or 0):,} | **{int(fault.get('rows_received') or 0):,}** |",
        f"| volume test | {'通过' if prior.get('volume_test_ok') else '失败'} | 失败 |",
        f"| isolated / pointer | — | {'隔离' if fault.get('isolated') else '未隔离'}，"
        f"{'pointer 未动' if not fault.get('pointer_moved') else 'pointer 已动'} |",
        f"| replay value_bad / expected | — | {int(replay.get('value_bad') or 0):,} / {int(replay.get('value_expected') or 0):,} |",
        "",
        "## Case 3 实测 vs 闭式",
        "",
        "Engineering trailing-3m（2026-06..08）年化自愿离职。有 scenario = 主 gold；无 scenario = 同 seed 第二次全量模拟（`apply_case3=False`）。",
        "",
        "| | 年化 | person-months | voluntary terms |",
        "| --- | ---: | ---: | ---: |",
        f"| 有 scenario | **{c3['with_scenario']['annualized']}** | {c3['with_scenario']['person_months']:,} | {c3['with_scenario']['voluntary_terms']:,} |",
        f"| 无 scenario | **{c3['without_scenario']['annualized']}** | {c3['without_scenario']['person_months']:,} | {c3['without_scenario']['voluntary_terms']:,} |",
        f"| 实测 delta | **+{c3['delta_pp']} pp** | | |",
        f"| 闭式 delta | **+{c3['closed_form_delta_pp']:.2f} pp** | | |",
        "",
        "闭式 Engineering：0.1334 → 0.1574。切片相关信号（gold，非因果）："
        f"compa {c3_compa.get('slice', {}).get('median_compa')} vs {c3_compa.get('control', {}).get('median_compa')}"
        f"（n={c3_compa.get('slice', {}).get('n'):,} / {c3_compa.get('control', {}).get('n'):,}）；"
        f"manager change / worker {c3_mgr.get('slice', {}).get('changes_per_worker')} vs "
        f"{c3_mgr.get('control', {}).get('changes_per_worker')}。",
        "",
        "## Case 4（Sales，自 2026-05-01）",
        "",
        "slow-HM 101–103 在 **TTF 与 Onsite aging 的 p90 尾部**均高于对照。",
        "",
        "| | slow-HM | other HM |",
        "| --- | ---: | ---: |",
        f"| TTF p50 / p90（天） | {c4_ttf.get('slow_hm', {}).get('ttf_p50_days'):.0f} / **{c4_ttf.get('slow_hm', {}).get('ttf_p90_days'):.0f}**"
        f"（n={c4_ttf.get('slow_hm', {}).get('n'):,}） | {c4_ttf.get('other_hm', {}).get('ttf_p50_days'):.0f} / **{c4_ttf.get('other_hm', {}).get('ttf_p90_days'):.0f}**"
        f"（n={c4_ttf.get('other_hm', {}).get('n'):,}） |",
        f"| Onsite aging p50 / p90 | {c4_age.get('slow_hm', {}).get('aging_p50_days'):.0f} / **{c4_age.get('slow_hm', {}).get('aging_p90_days'):.0f}**"
        f"（n={c4_age.get('slow_hm', {}).get('n'):,}） | {c4_age.get('other_hm', {}).get('aging_p50_days'):.0f} / **{c4_age.get('other_hm', {}).get('aging_p90_days'):.0f}**"
        f"（n={c4_age.get('other_hm', {}).get('n'):,}） |",
        f"| Scorecard 提交延迟 p50 | {c4_sc.get('slow_hm', {}).get('scorecard_lag_p50_days')} 天 | {c4_sc.get('other_hm', {}).get('scorecard_lag_p50_days')} 天 |",
        f"| 面试排期延迟 p50 | {c4_sc.get('slow_hm', {}).get('interview_lag_p50_days')} 天 | {c4_sc.get('other_hm', {}).get('interview_lag_p50_days')} 天 |",
        "",
        "## 域覆盖矩阵（全量 gold）",
        "",
        "| 域 | 证据 |",
        "| --- | --- |",
        f"| **comp** | SSA **{(coverage.get('comp') or {}).get('ssa_rows'):,}**。对照 grade p50 compa-ratio **0.98**；Case 3 切片 {c3_compa.get('slice', {}).get('median_compa')}。 |",
        f"| **performance** | Appraisal **{perf.get('appraisal_rows'):,}**。final_score 2/3/4/5 → {bins.get(2, 0):,} / {bins.get(3, 0):,} / {bins.get(4, 0):,} / {bins.get(5, 0):,}。 |",
        f"| **mobility** | 年化 promotion **{float(mobility.get('promotion_annualized') or 0):.2%}** / transfer **{float(mobility.get('transfer_annualized') or 0):.2%}** / manager change **{float(mobility.get('manager_change_annualized') or 0):.2%}**"
        f"（计数 {mobility.get('promotion_count', 0):,} / {mobility.get('transfer_count', 0):,} / {mobility.get('manager_change_count', 0):,}）。 |",
        f"| **learning** | Training **{learning.get('training_rows', 0):,}**；人均 certified **{learning.get('hours_per_certified')}** 小时；次均 {learning.get('hours_per_participation')}。 |",
        f"| **skills** | 人均技能 **{skills.get('avg_skills_per_worker')}**。{gap0.get('job_family')} × {gap0.get('skill_id')} gap **{round(float(gap0.get('gap') or 0), 2)}**。 |",
        f"| **engagement** | {len(waves)} 波；response rate {min(rr):.2f}–{max(rr):.2f}。 |" if rr else "| **engagement** | 无波次。 |",
        f"| **recruiting** | 见上。取消率 {float(rec.get('cancel_rate') or 0):.2%}。 |",
        "",
        "## Parquet 体积（主 gold `rehearsal_1p00`）",
        "",
        "| 层 | 对象数 | 字节 |",
        "| --- | ---: | ---: |",
        f"| bronze | {len(bronze)} | {_sum(bronze):,}（≈ {_sum(bronze) / 1024 ** 2:.0f} MiB） |",
        f"| silver | {len(silver)} | {_sum(silver):,}（≈ {_sum(silver) / 1024 ** 2:.0f} MiB） |",
        f"| gold | {len(gold)} | {_sum(gold):,}（≈ {_sum(gold) / 1024 ** 2:.0f} MiB） |",
        "",
        "## Postgres 落地",
        "",
        "parquet × 2.8 估算已删除。磁盘以 5% gold 灌入 `people_v2` 的 `pg_total_relation_size` × 20 为准（步骤 6a-3）。"
        "准入公式：`occupied + measured × 1.3 ≤ quota − 2 GiB`。对照前缀 `rehearsal_1p00_nocase3` 为 control-only，不进 serving。",
        "",
        "## 上一轮误启动",
        "",
        "GATE 2 5% 通过后，代理把「第一段通过」当成可以自动开 `scale=1`，在 owner 确认 B 之前启动了 `backfill.py`。"
        "该进程已杀掉。现网要求：`PEOPLE_FULL_BACKFILL_APPROVED=1` 或 `--i-have-owner-approval`，否则 fail-closed。",
        "",
    ]
    dest.write_text("\n".join(lines), encoding="utf-8")
    return dest


if __name__ == "__main__":
    raise SystemExit(main())
