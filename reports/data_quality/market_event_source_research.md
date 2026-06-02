# Coffee Market Event Source Research

- Generated at: 2026-06-02T16:24:05.434Z
- Adapter rows fetched: 0
- Source strategy: public RSS/API endpoints only; no generic HTML scraping.

## Configured Sources

- eurostat_agriculture_rss | Eurostat Agriculture RSS | type=rss | mode=enabled | enabledByDefault=true | requiresManualReview=true | reliability=0.9
  Source: https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/en/statistics-update.rss
  Note: Official EU statistics RSS. Coffee-specific rows are rare, so source health reports coffee hit counts separately.
- usda_fas_gain_search_api | USDA FAS GAIN public search | type=api_research | mode=probe_only | enabledByDefault=false | requiresManualReview=true | reliability=0.93
  Source: https://gain.fas.usda.gov/#/search
  Note: GAIN search is the preferred USDA/FAS coffee source, but the observed API requires auth at implementation time; keep disabled until a stable public endpoint or key is provided.
- ico_public_updates | International Coffee Organization updates | type=official_html_probe | mode=probe_only | enabledByDefault=false | requiresManualReview=true | reliability=0.88
  Source: https://ico.org/press-releases/
  Note: ICO is authoritative for coffee context, but this public page is HTML-only; numeric/event ingestion stays disabled without a stable RSS/API feed.
- vietnam_official_portals | Vietnam official coffee policy portals | type=official_html_probe | mode=probe_only | enabledByDefault=false | requiresManualReview=true | reliability=0.92
  Source: https://www.mard.gov.vn/
  Note: Vietnam official portals remain research-only until a stable RSS/API endpoint is confirmed; avoid brittle HTML scraping.

## Source Health

- eurostat_agriculture_rss | status=available | mode=enabled | http=200 | items=1641 | coffee_hits=0
- usda_fas_gain_search_api | status=auth_gated | mode=probe_only | http=n/a | items=0 | coffee_hits=0
  Error: Research-only/API-gated source; provide approved endpoint or key before ingestion.
- ico_public_updates | status=unsupported_html | mode=probe_only | http=200 | items=0 | coffee_hits=0
  Error: Official source is reachable as HTML, but no stable RSS/XML/JSON ingestion endpoint is configured.
- vietnam_official_portals | status=fetch_error | mode=probe_only | http=n/a | items=0 | coffee_hits=0
  Error: fetch failed

## Source Errors

- none

## Guardrails

- Source-derived rows remain reviewable raw-feed items.
- Source registry states distinguish enabled ingestion from probe_only source research.
- Missing or auth-gated official APIs are documented instead of bypassed with brittle scraping.
- Coffee keyword filtering is deterministic and may miss indirectly relevant policy items.
