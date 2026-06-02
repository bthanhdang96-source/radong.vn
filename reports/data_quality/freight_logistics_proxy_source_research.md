# Freight Logistics Proxy Source Research

- Generated at: 2026-06-02T14:57:15.083Z
- Public adapter rows fetched: 0
- Source strategy: fetch public pages where feasible; fall back to semi-manual CSV when public numeric values are unavailable.

## Sources

- drewry_wci_public | Drewry World Container Index | type=drewry_public_page | enabled=true | reliability=0.82
  Source: https://www.drewry.co.uk/wci
  Note: Public WCI page may expose composite and route snippets in USD per 40ft container; do not bypass paid access.
- scfi_public | Shanghai Shipping Exchange SCFI | type=scfi_public_page | enabled=true | reliability=0.78
  Source: https://en.sse.net.cn/indices/scfi.jsp
  Note: SCFI is index-points context and must not be converted to USD/FEU.
- loadstar_public | The Loadstar public logistics updates | type=logistics_event_page | enabled=true | reliability=0.66
  Source: https://theloadstar.com/
  Note: Public logistics headlines are stored as event context requiring human review.
- freightos_fbx_research | Freightos Baltic Index methodology | type=source_research | enabled=false | reliability=0.84
  Source: https://www.freightos.com/data/
  Note: FBX route data is valuable but numeric ingestion requires a clearly public value/API permission.
- xeneta_research | Xeneta public methodology | type=source_research | enabled=false | reliability=0.75
  Source: https://help.xeneta.com/docs/rate-structure-and-methodology
  Note: Xeneta public methodology is useful for source research; do not ingest paid platform values.

## Adapter Errors

- none

## Licensing Notes

- Do not scrape paid/restricted Drewry, FBX, or Xeneta datasets.
- Public snippets are stored as proxy observations only when date/unit/source are visible.
- Semi-manual rows must include source URL and notes for auditability.
