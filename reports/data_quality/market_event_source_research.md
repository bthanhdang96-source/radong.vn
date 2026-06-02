# Coffee Market Event Source Research

- Generated at: 2026-06-02T14:14:22.415Z
- Adapter rows fetched: 0
- Source strategy: public RSS/API endpoints only; no generic HTML scraping.

## Configured Sources

- eurostat_agriculture_rss | Eurostat Agriculture RSS | type=rss | enabledByDefault=true | reliability=0.9
  Source: https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/en/statistics-update.rss
  Note: Official EU statistics RSS. Coffee-specific rows are rare; deterministic coffee keyword filtering is required.
- usda_fas_gain_search_api | USDA FAS GAIN public search | type=api_research | enabledByDefault=false | reliability=0.93
  Source: https://gain.fas.usda.gov/#/search
  Note: GAIN search is the preferred USDA/FAS coffee source, but the observed API requires auth at implementation time; keep disabled until a stable public endpoint or key is provided.
- ico_public_updates | International Coffee Organization updates | type=api_research | enabledByDefault=false | reliability=0.88
  Source: https://ico.org/
  Note: ICO is authoritative for coffee context, but no stable public RSS/API feed was confirmed for event ingestion in this follow-up.
- vietnam_official_portals | Vietnam official coffee policy portals | type=api_research | enabledByDefault=false | reliability=0.92
  Source: https://www.mard.gov.vn/
  Note: Vietnam official portals remain research-only until a stable RSS/API endpoint is confirmed; avoid brittle HTML scraping.

## Source Errors

- none

## Guardrails

- Source-derived rows remain reviewable raw-feed items.
- Missing or auth-gated official APIs are documented instead of bypassed with brittle scraping.
- Coffee keyword filtering is deterministic and may miss indirectly relevant policy items.
