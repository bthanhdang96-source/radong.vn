# Project Security Hotspots

Read this file when the task touches Supabase access, background ingestion, auth-adjacent settings, or any data mutation path.

## Primary Files

- `server/services/supabaseClient.ts`
  - Defines read and service-role clients.
  - Highest-risk file for accidental privilege expansion.
- `server/services/supabaseMarketDataService.ts`
  - Mixes read paths, fallback behavior, and admin ingestion access.
- `server/services/ingestion/pipeline.ts`
  - Accepts normalized crawler payloads and writes curated data.
- `server/services/ingestion/monitor.ts`
  - Sends Telegram alerts and handles sensitive operational env vars.
- `server/routes/vnPrices.ts`
- `server/routes/worldPrices.ts`
  - Public route surface for market data.
- `supabase/migrations/20260501150000_agri_data_model.sql`
  - Current source of truth for RLS, policies, views, helper functions, and service-role-only tables.
- `supabase/config.toml`
  - Auth redirect allowlist, token settings, and storage/auth config.
- `README.md`
  - Documents required env vars and runtime fallbacks.
- `AI_CONTEXT.md`
  - Notes that public marketplace UI was removed, but future `crowdsource_submissions` still exists in the data model.

## Current Risk Themes

- Browser code must never gain access to `SUPABASE_SERVICE_ROLE_KEY`.
- The server currently falls back when only public Supabase keys are present. Review fallback logic carefully so it does not widen access unexpectedly.
- RLS already exists for user profiles, alerts, crowdsource submissions, raw crawl logs, ingestion errors, and curated/public read paths. New tables must match that discipline.
- `crowdsource_submissions` is a likely future user-input surface. Treat it as hostile input even if the UI is not yet live.
- Ingestion and monitoring paths use external services and sensitive env vars. Avoid leaking raw payloads, Telegram credentials, or admin-only operational details.

## Review Hints

- Search for `createClient(`, `service_role`, `auth.uid()`, `auth.role()`, `create policy`, `security definer`, `security_invoker`, `dangerouslySetInnerHTML`, `redirect`, `fetch(`, and `process.env`.
- If a change adds a new route, table, or worker task, explicitly document who is allowed to call it and what enforces that rule.
