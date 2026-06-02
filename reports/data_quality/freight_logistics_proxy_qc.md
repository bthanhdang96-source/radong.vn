# Freight Logistics Proxy QC Report

- Generated at: 2026-06-02T16:51:15.722Z
- Total rows: 5
- Date range: 2026-05-23 -> 2026-05-30
- Public adapter rows fetched: 0

## Data Quality Flags

- ok: 0
- missing_source_url: 0
- missing_observation_date: 0
- missing_unit: 0
- unknown_unit: 0
- index_points_not_usd: 1
- possible_duplicate: 0
- low_relevance_to_coffee: 0
- suspicious_value: 0
- needs_human_review: 4

## Units

- index_points: 1
- text_event: 1
- USD/FEU: 2
- USD/TEU: 1

## Proxy Types

- freight_index: 2
- logistics_event: 1
- route_index: 2

## TEU/FEU Conversion Check

- 2026-05-23 | Drewry World Container Index Route | Shanghai to Rotterdam | 3000 USD/TEU -> 6000 USD/FEU

## Index Points Not Converted

- 2026-05-30 | Shanghai Containerized Freight Index | value=1450

## Duplicate Rows

- none

## Suspicious Values

- none

## Low Relevance To Coffee

- none

## Event-Only Rows With Missing Notes

- none

## Manual Seed Rows

- 2026-05-30 | Drewry World Container Index Composite | approved=false | flag=needs_human_review
- 2026-05-30 | Drewry World Container Index Route | approved=false | flag=needs_human_review
- 2026-05-30 | Shanghai Containerized Freight Index | approved=false | flag=index_points_not_usd
- 2026-05-29 | Public Logistics Event | approved=false | flag=needs_human_review
- 2026-05-23 | Drewry World Container Index Route | approved=false | flag=needs_human_review

## Stale Rows

- none

## Source Health Summary

- drewry_wci_public | status=paywalled | mode=enabled | extracted=0 | http=200
- scfi_public | status=paywalled | mode=enabled | extracted=0 | http=200
- loadstar_public | status=available | mode=enabled | extracted=20 | http=200
- freightos_fbx_research | status=research_only | mode=probe_only | extracted=0 | http=n/a
- xeneta_research | status=research_only | mode=probe_only | extracted=0 | http=n/a
- drewry_licensed | status=auth_gated | mode=licensed | extracted=0 | http=n/a
- freightos_fbx_licensed | status=auth_gated | mode=licensed | extracted=0 | http=n/a
- xeneta_licensed | status=auth_gated | mode=licensed | extracted=0 | http=n/a
- custom_csv_licensed | status=auth_gated | mode=licensed | extracted=0 | http=n/a

## Latest Freight Observations

- 2026-05-30 | Drewry World Container Index Composite | Composite | unit=USD/FEU | normalized=2300 | flag=needs_human_review
- 2026-05-30 | Drewry World Container Index Route | Shanghai to Rotterdam | unit=USD/FEU | normalized=3200 | flag=needs_human_review
- 2026-05-30 | Shanghai Containerized Freight Index | SCFI Composite | unit=index_points | normalized=n/a | flag=index_points_not_usd
- 2026-05-29 | Public Logistics Event | Red Sea / Asia-Europe | unit=text_event | normalized=n/a | flag=needs_human_review
- 2026-05-23 | Drewry World Container Index Route | Shanghai to Rotterdam | unit=USD/TEU | normalized=6000 | flag=needs_human_review

## Source Errors

- none

## Interpretation Guardrails

- Freight proxy is not a Vietnam coffee freight quote.
- Route-level signals can help monitor landed-cost pressure, but they do not prove causality for mirror gaps or export unit values.
- Index points are not converted to USD unless source methodology explicitly allows it.
- Licensed Drewry/FBX/Xeneta values are not ingested without approved credentials and license terms.
