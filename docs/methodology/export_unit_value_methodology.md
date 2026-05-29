# Export Unit Value Methodology

## Scope

- Reporter: Vietnam (VNM)
- Flow: Export
- Commodity: coffee
- HS6: 090111 (coffee, not roasted, not decaffeinated)
- Period type: annual for the first implementation

## Source

Step 3 uses the Step 2 `fact_vietnam_coffee_export_by_market` dataset, originally sourced from UN Comtrade and filtered to customs=C00, mot=0, and partner2=0.

## Formula

`export_unit_value_usd_per_ton = SUM(value_usd) / SUM(quantity_ton)`

The transform never averages row-level unit values. The unit is USD per metric ton.

## Grain

`period_type + period_label + reporter_iso + partner_iso + flow + hs6 + source_name`

## Exclusions And Flags

- Aggregate partner rows such as World are excluded from by-market output and ranking.
- Markets with quantity_ton < 10 are flagged as low_volume.
- Missing value, missing quantity, zero quantity, and invalid unit values lower confidence.

## Interpretation

Export unit value is an average proxy calculated from trade value divided by quantity. It is not a transaction price, contract price, FOB invoice price, or exact selling price.

## Known Limitations

- Low-volume markets can produce noisy unit values.
- HS 090111 can mix grades and qualities.
- Reporting lag and customs revisions can change historical rows.
- Unit conversion and source reporting issues remain possible.

## Future Improvements

- Compare with domestic prices, futures benchmarks, competitor unit values, and automated mirror-import verification.
