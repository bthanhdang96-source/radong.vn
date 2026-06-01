# QC Report - Coffee Mirror Import Unit Value

- Generated at: 2026-06-01T14:36:45.739Z
- Source: UN Comtrade preview endpoint
- Commodity scope: HS 090111 (coffee raw core)
- Importer markets: Germany (DEU), United States (USA), Italy (ITA), Japan (JPN), South Korea (KOR), Belgium (BEL), Spain (ESP), Netherlands (NLD), France (FRA), United Kingdom (GBR)

## Coverage

- Raw rows fetched: 234
- Raw rows prepared: 10
- Fact rows prepared: 10
- Duplicate raw grain rows collapsed: 224
- Duplicate fact grain rows collapsed: 0
- Aggregate reporter rows: 0
- Aggregate partner rows: 0

## Quality Counters

- Missing value rows: 0
- Missing quantity rows: 0
- Unknown quantity unit rows: 0
- Zero/invalid quantity rows: 0
- Invalid value rows: 0
- Low-volume rows: 0

## Mirror Gap Counters

- OK rows: 5
- Missing export unit value: 0
- Missing import unit value: 60
- Missing quantity: 0
- Low volume: 0
- Large mirror gap: 0
- Large quantity gap: 5

## Importer Coverage

- BEL: 1 rows
- DEU: 1 rows
- ESP: 1 rows
- FRA: 1 rows
- GBR: 1 rows
- ITA: 1 rows
- JPN: 1 rows
- KOR: 1 rows
- NLD: 1 rows
- USA: 1 rows

## Unit Distribution

- net_wgt_kg: 234

## Top 20 Highest Import Unit Values (USD/ton)

- 2023 | Netherlands (NLD) | 2702.155992 | flag=ok
- 2023 | Belgium (BEL) | 2635.125928 | flag=ok
- 2023 | France (FRA) | 2588.826755 | flag=ok
- 2023 | Spain (ESP) | 2539.221913 | flag=ok
- 2023 | United Kingdom (GBR) | 2505.541634 | flag=ok
- 2023 | USA (USA) | 2491.695714 | flag=ok
- 2023 | Italy (ITA) | 2484.735801 | flag=ok
- 2023 | Japan (JPN) | 2423.586594 | flag=ok
- 2023 | Rep. of Korea (KOR) | 2383.808247 | flag=ok
- 2023 | Germany (DEU) | 2298.831034 | flag=ok

## Top 20 Lowest Import Unit Values (USD/ton)

- 2023 | Germany (DEU) | 2298.831034 | flag=ok
- 2023 | Rep. of Korea (KOR) | 2383.808247 | flag=ok
- 2023 | Japan (JPN) | 2423.586594 | flag=ok
- 2023 | Italy (ITA) | 2484.735801 | flag=ok
- 2023 | USA (USA) | 2491.695714 | flag=ok
- 2023 | United Kingdom (GBR) | 2505.541634 | flag=ok
- 2023 | Spain (ESP) | 2539.221913 | flag=ok
- 2023 | France (FRA) | 2588.826755 | flag=ok
- 2023 | Belgium (BEL) | 2635.125928 | flag=ok
- 2023 | Netherlands (NLD) | 2702.155992 | flag=ok

## Mirror Gap Outliers (Top |gap| %)

- 2023 | Japan (JPN) | gap=-20.621664 | flag=ok
- 2023 | Rep. of Korea (KOR) | gap=-20.288663 | flag=ok
- 2023 | Germany (DEU) | gap=-18.690846 | flag=large_quantity_gap
- 2023 | USA (USA) | gap=-14.635831 | flag=large_quantity_gap
- 2023 | United Kingdom (GBR) | gap=-12.298924 | flag=large_quantity_gap
- 2023 | Spain (ESP) | gap=-11.73949 | flag=large_quantity_gap
- 2023 | France (FRA) | gap=-9.538818 | flag=large_quantity_gap
- 2023 | Italy (ITA) | gap=-9.526191 | flag=ok
- 2023 | Belgium (BEL) | gap=-6.250813 | flag=ok
- 2023 | Netherlands (NLD) | gap=-3.680443 | flag=ok

## Interpretation Guardrails

- Mirror gap is a benchmark signal, not transaction price, confirmed premium, margin, or profit.
- Positive gaps can reflect CIF/FOB basis, freight, insurance, timing, revisions, and classification differences.
- Low-volume and large-gap rows should be reviewed before deriving business conclusions.
