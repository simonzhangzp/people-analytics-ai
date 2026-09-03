# Engagement instrument (E5)

**Provenance:** `SYNTHETIC_EXTENSION` (architecture §5.10 E5). There is no Frappe HR or Greenhouse survey module in the pinned contracts.

**Sensitivity:** confidential. Item-level answers stay in the lake. Postgres serving exposes only `people_fact_survey_score_restricted` (worker × wave × dimension) through aggregate RPCs with **min cell 5**.

**Version:** `engagement_ext.instrument.v1`

## Dimensions (4)

| dimension_id | label | items |
| --- | --- | --- |
| engagement | Engagement | E1, E2, E3 |
| manager | Manager | M1, M2, M3 |
| growth | Growth | G1, G2, G3 |
| wellbeing | Wellbeing | W1, W2, W3 |

## Items (12)

Scale: 1–5 Likert (`strongly_disagree` … `strongly_agree`). Reverse-scored items are inverted to `6 - raw` before dimension means.

| item_id | dimension | reverse | prompt |
| --- | --- | --- | --- |
| E1 | engagement | false | I am proud to work at this company. |
| E2 | engagement | false | I would recommend this company as a place to work. |
| E3 | engagement | true | I often think about leaving this company. |
| M1 | manager | false | My manager supports me in doing my best work. |
| M2 | manager | false | I receive useful feedback from my manager. |
| M3 | manager | true | My manager is unavailable when I need help. |
| G1 | growth | false | I have opportunities to learn and grow. |
| G2 | growth | false | I can see a path to develop in my role. |
| G3 | growth | true | My skills are not being used. |
| W1 | wellbeing | false | My workload is sustainable. |
| W2 | wellbeing | false | I can maintain a healthy work-life balance. |
| W3 | wellbeing | true | I feel burned out by my work. |

## Objects

| object | grain | destination |
| --- | --- | --- |
| `survey_instrument` | one row per instrument version | bronze + `people_dim_survey_item` |
| `survey_wave` | wave_id, start, end, target population, response rate | `people_dim_survey_wave` |
| `survey_response` | response_id, wave_id, worker_id, item_id, score | lake only |
| dimension score | worker × wave × dimension | `people_fact_survey_score_restricted` |

Waves: two per year (May, November) in the simulator baseline. Response rate 70–85% of active workers.
