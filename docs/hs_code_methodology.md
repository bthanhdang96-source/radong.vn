# HS Code Methodology

## Why HS code mapping matters

Export unit value, market comparison, and competitor benchmark are only valid when product groups are comparable. HS mapping is the guardrail that prevents mixing different processing levels.

## HS6 vs national codes

The system uses HS6 as the global comparison baseline.

- HS6 is used for cross-country analytics.
- Vietnam HS8/HS10 (when confirmed from official sources) is stored as national detail and mapped back to HS6.
- Partner-country national lines (for example HTSUS, JP tariff line, CN/TARIC) are stored as optional detail and never replace HS6 as the analytical join key.

## Coffee groups used in V1

- `090111` = green coffee, not decaffeinated (`coffee_raw_core`), the core Vietnam benchmark.
- `090112` = green coffee, decaffeinated (`coffee_decaf_raw`).
- `090121` = roasted coffee, not decaffeinated (`coffee_roasted`).
- `090122` = roasted coffee, decaffeinated (`coffee_roasted_decaf`).
- `090190` = coffee husks, skins, and substitutes containing coffee (`coffee_byproduct`).
- `210111` = coffee extracts, essences, and concentrates (`coffee_instant`).
- `210112` = coffee-based preparations (`coffee_preparation`).

HS6 is the internationally comparable layer. Vietnam AHTN, US HTS, EU TARIC, Japan tariff codes, and other HS8/HS10/tariff-line rows are national-detail references. They can enrich product interpretation, but they must not be treated as a globally consistent Robusta/Arabica or organic split unless the reporter and partner use compatible national lines.

## Aggregation and exclusion rules

The system blocks aggregation across incompatible processing levels.

- Never aggregate `coffee_raw_core` with `coffee_instant`.
- Never aggregate `coffee_raw_core` with roasted or byproduct buckets.
- Never aggregate `coffee_raw_core` with `coffee_preparation`.
- Never compare national tariff-line detail across countries as if it were the same taxonomy.
- Mixed aggregation is allowed only when both rows are in the same analysis bucket.

## Unit value formula

Unit value must be calculated as:

```sql
SUM(value_usd) / SUM(quantity_ton)
```

Do not use pre-averaged row prices (`AVG(unit_price)`), because low-volume rows can bias the result.

## Confidence and verification policy

- P0 rows require high-confidence official evidence.
- If a national sub-code cannot be confirmed from official sources, keep national code as null and lower the confidence score.
- Every mapping row must carry source metadata (name, URL, type, checked timestamp).
