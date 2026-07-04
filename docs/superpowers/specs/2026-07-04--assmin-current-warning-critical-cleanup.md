# ASSMIN Current Warning And Critical Cleanup

Date: 2026-07-04
Status: Approved by user request

## Goal

Clear the current `/assmin` warning and critical report rows shown by the public dashboard without hiding real operational failures.

## Context

The public report shows 31 OK rows, 6 warning rows, and 1 critical row. The admin report identifies the critical row as `congthuong.vn - 2 crawlers`, caused by the Công Thương crawler only searching `news-sitemap.xml` for `gia-ca-phe-hom-nay` and `gia-heo-hoi-hom-nay`. The current site still exposes those articles through topic/tag pages, but the latest price links are not present in the news sitemap.

The warning rows are stale operational snapshots for `kinhtenongthon`, `bhx`, export registry categories, and their scheduler jobs.

## Recommended Approach

Keep the existing Công Thương parser and add a narrow URL discovery fallback: try the news sitemap first, then the commodity-specific topic/tag pages, converting relative article links to absolute URLs. After the crawler is fixed and verified, refresh the stale sources through their existing scripts.

## Alternatives Considered

- Lower the severity for `congthuong` failures. Rejected because the source is actually failing and should stay visible until the crawler can fetch data again.
- Replace the parser with a broad HTML scraper. Rejected because the article body structure still parses with the current paragraph logic.
- Refresh only the stale sources. Rejected because the critical Công Thương snapshot would return on the next VN price refresh.

## Design

- Add fallback discovery URLs to `congthuongCrawler.ts` per commodity.
- Reuse `fetchUtf8`, `extractParagraphs`, and `parseProvinceParagraphs`.
- Normalize relative links such as `/gia-ca-phe-...html` against `https://congthuong.vn`.
- Keep failed source behavior unchanged when no article or no rows are parsed.
- Add focused tests for sitemap-first discovery and topic/tag fallback discovery.

## Testing And Verification

- Run the focused Công Thương crawler tests.
- Run the ASSMIN report service tests.
- Dry-run `crawlCongthuong()` against the live source.
- Refresh stale operational sources with existing scripts where local credentials allow it.
- Re-run the ASSMIN report summary and repository quality gates before handoff.

## Security And Privacy

No secrets, runtime config, or admin-only report details are exposed to public endpoints. No Supabase schema or RLS changes are required.
