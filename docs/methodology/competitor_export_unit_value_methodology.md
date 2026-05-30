# Competitor Export Unit Value Methodology

## Scope

- Reporters: Vietnam (VNM), Brazil (BRA), Indonesia (IDN)
- Flow: Export
- HS6: 090111 (coffee, not roasted or decaffeinated)
- Frequency: annual in v1
- Source: UN Comtrade public preview endpoint; optional primary key use is reserved for completeness issues.

## Formula

`export_unit_value_usd_per_ton = SUM(value_usd) / SUM(quantity_ton)`

The transform never averages row-level unit values. Quantity is converted to metric tons using net weight in kg first, then quantity units when net weight is unavailable.

## Grain

`period_type + period_label + reporter_iso + partner_iso + flow + hs6 + source_name`

## Flags

- `missing_value`: trade value is absent.
- `missing_quantity`: quantity cannot be derived even though a known quantity source exists.
- `missing_or_unknown_quantity_unit`: quantity unit is absent or unsupported and net weight is unavailable.
- `zero_quantity`: quantity equals zero.
- `invalid_unit_value`: calculated unit value is less than or equal to zero.
- `low_volume_for_competitor_benchmark`: quantity is below 50 tons.

## Benchmark Views

- Vietnam is compared to Brazil and Indonesia by destination market and period.
- Reporter share fields are shares within the tracked reporter set only, not global destination-market share.
- Comparison text must remain cautious: directional benchmark only, not transaction price, FOB price, margin, or profit.

## Limitations

- Same HS 090111 can contain different origins, grades, certified products, and Robusta/Arabica mixes.
- Brazil can show structural Arabica premiums that are not direct evidence of Vietnam competitiveness.
- Comtrade data can lag or be revised after initial publication.
- Monthly data is deferred until annual QC is stable.
- Low-volume destinations can generate extreme unit values and must remain flagged.
