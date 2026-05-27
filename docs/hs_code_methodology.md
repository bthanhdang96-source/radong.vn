# HS Code Methodology

## Why HS code mapping matters

Export unit value, market comparison, and competitor benchmark are only valid when product groups are comparable. HS mapping is the guardrail that prevents mixing different processing levels.

## HS6 vs national codes

The system uses HS6 as the global comparison baseline.

- HS6 is used for cross-country analytics.
- Vietnam HS8/HS10 (when confirmed from official sources) is stored as national detail and mapped back to HS6.
- Partner-country national lines (for example HTSUS, JP tariff line, CN/TARIC) are stored as optional detail and never replace HS6 as the analytical join key.

## Coffee core groups used in V1

- `090111` = green coffee core benchmark (`coffee_raw_core`).
- `210111` = coffee extracts / instant (`coffee_instant`) and must remain separate.
- `090112`, `090121`, `090122`, `090190` are retained for segmentation and exclusion rules.

## Aggregation and exclusion rules

The system blocks aggregation across incompatible processing levels.

- Never aggregate `coffee_raw_core` with `coffee_instant`.
- Never aggregate `coffee_raw_core` with roasted or byproduct buckets.
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
