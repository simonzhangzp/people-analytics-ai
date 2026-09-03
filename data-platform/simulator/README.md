from __future__ import annotations

"""People v2 simulator — GATE 2.

Emits source-shaped Frappe / Harvest / engagement_ext documents. Does not write Silver.

```text
cd data-platform/simulator
python emit_day.py
python -m unittest discover -s tests -v
```

APAC extract-fault dry-run is `extract.dry_run_apac_employee_fault`.
"""
