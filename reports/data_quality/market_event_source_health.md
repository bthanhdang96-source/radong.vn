# Coffee Market Event Source Health

- Generated at: 2026-06-02T16:24:05.434Z
- Sources probed: 4

## Probe Results

- eurostat_agriculture_rss | Eurostat Agriculture RSS | status=available | mode=enabled | enabled=true | review=true
  URL: https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/en/statistics-update.rss
  HTTP: 200 | content_type=application/xml | items=1641 | coffee_hits=0
  Note: Official EU statistics RSS. Coffee-specific rows are rare, so source health reports coffee hit counts separately. Source health item_count=1641; coffee_hit_count=0.
- usda_fas_gain_search_api | USDA FAS GAIN public search | status=auth_gated | mode=probe_only | enabled=false | review=true
  URL: https://gain.fas.usda.gov/#/search
  HTTP: n/a | content_type=n/a | items=0 | coffee_hits=0
  Note: Research-only/API-gated source; provide approved endpoint or key before ingestion.
- ico_public_updates | International Coffee Organization updates | status=unsupported_html | mode=probe_only | enabled=false | review=true
  URL: https://ico.org/press-releases/
  HTTP: 200 | content_type=text/html; charset=UTF-8 | items=0 | coffee_hits=0
  Note: Official source is reachable as HTML, but no stable RSS/XML/JSON ingestion endpoint is configured.
- vietnam_official_portals | Vietnam official coffee policy portals | status=fetch_error | mode=probe_only | enabled=false | review=true
  URL: https://www.mard.gov.vn/
  HTTP: n/a | content_type=n/a | items=0 | coffee_hits=0
  Note: fetch failed

## Interpretation

- available means the endpoint is reachable and parseable; coffee_hits may still be zero for broad official feeds.
- auth_gated and unsupported_html sources are not ingested until an approved stable endpoint is configured.
- retired sources should stay disabled and be replaced with the official successor endpoint before ingestion.
