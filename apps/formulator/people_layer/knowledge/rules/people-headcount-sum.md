---
title: Headcount measure
description: Sum headcount on aggregated snapshot files.
alwaysApply: true
source: people-analytics-ai
created: 2026-08-30
---

If a file has numeric `headcount` plus country, job, or cost center in the same snapshot, it is aggregated. Use SUM(headcount), never row count. `attrition_rate` is already a rate; do not sum it as headcount.
