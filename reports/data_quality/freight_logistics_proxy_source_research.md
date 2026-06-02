# Freight Logistics Proxy Source Research

- Generated at: 2026-06-02T16:51:15.722Z
- Public adapter rows fetched: 0
- Source strategy: fetch public pages where feasible; fall back to semi-manual CSV when public numeric values are unavailable.

## Sources

- drewry_wci_public | Drewry World Container Index | type=drewry_public_page | mode=enabled | enabled=true | reliability=0.82
  Source: https://www.drewry.co.uk/wci
  Note: Public WCI page may expose composite and route snippets in USD per 40ft container; do not bypass paid access.
- scfi_public | Shanghai Shipping Exchange SCFI | type=scfi_public_page | mode=enabled | enabled=true | reliability=0.78
  Source: https://en.sse.net.cn/indices/scfi.jsp
  Note: SCFI is index-points context and must not be converted to USD/FEU.
- loadstar_public | The Loadstar public logistics updates | type=logistics_event_page | mode=enabled | enabled=true | reliability=0.66
  Source: https://theloadstar.com/
  Note: Public logistics headlines are stored as event context requiring human review.
- freightos_fbx_research | Freightos Baltic Index methodology | type=source_research | mode=probe_only | enabled=false | reliability=0.84
  Source: https://www.freightos.com/data/
  Note: FBX route data is valuable but numeric ingestion requires a clearly public value/API permission.
- xeneta_research | Xeneta public methodology | type=source_research | mode=probe_only | enabled=false | reliability=0.75
  Source: https://help.xeneta.com/docs/rate-structure-and-methodology
  Note: Xeneta public methodology is useful for source research; do not ingest paid platform values.
- drewry_licensed | Drewry licensed freight data | type=licensed_provider | mode=licensed | enabled=false | reliability=0.92
  Source: licensed-provider://drewry
  Note: Licensed Drewry adapter placeholder; numeric ingestion requires approved credentials and license terms.
- freightos_fbx_licensed | Freightos FBX licensed freight data | type=licensed_provider | mode=licensed | enabled=false | reliability=0.9
  Source: licensed-provider://freightos-fbx
  Note: Licensed Freightos FBX adapter placeholder; numeric ingestion requires approved credentials and license terms.
- xeneta_licensed | Xeneta licensed freight data | type=licensed_provider | mode=licensed | enabled=false | reliability=0.88
  Source: licensed-provider://xeneta
  Note: Licensed Xeneta adapter placeholder; numeric ingestion requires approved credentials and license terms.
- custom_csv_licensed | Approved licensed freight CSV | type=licensed_provider | mode=licensed | enabled=false | reliability=0.8
  Source: licensed-provider://custom-csv
  Note: Approved licensed CSV placeholder; file path must be explicitly configured and license reviewed before ingestion.

## Source Health

- drewry_wci_public | status=paywalled | mode=enabled | http=200 | extracted=0
  Error: Public page appears to require subscription/login for full numeric data.
- scfi_public | status=paywalled | mode=enabled | http=200 | extracted=0
  Error: Public page appears to require subscription/login for full numeric data.
- loadstar_public | status=available | mode=enabled | http=200 | extracted=20
- freightos_fbx_research | status=research_only | mode=probe_only | http=n/a | extracted=0
  Error: Research-only source; numeric ingestion requires public value/API permission or a licensed provider adapter.
- xeneta_research | status=research_only | mode=probe_only | http=n/a | extracted=0
  Error: Research-only source; numeric ingestion requires public value/API permission or a licensed provider adapter.
- drewry_licensed | status=auth_gated | mode=licensed | http=n/a | extracted=0
  Error: Missing DREWRY_FREIGHT_API_KEY; no licensed numeric ingestion attempted.
- freightos_fbx_licensed | status=auth_gated | mode=licensed | http=n/a | extracted=0
  Error: Missing FREIGHTOS_FBX_API_KEY; no licensed numeric ingestion attempted.
- xeneta_licensed | status=auth_gated | mode=licensed | http=n/a | extracted=0
  Error: Missing XENETA_API_KEY; no licensed numeric ingestion attempted.
- custom_csv_licensed | status=auth_gated | mode=licensed | http=n/a | extracted=0
  Error: Missing FREIGHT_LICENSED_CSV_PATH; no licensed numeric ingestion attempted.

## Adapter Errors

- none

## Licensing Notes

- Do not scrape paid/restricted Drewry, FBX, or Xeneta datasets.
- Public snippets are stored as proxy observations only when date/unit/source are visible.
- Semi-manual rows must include source URL and notes for auditability.
- Licensed provider rows require approved credentials and license terms before ingestion.
