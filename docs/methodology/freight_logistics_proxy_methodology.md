# Freight Logistics Proxy Methodology

## Scope

- Commodity scope: coffee export intelligence.
- Freight rows are route/global proxies, not transaction-level quotes.
- Priority routes are Asia-Europe, Asia-US, and Asia-Northeast Asia where public data exists.

## Unit Normalization

- USD/FEU is kept unchanged.
- USD/TEU is multiplied by 2 as an approximate FEU conversion.
- index_points, days, text_event, and unknown units are not converted to USD/FEU.

## Interpretation

- Freight/logistics proxy can support Coffee Brief landed-cost and mirror-gap context.
- Do not claim freight caused a mirror gap without stronger evidence.
- Use cautious wording: route-level proxy, not a Vietnam coffee-specific freight quote.
