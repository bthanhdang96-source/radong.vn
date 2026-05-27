# Research Log - Vietnam Coffee Export by Market (Step 2)

## Source: UN Comtrade public preview API

- URL pattern:
  - `https://comtradeapi.un.org/public/v1/preview/C/A/HS?...`
- Accessed at: 2026-05-27
- Scope tested:
  - `reporterCode=704`
  - `flowCode=X`
  - `cmdCode=090111`
  - `period=2020,2021,2022,2023,...`
  - `includeDesc=true`
- What this source confirms:
  - `reporterCode` must use numeric code (`704` for Vietnam), not ISO `VNM`.
  - `includeDesc=true` is needed to receive textual fields (`reporterDesc`, `partnerDesc`, `cmdDesc`, `qtyUnitAbbr`).
  - Response includes mode-of-transport and other dimensions (`motCode`, `customsCode`, `partner2Code`) causing duplicate partner-period rows unless filtered.
- Limitations:
  - Public preview endpoint is rate-limited (HTTP 429 appears under rapid querying).
  - Latest annual data may lag (`2024+` not present in tested response).
- Confidence: high

## Source: UN Comtrade methodology notes (trade processing upgrade)

- URL:
  - `https://comtradeapi.un.org/files/v1/app/wiki/MethodologyGuideforComtradePlus.pdf`
  - `https://comtradeapi.un.org/files/v1/app/wiki/UNSD_Method_trade_data_processing_v6-17_Jun_2019.pdf`
- Accessed at: 2026-05-27
- What this source confirms:
  - Comtrade disseminates expanded dimensions including mode of transport and second partner.
  - Aggregation on "all modes of transport" should be used for aggregate-level views when transport breakdown exists.
- Limitations:
  - Methodology docs are conceptual; endpoint-specific parameter reference is limited.
- Confidence: medium-high

## Source: US Census international trade data

- URL:
  - `https://www.census.gov/foreign-trade/data/`
  - `https://www.census.gov/data/developers/data-sets/international-trade.html`
- Accessed at: 2026-05-27
- What this source confirms:
  - U.S. import-side HS data is publicly available via official Census channels/API.
  - Suitable as partner-side reference for verification workflow.
- Limitations:
  - Query harmonization with Comtrade grain requires additional mapping decisions.
- Confidence: medium-high

## Source: Eurostat Comext API guide

- URL:
  - `https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started/comext-database`
- Accessed at: 2026-05-27
- What this source confirms:
  - Official EU Comext endpoint exists for detailed external trade data.
  - Can be used as reference for EU partner imports (Germany/Italy/Spain/etc.).
- Limitations:
  - Production-grade partner verification requires separate query templates and metadata handling.
- Confidence: medium-high

## Source: Japan Customs Trade Statistics

- URL:
  - `https://www.customs.go.jp/toukei/info/index_e.htm`
- Accessed at: 2026-05-27
- What this source confirms:
  - Official Japan trade statistics portal is publicly available.
  - Can serve as partner-side import verification source.
- Limitations:
  - Automated extraction was not implemented in Step 2 Week 1.
- Confidence: medium-high

## Source: Vietnam Customs and GSO (cross-check)

- URL:
  - `https://files.customs.gov.vn/CustomsCMS/TONG_CUC/` (official customs statistics document host)
  - `https://pxweb.gso.gov.vn/` (GSO data portal)
- Accessed at: 2026-05-27
- What this source confirms:
  - Vietnam-side aggregate trade publications are publicly available for directional sanity checks.
- Limitations:
  - Not used as primary machine-readable HS-by-partner feed for this step.
- Confidence: medium

