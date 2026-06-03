# QC Report - Vietnam Coffee Exports by Product Market

Generated at: 2026-06-03T15:38:59.579Z
Period type: A
HS scope: all_hs6

## Scope

- Reporter: Vietnam (704 / VNM)
- Flow: Export (X)
- Target HS6: 090111, 090112, 090121, 090122, 090190, 210111, 210112
- Filtered dimensions: customs=C00, partner2=0, mot=0
- Multi-HS rows are product-scope observations; do not aggregate green, roasted, decaf, extract/preparation, and byproduct buckets into one unit-value benchmark.

## Row Counts

- Total rows: 1110
- Duplicate grain rows: 0
- World aggregate rows: 28
- Missing value rows: 0
- Missing quantity rows: 0
- Unknown quantity unit rows: 0
- Zero quantity rows: 0
- Tiny quantity rows (< 0.1 ton): 10
- Suspicious QC unit price rows (< 500 or > 15000 USD/ton): 20
- Unsupported HS code rows: 0

## Quantity Units

- kg: 1110

## HS6 Coverage

- 210111: 252
- 210112: 181
- 090111: 272
- 090112: 102
- 090121: 182
- 090122: 90
- 090190: 31

## Analysis Bucket Coverage

- coffee_byproduct: rows=31 | value_usd=7080074.36 | quantity_ton=23780.761
- coffee_decaf_raw: rows=102 | value_usd=702094453.02 | quantity_ton=213824.158
- coffee_instant: rows=252 | value_usd=3400143027.97 | quantity_ton=609724.026
- coffee_preparation: rows=181 | value_usd=989043333.54 | quantity_ton=217710.207
- coffee_raw_core: rows=272 | value_usd=19495549685.12 | quantity_ton=9519920.267
- coffee_roasted: rows=182 | value_usd=298618590.6 | quantity_ton=50008.156
- coffee_roasted_decaf: rows=90 | value_usd=32701619.88 | quantity_ton=14387.917

## Top Markets (Latest Period)

Latest period: 2023

- Germany (DEU): value_usd=440611665.08 | quantity_ton=155843.388
- Italy (ITA): value_usd=318124614.97 | quantity_ton=115835.034
- USA (USA): value_usd=247811857.32 | quantity_ton=84899.023
- Japan (JPN): value_usd=233694701.73 | quantity_ton=76540.68
- Russian Federation (RUS): value_usd=192279575.61 | quantity_ton=68949.046
- Spain (ESP): value_usd=160427747.48 | quantity_ton=55762.889
- Algeria (DZA): value_usd=160171544.47 | quantity_ton=53461.905
- Belgium (BEL): value_usd=138717432.07 | quantity_ton=49351.139
- Netherlands (NLD): value_usd=107551088.78 | quantity_ton=38337.066
- Philippines (PHL): value_usd=79074884.81 | quantity_ton=23722.355

## Notes

- Unit price is only for QC anomaly detection in this step.
- Step 3 should calculate official export unit value as SUM(value_usd) / SUM(quantity_ton).
- Step 3-7 benchmark views remain scoped to HS6 090111 / coffee_raw_core unless explicitly extended.
- World aggregate rows are flagged and excluded from market ranking.
