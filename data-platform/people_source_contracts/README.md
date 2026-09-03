# People source contracts

Pinned, retrieved schemas. Synthetic data may populate these contracts. It must not define them.

| System | Pin | Path |
| --- | --- | --- |
| Frappe HR (hrms) | **v16.15.0** commit `1924234884731e389ecc4e5500653fcd59666911` | `frappe_hr/` |
| ERPNext | **v16.0.0** (Employee, Department, Designation, Branch) | `frappe_hr/erpnext_doctypes/` |
| Greenhouse Harvest | **v3** OpenAPI 3.1.0 extracted from harvestdocs | `greenhouse_v3/` |
| Microsoft Learn | live catalog URL | `microsoft_learn/VERSION` |
| O*NET | `db_31_0_text.zip` | `onet/VERSION` |
| BLS | publicAPI **v2** | `bls/VERSION` |

Refresh (network):

```text
python people_source_contracts/pin_source_contracts.py
python people_source_contracts/extract_greenhouse_fields.py
```

Notes discovered while pinning, not assumed from memory:

- There is **no** `employee_transfer_detail` DocType. Transfer/Promotion child rows are **Employee Property History** (`property`, `current`, `new`, `fieldname`).
- Payroll DocTypes live in **hrms/payroll** in v16, not `erpnext/payroll`.
- ERPNext Employee.json has **no** `grade` or `fte` field. Grade is on Salary Structure Assignment and the Employee Grade DocType.
- Harvest `application_stages` includes source-computed `days_in_stage`. Canonical time-in-stage uses `entered_at` / `exited_at` only.
- Harvest `user.employee_id` is the HRIS linkage key for Greenhouse user ↔ Frappe Employee.
