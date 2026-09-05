# Local test data

These files exercise the People Analytics workflow. On Analyze they are stored
in the Formulator workspace. On `/workbench` they are parsed in the browser
and are not uploaded to the marketing site.

## `ibm_bpo_recruiting_candidates.csv`

- Source: [IBM Research BPO-Bench](https://huggingface.co/datasets/ibm-research/BPO-Bench)
- License: Apache-2.0
- Encoding: UTF-8
- Contents: synthetic recruiting applications, requisitions, funnel timestamps,
  offers, and hires.

## `ibm_employee_attrition.csv`

- Source: [IBM employee-attrition-aif360](https://github.com/IBM/employee-attrition-aif360)
- License: ODbL / DbCL as documented by IBM
- Encoding: UTF-8
- Contents: fictional employee attributes, performance rating, tenure, and attrition.

## VDM headcount extracts (`vdm_headcount_month_f_*.csv`)

These files are **local-only**. They are gitignored because some extracts are
larger than 50 MB and the roster file contains work emails and manager names.

| File | Role | Notes |
| --- | --- | --- |
| `vdm_headcount_month_f_202206291451.csv` | Employee hire extract | `latest_hire_dt`, `country`, `tech_designation`, `employee_number` |
| `vdm_headcount_month_f_202208081432.csv` | Employee snapshot | `record_month`, `latest_hire_dt`, `employee_number`, `data_flag` (~55 MB) |
| `vdm_headcount_month_f_202208081436.csv` | Employee snapshot | Same schema as 432, larger extract (~244 MB) |
| `vdm_headcount_month_f_202210121724.csv` | Employee roster | Department, region, tenure, manager flag; contains PII |

All four VDM files are **UTF-32 BE without BOM**. A UTF-8 parser will see
embedded nulls and broken headers. The app detects this encoding, decodes
locally, counts the full file, and keeps a 6,000-row sample in memory.

Do not use `sex` or other protected attributes as action drivers. Email and
name columns are redacted in the in-memory sample.

The 244 MB snapshot should be used for a manual large-file check. Automated
tests use `tests/fixtures/vdm-headcount-snapshot.csv` plus, when present, the
1.9 MB hire extract and 9.9 MB roster.
