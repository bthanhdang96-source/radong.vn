# Anti-Scrape Controls For Price And News

Date: 2026-06-13
Status: Approved design

## Goal

Reduce bulk scraping risk across public price, news, content, sitemap, and SEO page surfaces while keeping normal users and search crawlers working.

## Non-Goals

This change does not make public data impossible to copy. Public SEO pages and published JSON responses remain reachable by design. This change also does not add Cloudflare, Turnstile, CAPTCHA, database schema changes, or Supabase RLS changes.

## Context

The app exposes useful public data through JSON list/detail APIs, generated price pages, sitemap builders, and Vercel serverless helpers. Several list endpoints support large limits or broad map modes, and there is no central public anti-scrape limiter. Admin routes already have API-key protection and should keep that behavior.

## Recommended Approach

Implement app-only controls in the Express backend:

- Central anti-scrape middleware for public price, news, content, sitemap-adjacent, and registry routes.
- Fixed-window quotas keyed by client IP, user agent hash, and route bucket.
- Redis-backed counters when `REDIS_URL` is configured, with in-memory fallback for local/dev.
- Default automation user-agent blocks with env-based extensions.
- Minimal link-index endpoints for frontend link lookup, so the UI no longer needs full generated page summaries in bulk.
- Internal sitemap bypass using `ANTI_SCRAPE_INTERNAL_KEY`.
- Robots policy that disallows API/admin paths and common AI/training bots while allowing mainstream search crawlers.

## Alternatives Considered

Stricter bot challenge was rejected for this pass because it would risk SEO and normal users. CDN/WAF controls were rejected because the approved direction is app-only. Lowering every public endpoint cap without replacement was rejected because existing price tables need lightweight link lookup.

## Design

The middleware classifies routes into buckets:

- `html-detail`: 60 requests per minute and 600 per hour.
- `json-detail`: 40 requests per minute and 400 per hour.
- `json-list`: 20 requests per minute and 200 per hour.
- `bulk`: 6 requests per minute and 60 per hour.

The middleware returns `429` with `Retry-After` and `X-RateLimit-*` headers when a bucket is exceeded. It returns JSON for API clients and a small HTML response for HTML clients. Known automation user agents return `403`.

Public full-list generated price endpoints are capped lower unless an internal sitemap header is valid. Link-index endpoints expose only the fields required to build frontend links.

## Data Flow

Browser traffic and public API calls pass through the anti-scrape middleware before route handlers. Sitemaps call the backend with an internal key header so they can fetch large page indexes without consuming public quota. Vercel news article fallback proxies to the backend instead of querying Supabase directly, so the same backend protections apply.

## Error Handling

The limiter should fail open if Redis is unavailable after logging a warning, preserving availability. Bad user-agent regex configuration is ignored with a warning. Rate-limited responses include retry metadata. Block logs use hashed IP identifiers rather than raw IP addresses.

## Security And Privacy

The limiter does not expose admin bypasses publicly. Internal bypass requires `ANTI_SCRAPE_INTERNAL_KEY` and should be used only by trusted server-side code. Logs include route bucket, action, user agent, referer, and IP hash, avoiding broad raw IP logging.

## Testing And Verification

Add focused tests for limiter allow/block/rate-limit behavior, link-index payload shape, full-list public caps, internal sitemap bypass, and export-registry map mode behavior. Run lint, frontend build, server typecheck, server tests, and manual route checks for robots, sitemap, SEO page, and content feed.

## Rollout / Migration Notes

Production should set `ANTI_SCRAPE_ENABLED=true`, `ANTI_SCRAPE_INTERNAL_KEY` to a strong shared secret for backend and Vercel sitemap functions, and `REDIS_URL` when shared counters across processes are required.
