# Crawler Ops Runbook

This runbook covers production rollout and routine operations for the supported crawler jobs.

## Scope

- `customs`: weekly aggregate export crawler
- `bhx-crawl`: retail crawl for Bach Hoa Xanh
- `coop-crawl`: retail crawl for Co.op Online
- `export-registry-crawl`: export registry crawler
- `durian-export-crawl`: optional durian export crawler

The legacy domestic homepage refresh is intentionally separate and is not part of this runbook.

## Required Environment

Minimum shared configuration:

```env
ADMIN_API_KEY=...
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
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

BHX-specific:

```env
BHX_CRAWL_ENABLED=true
BHX_CRAWL_CRON=15 6,14 * * *
BHX_ENABLED_REGIONS=HCM
BHX_API_BEARER_TOKEN=...
BHX_API_X_API_KEY=...
```

Co.op-specific:

```env
COOP_CRAWL_ENABLED=true
COOP_CRAWL_CRON=20 6,14 * * *
COOP_ENABLED_REGIONS=HCM,HNI,DNG
COOP_ENABLED_CATEGORIES=/c/rau-cu,/c/trai-cay,/c/thit,/c/thuy-hai-san
COOP_MAX_PAGES_PER_CATEGORY=2
```

Export registry-specific:

```env
EXPORT_REGISTRY_CRAWL_ENABLED=true
EXPORT_REGISTRY_CRAWL_CRON=30 2 * * *
EXPORT_REGISTRY_SCHEDULE_DRY_RUN=false
EXPORT_REGISTRY_MAX_PAGES_PER_TYPE=0
```

Durian export-specific:

```env
DURIAN_EXPORT_ENABLED=false
DURIAN_EXPORT_CRON=0 9 * * 3
DURIAN_EXPORT_SCHEDULE_DRY_RUN=false
```

## One-Time Setup

1. Install server dependencies:

```bash
npm --prefix server install
```

2. Verify crawler readiness:

```bash
npm --prefix server run crawler:preflight
```

3. Inspect runtime status:

```bash
npm --prefix server run crawler:status
```

4. Check protected runtime health details:

```bash
curl -H "Authorization: Bearer $ADMIN_API_KEY" http://localhost:3001/api/health/details
```

## Recommended Rollout Order

1. Enable customs scheduler first.
2. Enable export registry after customs status is stable.
3. Enable domestic retail crawlers with dry-run off only after manual crawls return valid items.
4. Keep optional crawlers disabled until their data is required by a production view.

## Manual Operations

Dry-run a customs report:

```bash
npm --prefix server run crawler:customs -- --dry-run
```

Force a known customs report URL:

```bash
npm --prefix server run crawler:customs -- --url=<customs-pdf-url> --dry-run
```

Run domestic retail crawlers:

```bash
npm --prefix server run crawler:bhx
npm --prefix server run crawler:coop
```

Run export crawlers:

```bash
npm --prefix server run crawler:export-registry
npm --prefix server run crawler:durian-export
```

## Normal Operating Model

- Customs runs automatically on its weekly schedule.
- Domestic retail crawlers run on their configured daily schedules.
- Export registry runs daily by default.
- A crawler with invalid cron is skipped at registration time and logged as an error.
- A crawler does not start a new run while the same job is still in progress.

## Safe Production Toggles

Initial rollout:

```env
CUSTOMS_SCHEDULER_ENABLED=true
CUSTOMS_SCHEDULE_DRY_RUN=false
EXPORT_REGISTRY_CRAWL_ENABLED=true
EXPORT_REGISTRY_SCHEDULE_DRY_RUN=false
BHX_CRAWL_ENABLED=true
COOP_CRAWL_ENABLED=true
BHX_SCHEDULE_DRY_RUN=true
COOP_SCHEDULE_DRY_RUN=true
```

After validating manual and scheduled dry-runs:

```env
BHX_SCHEDULE_DRY_RUN=false
COOP_SCHEDULE_DRY_RUN=false
```

## Health Checks

```text
GET /api/health
GET /api/health/details
```

Key fields:

- `crawlers.schedule`
- `services.news`
- `services.vnPrices`
- `services.exportRegistry`

## Residual Risks

- Retail crawlers may fail when upstream storefront APIs change.
- `pdf-parse` fallback for customs is not as reliable as `pdftotext`; production should prefer `pdftotext`.
- Export registry selectors should be reviewed when source pages change layout.
