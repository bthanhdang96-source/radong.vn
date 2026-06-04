# Fix Assmin Critical Report Issues

Date: 2026-06-04
Status: Approved design

## Goal

Reduce false or avoidable critical rows on `/assmin` and make production preflight catch the runtime dependencies that caused the current failures.

## Context

The `/assmin` report currently shows seven critical rows. Investigation found five operational causes:

- `dongnai_sct_daugiay` latest Supabase snapshot failed with HTTP 500, while local dry-run now succeeds.
- `bhx` source and `bhx-crawl` job failed because production Playwright Chromium could not load `libglib-2.0.so.0`.
- `customs` source and `customs-crawl` job failed because production fell back to `pdf-parse`; local `pdftotext` parses the current report successfully.
- `open_meteo` returned HTTP 429 while MET.no still provided a usable weather forecast.
- `weatherapi` is missing `WEATHERAPI_KEY`; README already documents this provider as optional.

## Recommended Approach

Make `/assmin` severity match service availability instead of treating every optional provider failure as critical, add preflight checks for BHX Playwright dependencies and Customs `pdftotext`, then refresh the recoverable source snapshots.

## Alternatives Considered

- Mark all provider failures critical forever. This keeps the count high even when the product has enough data from other providers.
- Disable optional providers completely when keys are missing. This hides useful diagnostics and makes configuration drift harder to see.
- Fix only production configuration. This is necessary for Playwright and `pdftotext`, but code-side preflight should make the failure obvious before scheduled jobs run.

## Design

- Weather report rows:
  - `weatherapi` missing key is a warning because the provider is optional.
  - Open-Meteo `429` is a warning when at least one weather provider succeeds.
  - A provider failure remains critical when no weather provider succeeds.
- Crawler preflight:
  - Check BHX browser bootstrap only when BHX is enabled and API credentials are not configured.
  - Detect Playwright Chromium launch failures and shared-library dependency errors.
  - Check `pdftotext` availability when Customs is enabled and parser mode is `auto` or `pdftotext`.
- Documentation:
  - Document production commands for Playwright deps and `pdftotext`.
  - Clarify that `WEATHERAPI_KEY` is optional and impacts `/assmin` as a warning, not a hard outage.

## Data Flow

No schema changes. `/assmin` continues to read Supabase source snapshots, scheduler rows, and weather payloads. Successful crawler syncs will replace stale failed source snapshots in Supabase through the existing `syncCrawlerResultToSupabase` path.

## Error Handling

Preflight emits explicit check names and exits non-zero for missing required runtime dependencies. `/assmin` still surfaces optional provider failures, but uses warning severity when the weather payload remains usable.

## Security And Privacy

No secrets are added. The fix will not hard-code WeatherAPI or Supabase keys. The legacy `SUPABASE_SERVICE_ROLE_KEY` warning remains a preflight guard; actual local secret edits are out of scope for committed files.

## Testing And Verification

- Add focused tests for `/assmin` weather provider severity classification.
- Run server tests for assmin/weather/preflight-adjacent code.
- Run dry-run crawlers for Dầu Giây, Customs, and BHX.
- Run non-dry-run source syncs only for crawlers that pass locally.
- Re-run `/assmin` service summary and crawler preflight.
- Run repository quality gates and pre-handoff.

## Rollout / Migration Notes

Production still needs system packages for Playwright Chromium and `pdftotext`; code cannot install OS libraries in every host. Operators should set `CUSTOMS_PDF_PARSER=pdftotext` and install the documented dependencies on the scheduler host.
