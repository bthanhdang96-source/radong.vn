# Vietnam Coffee Export by Market Methodology (Step 2)

## 1. Scope

- Reporter: Vietnam (`reporterCode=704`, ISO `VNM`)
- Flow: Export (`flowCode=X`)
- Commodity: Coffee, not roasted, not decaffeinated
- HS6: `090111`
- Analysis bucket: `coffee_raw_core`
- Period:
  - Week 1 baseline: annual (`A`) from 2020 to latest available
  - Optional extension: monthly (`M`) latest 24 months

## 2. Primary Source

- UN Comtrade public preview API endpoint pattern:
  - `https://comtradeapi.un.org/public/v1/preview/C/{A|M}/HS?...`
- Implemented query parameters:
  - `reporterCode=704`
  - `flowCode=X`
  - `cmdCode=090111`
  - `period=<comma-separated list>`
  - `includeDesc=true` (to return text descriptions and unit labels)
- Primary source metadata stored in raw/fact rows:
  - `source_name = UN Comtrade`
  - `source_url = full query URL`
  - `fetched_at = UTC timestamp`

## 3. Partner Verification References (non-blocking)

These are stored as `official_partner_portal_reference` records in `coffee_export_market_verifications` for top partner markets in latest period:

- US Census International Trade Data:
  - `https://www.census.gov/foreign-trade/data/`
- Japan Customs Trade Statistics:
  - `https://www.customs.go.jp/toukei/info/index_e.htm`
- Eurostat Comext API guide (for EU partner imports):
  - `https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started/comext-database`

Verification status is set to `not_automated` in Week 1 to keep ingestion reproducible and avoid coupling to partner-specific query logic too early.

## 4. Cross-check Sources (Vietnam Side)

- Vietnam Customs statistical publications (high-level directional check):
  - Example customs statistical PDF index domain:
  - `https://files.customs.gov.vn/CustomsCMS/TONG_CUC/...`
- General Statistics Office (GSO) public data portal:
  - `https://pxweb.gso.gov.vn/`

These sources are used for sanity checks at aggregate level, not as the primary HS-by-partner fact source in this step.

## 5. Grain Definition

Target fact grain:

- `period_type + period_label + reporter_iso + partner_iso + flow + hs6 + source_name`

One row = one period, one partner market, Vietnam reporter, export flow, HS6 `090111`.

## 6. Raw Layer and Filtering Rules

Raw rows are fetched from Comtrade and filtered before persistence for consistent market grain:

- Keep only:
  - `customsCode = C00` (total customs procedure)
  - `partner2Code = 0` (total 2nd partner)
  - `motCode = 0` (all modes of transport aggregate)
- Reason:
  - Comtrade returns transport breakdown rows (e.g., sea/air/others) that cause duplicate market-period records if not filtered.

## 7. Quantity Normalization

Priority order:

1. If `netWgt` exists:
   - `quantity_ton = netWgt / 1000`
2. Else if `qty` exists and unit is kg:
   - `quantity_ton = qty / 1000`
3. Else if `qty` exists and unit is ton-like (`t`, `ton`, `tonne`, `mt`, ...):
   - `quantity_ton = qty`
4. Else:
   - `quantity_ton = NULL`
   - quality flag = `missing_or_unknown_quantity_unit`

No unit guessing is allowed.

## 8. Value Mapping

- `value_usd = primaryValue` (fallback `fobvalue` if missing)
- Missing value rows are flagged as `missing_value`.

## 9. Quality Flags

Applied per fact row:

- `aggregate_partner_excluded_or_flagged` for partner World aggregate
- `missing_value`
- `missing_quantity`
- `missing_or_unknown_quantity_unit`
- `zero_quantity`
- `tiny_quantity_unit_price_unstable` (quantity too small for stable QC unit value)
- `suspicious_unit_price` (QC-only anomaly threshold)
- `ok`

QC thresholds (Step 2):

- Suspicious unit price if `< 500` or `> 15,000` USD/ton

## 10. Inclusion / Exclusion Rules

Included in this step:

- HS6 `090111` only (`coffee_raw_core`)

Explicitly excluded from Week 1 coffee-by-market fact:

- Instant coffee (`210111`)
- Roasted coffee (`090121`, `090122`)
- Decaf raw coffee (`090112`)
- Coffee byproducts (`090190`)
- Other commodity groups (rice, pepper, cashew)

## 11. Limitations

- Comtrade reporting may lag latest months/years.
- Monthly completeness can differ by partner and update cycle.
- Export unit value (Step 3) is an average ratio, not transaction price.
- FOB/CIF interpretation and mirror gaps require separate step-level treatment.
- Partner portal verification is reference-level in Week 1 (`not_automated`), not mirror reconciliation yet.

## 12. Step 3 Dependency

Step 3 must compute unit value with weighted formula:

```sql
SUM(value_usd) / SUM(quantity_ton)
```

Do not use `AVG(row_level_unit_price)`.

