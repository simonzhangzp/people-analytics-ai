from __future__ import annotations

"""Recruiting funnel parameters: source × job_family applications and conversion."""

import math
import random


def cancelled_openings_for_hires(n_hire: int, cancel_rate: float) -> int:
    """cancel_rate is share of openings that cancel, so cancelled = hires * r / (1-r)."""
    if n_hire <= 0 or cancel_rate <= 0 or cancel_rate >= 1:
        return 0
    return int(round(n_hire * cancel_rate / (1.0 - cancel_rate)))


def lognormal_count(rng: random.Random, median: float, sigma: float = 0.55, lo: int = 8, hi: int = 800) -> int:
    mu = math.log(max(median, 1.0))
    return max(lo, min(hi, int(round(rng.lognormvariate(mu, sigma)))))


def lognormal_days(
    rng: random.Random, median: float, sigma: float = 0.72, lo: int = 1, hi: int = 240
) -> int:
    """Integer day draws. p90/p50 = exp(1.281551565 * sigma); sigma 0.72 → ~2.52."""
    mu = math.log(max(median, 1.0))
    return max(lo, min(hi, int(round(rng.lognormvariate(mu, sigma)))))


def weighted_choice(rng: random.Random, weights: dict[str, float]) -> str:
    keys = list(weights)
    totals = [float(weights[k]) for k in keys]
    s = sum(totals)
    roll = rng.random() * s
    acc = 0.0
    for key, w in zip(keys, totals):
        acc += w
        if roll <= acc:
            return key
    return keys[-1]
