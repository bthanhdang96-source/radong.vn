# ASSMIN Warning Cleanup

Date: 2026-06-08
Status: Approved design

## Goal

Reduce the current seven `/assmin` warning rows by separating false freshness warnings from real stale operational data, then refresh the recoverable stale sources.

## Context

The current report has seven warning rows and zero critical rows:

- `kinhtenongthon` latest news crawl run failed.
- `bhx` source snapshot is stale.
- `customs` source snapshot is stale.
- `export-registry-production_area` is stale.
- `export-registry-packing_facility` is stale.
- `bhx-crawl` job is stale.
- `export-registry-crawl` job is stale.

Preflight passes for Supabase admin config, BHX Playwright, and Customs `pdftotext`. Dry-runs pass for BHX, Export Registry, and `kinhtenongthon`. Customs dry-run timed out locally, and Customs is a weekly source, so the current 36-hour source freshness window can create false warnings between expected weekly runs.

## Recommended Approach

Add a source-specific freshness window for Customs in the ASSMIN source row logic, matching the existing weekly scheduler tolerance. Then run manual refreshes for the sources that passed dry-run checks.

## Alternatives Considered

- Refresh data only. This would leave Customs likely to warn again between normal weekly runs.
- Widen every source to a weekly window. This would hide real stale daily sources such as BHX and Export Registry.
- Disable stale warnings. This would make `/assmin` less useful for operations.

## Design

- Keep the default source freshness windows unchanged for news, retail crawlers, weather, and export registry.
- Add a Customs-specific stale source window of nine days, matching the existing `customs-crawl` scheduler window.
- Keep source status behavior unchanged: critical failures remain critical, validation and stale warnings remain warnings.
- Refresh only sources already verified with dry-run: BHX, Export Registry, and `kinhtenongthon`.

## Data Flow

`/api/assmin/report` continues to aggregate Supabase runtime status, source rows, scheduler rows, dataset rows, and warning rows. No schema or table contract changes are required.

## Testing And Verification

- Add focused tests for Customs weekly source freshness.
- Run the ASSMIN test file.
- Re-run crawler preflight.
- Refresh verified sources and re-check the report warning rows.
- Run repository quality gates before handoff.

## Security And Privacy

No secrets are added or exposed. The change does not alter Supabase RLS, service role usage, or public client behavior.
