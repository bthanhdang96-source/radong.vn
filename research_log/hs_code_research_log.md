# HS Code Research Log (Coffee V1)

## Source: UNSD Classification Detail (HS 090111)

- URL: https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090111
- Accessed at: 2026-05-26
- Commodity: Coffee
- Codes verified: `090111`
- What this source confirms:
  - 6-digit subheading text is "Coffee; not roasted or decaffeinated".
  - Correspondence lists HS 2017 code `090111`.
- Limitations:
  - UNSD page is classification metadata, not national tariff lines.
- Confidence: high

## Source: UNSD Classification Detail (HS 090112, 090121, 090122, 090190, 210111)

- URL:
  - https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090112
  - https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090121
  - https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090122
  - https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090190
  - https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/210111
- Accessed at: 2026-05-26
- Commodity: Coffee
- Codes verified: `090112`, `090121`, `090122`, `090190`, `210111`
- What this source confirms:
  - Standard 6-digit descriptions for decaf/roasted/byproduct/instant groups.
  - HS 2017 correspondence remains same for these subheadings.
- Limitations:
  - No Vietnam 8-digit or partner-country national extensions.
- Confidence: high

## Source: Vietnam tariff schedule (Decree 118/2022/ND-CP PDF mirror on customs domain)

- URL: https://files.customs.gov.vn/CustomsCMS/DONG_NAI/2023/1/10/118_2022_ND_CP_30_12_2022.pdf
- Accessed at: 2026-05-26
- Commodity: Coffee
- Codes verified:
  - `0901.11.20` (Arabica)
  - `0901.11.30` (Robusta)
  - `0901.11.90` (other)
- What this source confirms:
  - Vietnam has national-level split under HS6 `090111`.
  - All Vietnam 8-digit rows above map cleanly back to HS6 `090111`.
- Limitations:
  - Source is a long PDF and requires text extraction; machine-readable API is not provided.
- Confidence: high

## Source: EU customs framework (TARIC/CN references)

- URL:
  - https://taxation-customs.ec.europa.eu/customs/calculation-customs-duties/customs-tariff/eu-customs-tariff-taric_en
  - https://taxation-customs.ec.europa.eu/system/files/2022-04/SectionII_ch6_14_HS2022.pdf
- Accessed at: 2026-05-26
- Commodity: Coffee
- Codes verified: `0901 11`, `0901 12`, `0901 21`, `0901 22`, `0901 90`
- What this source confirms:
  - EU uses TARIC/CN framework on top of HS.
  - Chapter 9 references the same coffee HS6 breakdown used by the mapping table.
- Limitations:
  - The TARIC UI is dynamic; direct API-style extraction of 10-digit code details is not stable in this pass.
  - Country rows (Germany/Italy/Spain) are represented via shared EU nomenclature.
- Confidence: medium-high

## Source: Japan Customs tariff schedule

- URL: https://www.customs.go.jp/english/tariff/2025_01_01/data/e_09.htm
- Accessed at: 2026-05-26
- Commodity: Coffee
- Codes verified:
  - `0901.11` with 3-digit statistical split `000` (Not decaffeinated)
  - Related headings: `0901.12`, `0901.21`, `0901.22`, `0901.90`
- What this source confirms:
  - Japan publishes official national tariff structure under chapter 09.
  - Mapping can store Japan national line as `0901.11.000` and map to HS6 `090111`.
- Limitations:
  - Different formatting from other partners; requires normalization when joining.
- Confidence: high

## Source: U.S. International Trade Commission HTS

- URL: https://hts.usitc.gov/search?query=coffee
- Accessed at: 2026-05-26
- Commodity: Coffee
- Codes verified:
  - `0901.11.00` (Not decaffeinated)
  - Additional statistical suffixes for Arabica/Robusta/Other under U.S. reporting.
- What this source confirms:
  - U.S. tariff line structure is consistent with HS6 `090111`.
- Limitations:
  - HTS web app is heavily dynamic; raw HTML extraction is limited in this pass.
  - U.S. statistical suffixes should be treated as optional extra detail.
- Confidence: medium-high

## Source: Russia partner reference status

- URL: https://customs.gov.ru/
- Accessed at: 2026-05-26
- Commodity: Coffee
- Codes verified: none in this pass
- What this source confirms:
  - Official customs domain is identified for follow-up verification.
- Limitations:
  - No confirmed machine-readable tariff line extraction completed in this pass.
  - Russia national line is intentionally flagged as `TODO_SOURCE_REQUIRED` with low confidence.
- Confidence: low
