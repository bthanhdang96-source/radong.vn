# Step 8 Public Source Adapters

Date: 2026-06-02
Status: Approved by follow-up implementation request

## Goal

Add a small, controlled ingestion layer for Step 8 coffee market events that can fetch legally accessible RSS/API feeds, normalize likely coffee-related items into the existing `MarketEventInputRow` pipeline, and keep all current Supabase table/view contracts unchanged.

## Non-Goals

- No generic news scraper.
- No HTML scraping of official portals unless a public RSS/API endpoint is available.
- No automatic customer-facing approval of adapter rows; source-derived rows remain reviewable.
- No schema migration unless required by a verified runtime defect.

## Recommended Approach

Use public feeds first:

- USDA/FAS RSS as the first live adapter because it has an explicit feed format and is high reliability.
- Optional static feed descriptors for ICO, European Commission, and Vietnam official sources, but disabled until a reliable public feed URL is confirmed.
- Normalize adapter output into the same input shape used by seed/raw CSV rows, then run the existing dedupe, QC, artifact, and Supabase upsert flow.

This fits the existing Step 8 design because the fact table remains the stable contract and adapter risk is isolated before transform/QC.

## Alternatives Considered

- Scrape official websites directly: rejected for v1 because robots/TOS and page layout stability vary by source.
- Add a dedicated `market_event_sources` table now: deferred because source configuration can live in TypeScript until adapters prove stable.
- Use LLM classification immediately: deferred because deterministic keyword classification is easier to test and audit.

## Design

- Add feed source descriptors with source name, URL, reliability, country hints, and enabled/default status.
- Add RSS parsing helpers using the existing XML dependency already in `server/package.json`.
- Add deterministic coffee filtering and event classification based on source metadata and keywords.
- Add sync options and CLI flags:
  - `--fetch-sources` to include live public adapters.
  - `--source=<id>` to limit adapter selection.
  - existing CSV seed/raw flow remains default.
- Write fetched feed rows to `data/raw/market_event_items.csv` when artifacts are enabled.
- Extend QC/methodology/source research docs to disclose feed coverage, disabled adapters, and limits.

## Data Flow

RSS/API feed -> adapter raw item -> `MarketEventInputRow` -> existing raw/fact normalization -> existing QC/artifacts -> optional Supabase upsert.

## Error Handling

- Adapter fetch failures are collected as source errors and do not fail the whole sync when CSV rows exist.
- HTTP failures, XML parse failures, and empty feeds are reported in sync output and QC/source research artifacts.
- Adapter rows are marked `fromRawFeed=true`, which keeps them out of brief candidates until reviewed unless a later workflow explicitly promotes them.

## Security And Privacy

- No service role key is used outside server-side sync.
- No frontend exposure of new secrets.
- No new Supabase table or RLS policy is required for this follow-up.
- Existing public views remain `security_invoker`.

## Testing And Verification

- Unit tests for RSS parser, coffee filtering, keyword classification, source error handling, and artifact rendering.
- Run `npm run --prefix server test`, `npm run --prefix server typecheck`, `npm run lint`, `npm run build`, and `npm run pre:handoff`.
- Run a dry sync with fixture/static CSV plus source fetch disabled by default.

## Rollout Notes

The first rollout enables the adapter framework and a USDA/FAS RSS source behind an explicit `--fetch-sources` flag. Additional source URLs should be added only when their public feed/API stability and use terms are clear.
