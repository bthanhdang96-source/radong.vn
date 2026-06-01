# Coffee Mirror Import Methodology

## Scope

- Commodity: coffee raw core (HS 090111).
- Origin/exporter: Vietnam (VNM, code 704).
- Importers (P0+P1): DEU, USA, ITA, JPN, KOR, BEL, ESP, NLD, FRA, GBR.
- Frequency in v1: annual only (A), from 2020 to latest completed year.

## Data Source

- Primary source: UN Comtrade public preview endpoint.
- Query pattern: reporter=importer, partner=Vietnam, flow=Import (M), cmdCode=090111.
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
