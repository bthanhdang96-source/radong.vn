# Coffee Market Events Methodology

## Scope

- Commodity scope: coffee only (Week 1).
- Structured fields: event type, impact direction, impact area, impact score, confidence score.
- Country focus starts with Vietnam, Brazil, Indonesia, EU, United States, Germany, Italy, Japan, and South Korea.

## Data Quality

- Controlled vocabularies enforce event type and impact labels.
- Reliability and confidence thresholds are applied before candidate selection for the Coffee Brief.
- Duplicate events are flagged for review; duplicates are not hard-deleted automatically.

## Interpretation

- Events are contextual signals, not deterministic forecasts.
- High-impact claims should prefer reliable sources and confidence >= 0.75.
- Low-reliability or unclear-impact events require human review before customer-facing use.
