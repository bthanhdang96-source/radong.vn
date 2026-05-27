# QC Report - Vietnam Coffee Exports by Market

Generated at: 2026-05-26T17:43:55.608Z
Period type: A

## Scope

- Reporter: Vietnam (704 / VNM)
- Flow: Export (X)
- HS6: 090111 (Coffee; not roasted or decaffeinated)
- Filtered dimensions: customs=C00, partner2=0, mot=0

## Row Counts

- Total rows: 272
- Duplicate grain rows: 0
- World aggregate rows: 4
- Missing value rows: 0
- Missing quantity rows: 0
- Unknown quantity unit rows: 0
- Zero quantity rows: 0
- Tiny quantity rows (< 0.1 ton): 0
- Suspicious QC unit price rows (< 500 or > 15000 USD/ton): 2

## Quantity Units

- kg: 272

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
- World aggregate rows are flagged and excluded from market ranking.
