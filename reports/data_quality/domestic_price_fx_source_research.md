# Source Research - Domestic Coffee Price + USD/VND

## Domestic Coffee Price Sources

- Vietnambiz: public Vietnamese commodity news pages; current crawler returns Dak Lak, Lam Dong, Gia Lai, and Dak Nong rows in VND/kg. Reliability is medium because it is a news source, not an official statistical API.
- Nong nghiep & Moi truong: public agriculture news source; current crawler returns Central Highlands coffee rows in VND/kg. Reliability is medium-high for agricultural market reporting, but format can change.
- Cong Thuong: public trade/industry news source; existing crawler can parse province-level coffee prices from coffee price articles. Reliability is medium-high, but parser depends on article wording.
- Giacafe.vn: coffee-specific public page with province rows, VND/kg unit, and Vietcombank FX note. It is documented as a candidate and cross-check source, but not added as a new crawler in this MVP.
- Agroinfo-style weekly PDFs: government/quasi-government market bulletin PDFs can provide weekly province averages and source references. They are useful for audit/cross-check, not daily MVP ingestion.

## FX Sources

- Vietcombank XML endpoint provides current rates with Buy, Transfer, and Sell fields. This MVP stores cash_buy, transfer_buy, and sell, and uses transfer_buy for conversion.
- The Vietcombank XML response includes a reference-only note and should not be polled aggressively. The sync checks same-day rows before fetching.
- Existing generic exchange_rate_observations are not used for Step 4 MVP because they do not represent Vietcombank rate_type.

## Default Rule

- Convert VND/kg to USD/ton with Vietcombank USD/VND transfer_buy.
- If exact date FX is missing, use previous available Vietcombank transfer_buy within 3 calendar days.
- Never use future FX rates.
