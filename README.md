# nongsanvn

## GitHub sync

This repository is configured to publish committed changes to `https://github.com/bthanhdang96-source/radong.vn`.

- The git hook at `.beads/hooks/post-commit` pushes automatically after every successful commit.
- Run `npm run sync:github -- \"feat: your message\"` to stage all changes, create a commit, and push manually.
- Set `AUTO_PUSH_ON_COMMIT=0` if you need to skip the auto-push hook for a specific shell session.
- Make sure `git config user.name` and `git config user.email` are set before the first commit.

## Supabase

This repo now uses Supabase CLI migrations under [supabase](./supabase).

- `npm run supabase:start` starts the local Supabase stack.
- `npm run supabase:reset` reapplies migrations and seed locally.
- `npm run supabase:push` pushes committed migrations to the linked project.

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL` for the queue/worker path
- `INGESTION_INLINE_PROCESSING=true|false` to choose inline queue draining vs external worker
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` for ingestion alerts
- `CUSTOMS_REPORT_URL` to pin a known customs report file
- `CUSTOMS_REPORT_DISCOVERY_MODE=pattern|manual` for customs report discovery
- `CUSTOMS_PDF_PARSER=auto|pdftotext|js` to choose PDF text extraction backend. `pdftotext` is the preferred production path for current customs report layouts.
- `CUSTOMS_ENABLED_SLUGS` comma-separated allowlist for production-safe customs coverage
- `PDFTOTEXT_PATH` if `pdftotext` is not on the default path
- `SHOPEE_COOKIE` optional browser cookie string for Shopee live search requests
- `SHOPEE_ENABLED_SLUGS`, `SHOPEE_MAX_PAGES`, `SHOPEE_MIN_SOLD`, `SHOPEE_MIN_RATING` for Shopee retail crawler tuning
- `SHOPEE_STORAGE_STATE_PATH` to store the Playwright browser session state used by live Shopee crawls. With `npm --prefix server run ...`, the default should stay under `server/.runtime/`, so use `.runtime/shopee-storage-state.json`.
- `SHOPEE_REFRESH_HEADLESS=true|false` to control whether the Shopee session refresh runs headless
- `SHOPEE_REFRESH_MANUAL_WAIT_MS` to keep a headed browser open long enough for a manual anti-bot challenge solve before retrying the health-check
- `SHOPEE_SESSION_MIN_TTL_MINUTES` for the minimum lifetime of a refreshed Shopee browser session
- `SHOPEE_PROXY_SERVER`, `SHOPEE_PROXY_USERNAME`, `SHOPEE_PROXY_PASSWORD` if Shopee live crawl needs a dedicated proxy
- `SHOPEE_SCHEDULER_ENABLED=true|false` as a coarse switch for both Shopee recurring jobs
- `SHOPEE_SESSION_REFRESH_ENABLED=true|false` and `SHOPEE_CRAWL_ENABLED=true|false` to control the two Shopee jobs independently
- `SHOPEE_REFRESH_CRON`, `SHOPEE_CRAWL_CRON`, `SHOPEE_SCHEDULE_DRY_RUN`, `SHOPEE_BLOCK_COOLDOWN_MINUTES` to tune Shopee scheduler behavior
- `CUSTOMS_SCHEDULER_ENABLED=true|false`, `CUSTOMS_CRAWL_CRON`, `CUSTOMS_SCHEDULE_DRY_RUN` to enable and tune the weekly customs scheduler

Runtime behavior:

