# Freight Logistics Proxy Source Health

- Generated at: 2026-06-02T16:51:15.722Z
- Sources probed: 9

## Probe Results

- drewry_wci_public | Drewry World Container Index | status=paywalled | mode=enabled | enabled=true
  URL: https://www.drewry.co.uk/wci
  HTTP: 200 | content_type=text/html;charset=UTF-8 | items=0 | extracted=0
  Note: Public page appears to require subscription/login for full numeric data.
- scfi_public | Shanghai Shipping Exchange SCFI | status=paywalled | mode=enabled | enabled=true
  URL: https://en.sse.net.cn/indices/scfi.jsp
  HTTP: 200 | content_type=text/html;charset=utf-8 | items=0 | extracted=0
  Note: Public page appears to require subscription/login for full numeric data.
- loadstar_public | The Loadstar public logistics updates | status=available | mode=enabled | enabled=true
  URL: https://theloadstar.com/
  HTTP: 200 | content_type=text/html; charset=UTF-8 | items=25 | extracted=20
  Note: Public logistics headlines are stored as event context requiring human review.
- freightos_fbx_research | Freightos Baltic Index methodology | status=research_only | mode=probe_only | enabled=false
  URL: https://www.freightos.com/data/
  HTTP: n/a | content_type=n/a | items=0 | extracted=0
  Note: Research-only source; numeric ingestion requires public value/API permission or a licensed provider adapter.
- xeneta_research | Xeneta public methodology | status=research_only | mode=probe_only | enabled=false
  URL: https://help.xeneta.com/docs/rate-structure-and-methodology
  HTTP: n/a | content_type=n/a | items=0 | extracted=0
  Note: Research-only source; numeric ingestion requires public value/API permission or a licensed provider adapter.
- drewry_licensed | Drewry licensed freight data | status=auth_gated | mode=licensed | enabled=false
  URL: licensed-provider://drewry
  HTTP: n/a | content_type=n/a | items=0 | extracted=0
  Note: Missing DREWRY_FREIGHT_API_KEY; no licensed numeric ingestion attempted.
- freightos_fbx_licensed | Freightos FBX licensed freight data | status=auth_gated | mode=licensed | enabled=false
  URL: licensed-provider://freightos-fbx
  HTTP: n/a | content_type=n/a | items=0 | extracted=0
  Note: Missing FREIGHTOS_FBX_API_KEY; no licensed numeric ingestion attempted.
- xeneta_licensed | Xeneta licensed freight data | status=auth_gated | mode=licensed | enabled=false
  URL: licensed-provider://xeneta
  HTTP: n/a | content_type=n/a | items=0 | extracted=0
  Note: Missing XENETA_API_KEY; no licensed numeric ingestion attempted.
- custom_csv_licensed | Approved licensed freight CSV | status=auth_gated | mode=licensed | enabled=false
  URL: licensed-provider://custom-csv
  HTTP: n/a | content_type=n/a | items=0 | extracted=0
  Note: Missing FREIGHT_LICENSED_CSV_PATH; no licensed numeric ingestion attempted.

## Interpretation

- available means the public endpoint is reachable and parser extracted proxy rows or event matches.
- parser_drift means the page is reachable but current parser found no usable public snippet.
- auth_gated, paywalled, research_only, and licensed sources are not ingested without approved access and source terms.
