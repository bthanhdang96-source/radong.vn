# Freight Logistics Proxy QC Report

- Generated at: 2026-06-02T14:57:15.083Z
- Total rows: 5
- Date range: 2026-05-23 -> 2026-05-30

## Data Quality Flags

- ok: 4
- missing_source_url: 0
- missing_observation_date: 0
- missing_unit: 0
- unknown_unit: 0
- index_points_not_usd: 1
- possible_duplicate: 0
- low_relevance_to_coffee: 0
- suspicious_value: 0
- needs_human_review: 0

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

## Latest Freight Observations

- 2026-05-30 | Drewry World Container Index Composite | Composite | unit=USD/FEU | normalized=2300 | flag=ok
- 2026-05-30 | Drewry World Container Index Route | Shanghai to Rotterdam | unit=USD/FEU | normalized=3200 | flag=ok
- 2026-05-30 | Shanghai Containerized Freight Index | SCFI Composite | unit=index_points | normalized=n/a | flag=index_points_not_usd
- 2026-05-29 | Public Logistics Event | Red Sea / Asia-Europe | unit=text_event | normalized=n/a | flag=ok
- 2026-05-23 | Drewry World Container Index Route | Shanghai to Rotterdam | unit=USD/TEU | normalized=6000 | flag=ok

## Source Errors

- none

## Interpretation Guardrails

- Freight proxy is not a Vietnam coffee freight quote.
- Route-level signals can help monitor landed-cost pressure, but they do not prove causality for mirror gaps or export unit values.
- Index points are not converted to USD unless source methodology explicitly allows it.
