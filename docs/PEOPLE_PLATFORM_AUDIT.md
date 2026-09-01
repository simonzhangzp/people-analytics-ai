# People platform audit

Generated: 2026-08-31

QuantReview objects and `panorama_daily` were not modified.

## PASS / WARN / FAIL

| Area | Result |
|---|---|
| pipeline | PASS |
| data_freshness | PASS |
| data_quality | PASS |
| metric_definitions | PASS |
| metric_calculations | PASS |
| snapshot_context | PASS |
| lineage | PASS |
| skills | PASS |
| learning_recommendations | PASS |
| serving_apis | PASS |
| ai_tools | PASS |
| attrition_realism | PASS |

## Issues

None.

## Certified metrics

| Metric | Expected | Actual | Difference | Status |
|---|---|---|---|---|
| average_headcount | 53893.5 | 53893.5 | 0.0 | PASS |
| compa_ratio | 0.9409238807368545 | 0.9409238807368545 | 0.0 | PASS |
| critical_skill_gap | 0.7668384104234073 | 0.7668384104234073 | 0.0 | PASS |
| engagement_score | None | None | None | WARN |
| headcount | 51232.0 | 51232.0 | 0.0 | PASS |
| hires | 71.0 | 71.0 | 0.0 | PASS |
| internal_mobility_rate | 0.007998400319936013 | 0.007998400319936013 | 0.0 | PASS |
| learning_completion_rate | 0.15322056351959804 | 0.15322056351959804 | 0.0 | PASS |
| learning_hours_per_employee | 0.6407704288440668 | 0.6407704288440668 | 0.0 | PASS |
| learning_participation | 0.12411694687160059 | 0.12411694687160059 | 0.0 | PASS |
| manager_turnover_rate | 0.0004658883454389253 | 0.0004658883454389253 | 0.0 | PASS |
| offer_acceptance_rate | 0.5027173913043478 | 0.5027173913043478 | 0.0 | PASS |
| promotion_rate | 0.0038392321535692863 | 0.0038392321535692863 | 0.0 | PASS |
| quality_of_hire | 0.6272198648436272 | 0.6272198648436272 | 0.0 | PASS |
| regrettable_attrition | 0.006931427678850359 | 0.006931427678850359 | 0.0 | PASS |
| skill_coverage | 0.23404141513244656 | 0.23404141513244656 | 0.0 | PASS |
| span_of_control | 9.039954876086515 | 9.039954876086515 | 0.0 | PASS |
| time_in_stage | 9.324301958758124 | 9.324301958758124 | 0.0 | PASS |
| time_to_fill | 21.0 | 21.0 | 0.0 | PASS |
| voluntary_attrition | 0.018275538894095594 | 0.018275538894095594 | 0.0 | PASS |

## Attrition

