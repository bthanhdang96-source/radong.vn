# Coffee Mirror Import Methodology

## Scope

- Commodity: coffee raw core (HS 090111).
- Origin/exporter: Vietnam (VNM, code 704).
- Default importers: core tier DEU, USA, ITA, JPN, KOR, BEL, ESP, NLD, FRA, GBR.
- Expanded annual importers can include RUS, DZA, PHL, CHN, MYS, THA, AUS, TUR, UKR, CHE, or verified dynamic top export markets.
- Frequency: annual benchmark by default; monthly runs are review-only and limited to pilot importers unless explicitly overridden.

## Data Source

- Primary source: UN Comtrade public preview endpoint.
- Query pattern: reporter=importer, partner=Vietnam, flow=Import (M), cmdCode=090111.
- Partner official portals are tracked as reference/probe status only unless stable API/RSS/CSV endpoints are approved.
- Full raw payload is preserved for traceability.

## Transform Rules

- Quantity normalization priority: net weight (kg) -> qty in kg -> qty in ton/tonne/mt.
- Import unit value formula: SUM(import_value_usd) / SUM(import_quantity_ton).
- Unit value is not computed when quantity is missing, unknown, zero, or invalid.

## Mirror Gap Rules

- Mirror gap compares partner import unit value vs Vietnam export unit value for same period and market.
- Mirror gap percentage: 100 * (partner_import_uv / vietnam_export_uv - 1).
- Low-volume threshold: < 10 tons.
- Large gap thresholds: absolute unit-value gap > 50%, absolute quantity gap > 50%.

## Interpretation

- Import values are often closer to CIF while export values are often closer to FOB.
- Differences can come from freight, insurance, timing, revisions, reporting conventions, HS classification, and transshipment.
- Mirror gap should be interpreted as a benchmark signal only, not margin/profit or confirmed transaction-price premium.