- If `SUPABASE_SERVICE_ROLE_KEY` is present, the server ingests VN/world data into Supabase and reads curated views.
- If only public keys are present, the app falls back to legacy file-cache services until the remote schema is applied and the service role key is added.
- If `REDIS_URL` is present, VN crawler refreshes enqueue raw price messages to `price:raw`; run `npm --prefix server run worker` for a dedicated worker, or keep `INGESTION_INLINE_PROCESSING=true` to drain the queue inside the API process.
- Run `npm --prefix server run monitor` to execute the ingestion health check and optional Telegram alerting.
- Customs crawler is intentionally separate from the legacy VN homepage refresh. Run it manually or by cron with `npm --prefix server run crawler:customs`.
- Shopee crawler is also separate from the legacy homepage refresh. Refresh the browser session with `npm --prefix server run crawler:shopee:refresh-session`, then run the live crawl with `npm --prefix server run crawler:shopee`.
- The API server now registers the dedicated Shopee/customs schedules on startup, but the new jobs are disabled by default until the `*_SCHEDULER_ENABLED` env flags are turned on.

Quick local verification for the ingestion pipeline:

- Start Redis and ensure `.env` includes `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `REDIS_URL`.
- Queue a sample message with `npm --prefix server run ingestion:sample` or choose a scenario such as `npm --prefix server run ingestion:sample -- --scenario=duplicate`.
- Process the queue once with `npm --prefix server run worker:once`, or keep `npm --prefix server run worker` running continuously.
- Verify database results with `npm --prefix server run ingestion:verify -- --scenario=valid --tag=<tag-from-sample-output>`.
- Check health with `npm --prefix server run monitor`.
- Optional scenarios: `valid`, `duplicate`, `stale`, `spike`.

Quick local verification for the customs aggregate crawler:

- Run a dry-run against a known report URL: `npm --prefix server run crawler:customs -- --url=<customs-pdf-url> --dry-run`
- To force manual mode from env, set `CUSTOMS_REPORT_DISCOVERY_MODE=manual` and `CUSTOMS_REPORT_URL=<customs-pdf-url>`.
- To verify idempotency, run the same customs command twice and confirm the second run inserts `0` new rows or leaves the customs count unchanged.
- Metadata such as discovery mode, parser backend, report code, and enabled slug allowlist are stored in `raw_crawl_logs.raw_json.snapshot.metadata`.

Quick local verification for the Shopee crawler:

- Use the bundled fixture for parser and filter verification:
  `npm --prefix server run crawler:shopee -- --fixture=server/fixtures/shopee-search-sample.json --dry-run`
- Install the browser once with `npm exec --prefix server playwright install chromium`.
- Refresh a browser-backed Shopee session:
  `npm --prefix server run crawler:shopee:refresh-session -- --force`
- If Shopee shows a traffic verification page, rerun in headed mode and leave the browser open for manual challenge handling:
  `npm --prefix server run crawler:shopee:refresh-session -- --force --headed --wait-ms=120000`
- Then run the live crawler:
  `npm --prefix server run crawler:shopee -- --force-refresh --dry-run`
- The live path now uses Playwright storage state in `server/.runtime/` instead of relying on a static cookie string.
- If the browser session health-check still returns `403`, switch to a better egress path or provide a proxy through `SHOPEE_PROXY_SERVER`.
- When `SHOPEE_SCHEDULER_ENABLED=true`, the scheduler will refresh the session on `SHOPEE_REFRESH_CRON`, run the live crawl on `SHOPEE_CRAWL_CRON`, and back off during the configured block cooldown instead of retrying every minute.
- Use `npm --prefix server run crawler:status` for a compact runtime snapshot and `npm --prefix server run crawler:preflight` before enabling production schedules.
- The production rollout and recovery process is documented in [docs/crawler-ops-runbook.md](./docs/crawler-ops-runbook.md).

Quick local verification for the dedicated crawler scheduler:

- Start the API server and confirm `/api/health` reports `crawlers.schedule` and `crawlers.shopeeSession`.
- For a safe smoke test, set `SHOPEE_SCHEDULER_ENABLED=true`, `SHOPEE_SCHEDULE_DRY_RUN=true`, and `CUSTOMS_SCHEDULER_ENABLED=true`, `CUSTOMS_SCHEDULE_DRY_RUN=true`.
- The scheduler keeps a simple in-memory lock so the same job does not overlap with itself if a previous run is still active.

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
