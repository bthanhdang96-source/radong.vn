# Coffee Market Event QC Report

- Generated at: 2026-06-01T17:42:41.020Z
- Total events: 16
- Event date range: 2026-05-23 -> 2026-06-01

## Count By Event Type

- crop_outlook: 1
- currency_fx: 1
- demand_signal: 1
- export_policy: 1
- harvest: 1
- import_policy: 1
- inventory: 1
- logistics: 2
- regulation: 2
- trade_flow: 1
- weather: 4

## Count By Country Or Region

- Brazil: 4
- EU: 2
- Germany: 1
- Indonesia: 1
- Italy: 1
- Japan: 1
- South Korea: 1
- United States: 1
- Vietnam: 4

## Count By Impact Direction

- bearish: 4
- bullish: 7
- neutral: 4
- unclear: 1

## Count By Data Quality Flag

- ok: 11
- missing_event_date: 0
- missing_source_url: 1
- missing_event_title: 0
- low_reliability_source: 0
- possible_duplicate: 0
- unclear_impact: 1
- not_coffee_specific: 0
- stale_event: 0
- needs_human_review: 3
- invalid_event_type: 0
- invalid_impact_direction: 0
- invalid_impact_score: 0

## Events With Low Reliability

- none

## Events With Unclear Impact

- 2026-05-23 | Vietnam | Mixed signals on coffee shipment pacing

## Possible Duplicate Events

- none

## Events Usable For Coffee Brief

- 2026-06-01 | weather | Rain in Central Highlands slows coffee drying | impact=2 | conf=0.82
- 2026-05-31 | crop_outlook | Brazil arabica belt dryness risk noted | impact=2 | conf=0.8
- 2026-05-30 | import_policy | EU due diligence timeline update for coffee importers | impact=0 | conf=0.71
- 2026-05-30 | harvest | Indonesia harvest progress improves export readiness | impact=-1 | conf=0.74
- 2026-05-29 | logistics | Port congestion eases for coffee containers | impact=-1 | conf=0.68
- 2026-05-29 | demand_signal | US specialty roasters report stable buying | impact=1 | conf=0.69
- 2026-05-28 | inventory | Roaster inventories reported above seasonal average | impact=-1 | conf=0.66
- 2026-05-27 | currency_fx | Yen weakness raises local coffee import cost | impact=1 | conf=0.7
- 2026-05-26 | export_policy | Vietnam logistics fee adjustment for export coffee | impact=0 | conf=0.67
- 2026-05-25 | weather | Cold front risk flagged in southern coffee areas | impact=3 | conf=0.86
- 2026-05-24 | regulation | Food safety documentation update for green coffee imports | impact=0 | conf=0.64

## Events Needing Human Review

- 2026-05-31 | Brazil dryness raises concern for coffee trees | flag=needs_human_review | raw intake row
- 2026-05-30 | Coffee traders monitor Brazil weather stress | flag=needs_human_review | possible duplicate of Reuters context
- 2026-05-28 | Vietnam coffee truck flow normalizes after rain | flag=needs_human_review | medium reliability source

## Methodology Warnings

- Market events are contextual signals, not deterministic forecasts.
- Impact direction and score are analytical labels and should be reviewed for high-impact claims.
- Event summaries are short paraphrases and must keep source attribution via source_name and source_url.
