# Domestic Coffee Price + USD/VND Methodology

## Scope

- Commodity: Vietnam domestic Robusta coffee benchmark
- Provinces: Dak Lak, Lam Dong, Gia Lai, Dak Nong
- Domestic unit: VND/kg
- FX pair: USD/VND
- Default FX source and type: Vietcombank transfer_buy

## Formula

`price_vnd_per_ton = price_vnd_per_kg * 1000`

`domestic_price_usd_per_ton = price_vnd_per_kg * 1000 / usd_vnd_rate`

## FX Matching

- Use exact-date Vietcombank transfer_buy when available.
- If exact-date FX is missing, use the nearest previous Vietcombank transfer_buy within 3 calendar days.
- Do not use future FX rates.

## Interpretation

Domestic coffee price converted to USD/ton is not FOB price, CIF price, actual export transaction price, margin, or profit. Export unit value from trade data is also not an actual transaction price. The gap between domestic USD/ton and export unit value is only a directional benchmark and should be interpreted with caution.