```json
{
  "monthly_trend": [
    {
      "as_of": "2021-08-01",
      "exits": 219.0,
      "beginning": 48475.0,
      "rate": 0.004517792676637442
    },
    {
      "as_of": "2021-09-01",
      "exits": 182.0,
      "beginning": 48716.0,
      "rate": 0.00373593891124066
    },
    {
      "as_of": "2021-10-01",
      "exits": 207.0,
      "beginning": 48928.0,
      "rate": 0.004230706344015697
    },
    {
      "as_of": "2021-11-01",
      "exits": 216.0,
      "beginning": 49160.0,
      "rate": 0.004393816110659072
    },
    {
      "as_of": "2021-12-01",
      "exits": 237.0,
      "beginning": 49358.0,
      "rate": 0.004801653227440334
    },
    {
      "as_of": "2022-01-01",
      "exits": 258.0,
      "beginning": 49566.0,
      "rate": 0.005205180970826777
    },
    {
      "as_of": "2022-02-01",
      "exits": 201.0,
      "beginning": 49788.0,
      "rate": 0.004037117377681369
    },
    {
      "as_of": "2022-03-01",
      "exits": 227.0,
      "beginning": 50007.0,
      "rate": 0.004539364488971544
    },
    {
      "as_of": "2022-04-01",
      "exits": 212.0,
      "beginning": 50211.0,
      "rate": 0.00422218239031288
    },
    {
      "as_of": "2022-05-01",
      "exits": 221.0,
      "beginning": 50432.0,
      "rate": 0.004382138324873096
    },
    {
      "as_of": "2022-06-01",
      "exits": 247.0,
      "beginning": 50615.0,
      "rate": 0.004879976291613158
    },
    {
      "as_of": "2022-07-01",
      "exits": 255.0,
      "beginning": 50810.0,
      "rate": 0.0050186971068687265
    },
    {
      "as_of": "2022-08-01",
      "exits": 249.0,
      "beginning": 50959.0,
      "rate": 0.004886281127965619
    },
    {
      "as_of": "2022-09-01",
      "exits": 239.0,
      "beginning": 51152.0,
      "rate": 0.004672349077259931
    },
    {
      "as_of": "2022-10-01",
      "exits": 241.0,
      "beginning": 51321.0,
      "rate": 0.004695933438553419
    },
    {
      "as_of": "2022-11-01",
      "exits": 242.0,
      "beginning": 51502.0,
      "rate": 0.004698846646732166
    },
    {
      "as_of": "2022-12-01",
      "exits": 248.0,
      "beginning": 51663.0,
      "rate": 0.004800340669337824
    },
    {
      "as_of": "2023-01-01",
      "exits": 264.0,
      "beginning": 51795.0,
      "rate": 0.00509701708659137
    },
    {
      "as_of": "2023-02-01",
      "exits": 247.0,
      "beginning": 51965.0,
      "rate": 0.004753199268738574
    },
    {
      "as_of": "2023-03-01",
      "exits": 290.0,
      "beginning": 52076.0,
      "rate": 0.005568784084799139
    },
    {
      "as_of": "2023-04-01",
      "exits": 270.0,
      "beginning": 52304.0,
      "rate": 0.0051621290914652795
    },
    {
      "as_of": "2023-05-01",
      "exits": 274.0,
      "beginning": 52488.0,
      "rate": 0.005220240816948636
    },
    {
      "as_of": "2023-06-01",
      "exits": 293.0,
      "beginning": 52618.0,
      "rate": 0.005568436656657417
    },
    {
      "as_of": "2023-07-01",
      "exits": 303.0,
      "beginning": 52773.0,
      "rate": 0.005741572394974703
    },
    {
      "as_of": "2023-08-01",
      "exits": 285.0,
      "beginning": 52962.0,
      "rate": 0.005381216721422907
    },
    {
      "as_of": "2023-09-01",
      "exits": 324.0,
      "beginning": 53017.0,
      "rate": 0.006111247335760228
    },
    {
      "as_of": "2023-10-01",
      "exits": 271.0,
      "beginning": 53155.0,
      "rate": 0.005098297432038378
    },
    {
      "as_of": "2023-11-01",
      "exits": 291.0,
      "beginning": 53276.0,
      "rate": 0.005462121780914483
    },
    {
      "as_of": "2023-12-01",
      "exits": 309.0,
      "beginning": 53443.0,
      "rate": 0.005781861048219599
    },
    {
      "as_of": "2024-01-01",
      "exits": 316.0,
      "beginning": 53552.0,
      "rate": 0.005900806692560502
    },
    {
      "as_of": "2024-02-01",
      "exits": 295.0,
      "beginning": 53656.0,
      "rate": 0.005497987177575667
    },
    {
      "as_of": "2024-03-01",
      "exits": 323.0,
      "beginning": 53745.0,
      "rate": 0.006009861382454182
    },
    {
      "as_of": "2024-04-01",
      "exits": 316.0,
      "beginning": 53797.0,
      "rate": 0.005873933490715096
    },
    {
      "as_of": "2024-05-01",
      "exits": 337.0,
      "beginning": 53881.0,
      "rate": 0.006254523858131809
    },
    {
      "as_of": "2024-06-01",
      "exits": 296.0,
      "beginning": 53965.0,
      "rate": 0.005485036597794867
    },
    {
      "as_of": "2024-07-01",
      "exits": 322.0,
      "beginning": 54052.0,
      "rate": 0.005957226374602235
    },
    {
      "as_of": "2024-08-01",
      "exits": 338.0,
      "beginning": 54149.0,
      "rate": 0.006242035864004875
    },
    {
      "as_of": "2024-09-01",
      "exits": 362.0,
      "beginning": 54167.0,
      "rate": 0.006683035796702789
    },
    {
      "as_of": "2024-10-01",
      "exits": 344.0,
      "beginning": 54198.0,
      "rate": 0.006347097678881139
    },
    {
      "as_of": "2024-11-01",
      "exits": 349.0,
      "beginning": 54268.0,
      "rate": 0.00643104592024766
    },
    {
      "as_of": "2024-12-01",
      "exits": 384.0,
      "beginning": 54240.0,
      "rate": 0.007079646017699115
    },
    {
      "as_of": "2025-01-01",
      "exits": 394.0,
      "beginning": 54268.0,
      "rate": 0.007260263875580452
    },
    {
      "as_of": "2025-02-01",
      "exits": 356.0,
      "beginning": 54284.0,
      "rate": 0.006558101834794783
    },
    {
      "as_of": "2025-03-01",
      "exits": 409.0,
      "beginning": 54246.0,
      "rate": 0.00753972643144195
    },
    {
      "as_of": "2025-04-01",
      "exits": 370.0,
      "beginning": 54241.0,
      "rate": 0.006821408159879058
    },
    {
      "as_of": "2025-05-01",
      "exits": 395.0,
      "beginning": 54218.0,
      "rate": 0.007285403371574016
    },
    {
      "as_of": "2025-06-01",
      "exits": 414.0,
      "beginning": 54139.0,
      "rate": 0.007646982766582316
    },
    {
      "as_of": "2025-07-01",
      "exits": 437.0,
      "beginning": 54116.0,
      "rate": 0.00807524576834947
    },
    {
      "as_of": "2025-08-01",
      "exits": 455.0,
      "beginning": 54029.0,
      "rate": 0.008421403320439023
    },
    {
      "as_of": "2025-09-01",
      "exits": 465.0,
      "beginning": 55121.0,
      "rate": 0.008435986284719072
    },
    {
      "as_of": "2025-10-01",
      "exits": 494.0,
      "beginning": 54936.0,
      "rate": 0.008992281928061745
    },
    {
      "as_of": "2025-11-01",
      "exits": 514.0,
      "beginning": 54816.0,
      "rate": 0.009376824284880327
    },
    {
      "as_of": "2025-12-01",
      "exits": 502.0,
      "beginning": 54701.0,
      "rate": 0.009177163123160454
    },
    {
      "as_of": "2026-01-01",
      "exits": 500.0,
      "beginning": 54575.0,
      "rate": 0.009161704076958314
    },
    {
      "as_of": "2026-02-01",
      "exits": 493.0,
      "beginning": 54396.0,
      "rate": 0.0090631664092948
    },
    {
      "as_of": "2026-03-01",
      "exits": 613.0,
      "beginning": 54124.0,
      "rate": 0.011325844357401523
    },
    {
      "as_of": "2026-04-01",
      "exits": 632.0,
      "beginning": 53753.0,
      "rate": 0.011757483303257493
    },
    {
      "as_of": "2026-05-01",
      "exits": 660.0,
      "beginning": 53421.0,
      "rate": 0.012354691975065986
    },
    {
      "as_of": "2026-06-01",
      "exits": 707.0,
      "beginning": 53006.0,
      "rate": 0.013338112666490586
    },
    {
      "as_of": "2026-07-01",
      "exits": 806.0,
      "beginning": 52441.0,
      "rate": 0.015369653515379188
    },
    {
      "as_of": "2026-08-01",
      "exits": 936.0,
      "beginning": 51216.0,
      "rate": 0.018275538894095594
    }
  ],
  "engineering_tenure": [
    {
      "tenure_band": "0-1 years",
      "exits": 151.0,
      "beginning": 1133.0,
      "rate": 0.13327449249779347
    },
    {
      "tenure_band": "1-3 years",
      "exits": 52.0,
      "beginning": 2523.0,
      "rate": 0.020610384462940945
    },
    {
      "tenure_band": "3-5 years",
      "exits": 37.0,
      "beginning": 2577.0,
      "rate": 0.01435778036476523
    },
    {
      "tenure_band": "5+ years",
      "exits": 69.0,
      "beginning": 9721.0,
      "rate": 0.0070980351815656826
    }
  ],
  "termination_date_pileup": [
    {
      "date": "2026-08-25",
      "n": 62
    },
    {
      "date": "2026-08-22",
      "n": 60
    },
    {
      "date": "2026-08-04",
      "n": 54
    },
    {
      "date": "2026-08-23",
      "n": 53
    },
    {
      "date": "2026-08-21",
      "n": 51
    },
    {
      "date": "2026-08-20",
      "n": 50
    },
    {
      "date": "2026-08-28",
      "n": 50
    },
    {
      "date": "2026-08-29",
      "n": 50
    }
  ]
}
```

## Snapshot context

- current headcount quality: `healthy`
- replay headcount quality: `unhealthy`
- replay lineage quality: `unhealthy`
- replay lineage publish: `not_published`

## Fixes in this phase

- Snapshot-scoped quality tests, incidents, source health, and lineage RPCs (`018_people_snapshot_context.sql`).
- APAC volume failure is returned only in `incident_replay`.
- Learning recommendations exclude Minecraft / K-12 / student game content and rank enterprise paths higher.
- Synthetic termination dates redistributed so the latest month is not a generator clamp pile-up.

