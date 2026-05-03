# Crawler Ops Runbook

This runbook covers production rollout and routine operations for the dedicated Shopee and customs crawlers.

## Scope

- `customs`: weekly aggregate export crawler
- `shopee-session-refresh`: Playwright session maintenance job
- `shopee-crawl`: retail crawl that depends on a healthy Shopee browser session

The legacy domestic homepage refresh is intentionally separate and is not part of this runbook.

## Required environment

Minimum shared configuration:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
REDIS_URL=redis://...
INGESTION_INLINE_PROCESSING=true
```

Customs-specific:

```env
CUSTOMS_SCHEDULER_ENABLED=true
CUSTOMS_CRAWL_CRON=0 8 * * 3
CUSTOMS_SCHEDULE_DRY_RUN=false
CUSTOMS_REPORT_DISCOVERY_MODE=pattern
CUSTOMS_PDF_PARSER=auto
CUSTOMS_ENABLED_SLUGS=ca-phe-robusta,cashew,ho-tieu,rice-5pct,cassava,rubber-rss3,tea-avg
PDFTOTEXT_PATH=
```

Shopee-specific:

```env
SHOPEE_SCHEDULER_ENABLED=false
SHOPEE_SESSION_REFRESH_ENABLED=true
SHOPEE_CRAWL_ENABLED=false
SHOPEE_REFRESH_CRON=0 */6 * * *
SHOPEE_CRAWL_CRON=15 6,14 * * *
SHOPEE_BLOCK_COOLDOWN_MINUTES=180
SHOPEE_REFRESH_HEADLESS=true
SHOPEE_REFRESH_MANUAL_WAIT_MS=60000
SHOPEE_STORAGE_STATE_PATH=.runtime/shopee-storage-state.json
SHOPEE_ENABLED_SLUGS=ca-phe-robusta,gao-noi-dia,ho-tieu,ca-tra,shrimp,cashew
SHOPEE_MAX_PAGES=2
SHOPEE_MIN_SOLD=5
SHOPEE_MIN_RATING=4
SHOPEE_PROXY_SERVER=
SHOPEE_PROXY_USERNAME=
SHOPEE_PROXY_PASSWORD=
```

## One-time setup

1. Install server dependencies:

```bash
npm --prefix server install
```

2. Install Playwright Chromium:

```bash
npm exec --prefix server playwright install chromium
```

3. Verify crawler readiness:

```bash
npm --prefix server run crawler:preflight
```

4. Inspect runtime status:

```bash
npm --prefix server run crawler:status
```

## Recommended rollout order

1. Enable customs scheduler first.
2. Keep Shopee disabled until a session strategy is validated.
3. Enable only `SHOPEE_SESSION_REFRESH_ENABLED=true` first.
4. Run a manual headed refresh if Shopee anti-bot is active.
5. After a healthy Shopee session is stored, enable `SHOPEE_CRAWL_ENABLED=true`.

## Manual operations

### Customs

Dry-run a customs report:

```bash
npm --prefix server run crawler:customs -- --dry-run
```

Force a known report URL:

```bash
npm --prefix server run crawler:customs -- --url=<customs-pdf-url> --dry-run
```

### Shopee

Refresh session headless:

```bash
npm --prefix server run crawler:shopee:refresh-session -- --force
```

Refresh session with manual challenge time:

```bash
npm --prefix server run crawler:shopee:refresh-session -- --force --headed --wait-ms=120000
```

Live crawl dry-run:

```bash
npm --prefix server run crawler:shopee -- --force-refresh --dry-run
```

## Normal operating model

- Customs runs automatically on its own weekly schedule.
- Shopee session refresh runs on its own schedule.
- Shopee crawl runs only when the stored session is not in block cooldown.
- If Shopee is marked `blocked`, the scheduler skips the crawl instead of retrying continuously.

## Blocked Shopee procedure

Symptoms:

- `crawler:status` shows `shopeeSession.status = blocked`
- metadata message includes `90309999`
- live crawl exits with `success=false`

Response:

1. Do not disable cooldown unless actively debugging.
2. Try manual headed refresh:

```bash
npm --prefix server run crawler:shopee:refresh-session -- --force --headed --wait-ms=120000
```

3. If the challenge page still appears, switch to a cleaner egress path or set `SHOPEE_PROXY_SERVER`.
4. After refresh is healthy, rerun:

```bash
npm --prefix server run crawler:shopee -- --dry-run
```

5. Only re-enable scheduled Shopee crawl after the dry-run succeeds.

## Safe production toggles

Phase 1:

```env
CUSTOMS_SCHEDULER_ENABLED=true
CUSTOMS_SCHEDULE_DRY_RUN=false
SHOPEE_SESSION_REFRESH_ENABLED=true
SHOPEE_CRAWL_ENABLED=false
```

Phase 2:

```env
SHOPEE_SESSION_REFRESH_ENABLED=true
SHOPEE_CRAWL_ENABLED=true
SHOPEE_SCHEDULE_DRY_RUN=true
```

Phase 3:

```env
SHOPEE_SCHEDULE_DRY_RUN=false
```

## Health checks

The API health endpoint now exposes crawler scheduler and Shopee session metadata:

```text
GET /api/health
```

Key fields:

- `crawlers.schedule`
- `crawlers.shopeeSession.status`
- `crawlers.shopeeSession.checkedAt`
- `crawlers.shopeeSession.message`

## Residual risks

- Shopee anti-bot can still block browser-backed sessions.
- Headed manual refresh may remain necessary in some environments.
- `pdf-parse` fallback for customs is not as reliable as `pdftotext`; production should prefer `pdftotext`.
