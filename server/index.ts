import './env.js';
import cors from 'cors';
import cron from 'node-cron';
import express from 'express';
import { requireAdminApiKey } from './middleware/adminAuth.js';
import apiRouter from './routes/index.js';
import { generateAiArticles } from './services/aiArticles/service.js';
import { getAppScheduleConfig } from './services/appRuntimeConfig.js';
import { getCrawlerScheduleConfig, registerCrawlerSchedules } from './services/crawlerScheduler.js';
import { generateCommodityPricePages } from './services/generatedCommodityPricePages/service.js';
import { generatePricePages } from './services/generatedPricePages/service.js';
import { refreshLiveNewsArticlesCache } from './services/news/liveCache.js';
import { getNewsSchedulerConfig, registerNewsScheduler } from './services/news/scheduler.js';
import { getNewsHealth } from './services/news/service.js';
import { syncExchangeRatesToSupabase } from './services/exchangeRatesService.js';
import { getVnPrices, getWorldPricesResponse } from './services/supabaseMarketDataService.js';
import { syncWorldCoffeeBenchmark } from './services/worldCoffeeBenchmark.js';

const app = express();
const PORT = process.env.PORT || 3001;
const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];
const CORS_ALLOWED_ORIGINS = parseCsv(process.env.CORS_ALLOWED_ORIGINS, DEFAULT_CORS_ORIGINS);
let worldPriceRefreshRunning = false;
let worldCoffeeBenchmarkRefreshRunning = false;
let exchangeRateRefreshRunning = false;
let priceContentRefreshRunning = false;
let aiArticleExportRunning = false;
let aiArticleWorldRunning = false;
const appScheduleConfig = getAppScheduleConfig();
const {
  timezone: TZ,
  vnPricesCron: VN_PRICE_CRON,
  priceContentEnabled: PRICE_CONTENT_ENABLED,
  priceContentCron: PRICE_CONTENT_CRON,
  priceContentStaleHours: PRICE_CONTENT_STALE_HOURS,
  worldPriceCrawlEnabled: WORLD_PRICE_CRAWL_ENABLED,
  worldPriceCrawlCron: WORLD_PRICE_CRAWL_CRON,
  worldCoffeeBenchmarkSyncEnabled: WORLD_COFFEE_BENCHMARK_SYNC_ENABLED,
  worldCoffeeBenchmarkSyncCron: WORLD_COFFEE_BENCHMARK_SYNC_CRON,
  exchangeRateSyncEnabled: EXCHANGE_RATE_SYNC_ENABLED,
  exchangeRateSyncCron: EXCHANGE_RATE_SYNC_CRON,
  exchangeRateBackfillDays: EXCHANGE_RATE_BACKFILL_DAYS,
  aiArticleEnabled: AI_ARTICLE_ENABLED,
  aiArticleExportCron: AI_ARTICLE_EXPORT_CRON,
  aiArticleWorldDailyCron: AI_ARTICLE_WORLD_DAILY_CRON,
} =
  appScheduleConfig;

function parseCsv(value: string | undefined, defaultValue: string[]) {
  if (!value) {
    return defaultValue;
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : defaultValue;
}

function registerAppCron(jobName: string, cronExpression: string, handler: () => Promise<void>) {
  if (!cron.validate(cronExpression)) {
    console.error(`[App Scheduler] Invalid cron for ${jobName}: ${cronExpression}`);
    return;
  }

  cron.schedule(cronExpression, () => {
    void handler();
  });
  console.log(`[App Scheduler] Scheduled ${jobName} with cron "${cronExpression}" (TZ=${TZ})`);
}

function toHealthResponse() {
  return {
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'nongsanvn-api',
    uptimeSeconds: Math.round(process.uptime()),
  };
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CORS_ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use('/api', apiRouter);

app.get('/api/health', (_req, res) => {
  res.json(toHealthResponse());
});

app.get('/api/health/details', requireAdminApiKey, async (_req, res) => {
  const news = await getNewsHealth();

  res.json({
    ...toHealthResponse(),
    crawlers: {
      schedule: getCrawlerScheduleConfig(),
      newsSchedule: getNewsSchedulerConfig(),
      appSchedule: appScheduleConfig,
    },
    news,
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`NongSanVN API Server listening on http://localhost:${PORT}`);
  registerCrawlerSchedules();
  registerNewsScheduler();
  void refreshLiveNewsArticlesCache().catch((error) => {
    console.error('[News] Live cache warmup failed:', error);
  });
});

registerAppCron('vn-prices-refresh', VN_PRICE_CRON, async () => {
  try {
    console.log(`[VN Prices] Scheduled refresh started (${VN_PRICE_CRON})`);
    await getVnPrices(true);
    console.log('[VN Prices] Scheduled refresh completed');
  } catch (error) {
    console.error('[VN Prices] Scheduled refresh failed:', error);
  }
});

if (PRICE_CONTENT_ENABLED) {
  registerAppCron('price-content-refresh', PRICE_CONTENT_CRON, async () => {
    if (priceContentRefreshRunning) {
      console.log('[Price Pages] Scheduled generation skipped: previous run still in progress');
      return;
    }

    priceContentRefreshRunning = true;
    try {
      console.log(`[Price Pages] Scheduled generation started (${PRICE_CONTENT_CRON})`);
      const locationResult = await generatePricePages({ staleHours: PRICE_CONTENT_STALE_HOURS });
      if (locationResult.status === 'failed') {
        console.error('[Price Pages] Skipping commodity page generation because location pages failed');
        return;
      }

      await generateCommodityPricePages({ staleHours: PRICE_CONTENT_STALE_HOURS });
      console.log('[Price Pages] Scheduled generation completed');
    } catch (error) {
      console.error('[Price Pages] Scheduled generation failed:', error);
    } finally {
      priceContentRefreshRunning = false;
    }
  });
} else {
  console.log('[App Scheduler] Generated price page schedule is disabled');
}

if (WORLD_PRICE_CRAWL_ENABLED) {
  registerAppCron('world-prices-refresh', WORLD_PRICE_CRAWL_CRON, async () => {
    if (worldPriceRefreshRunning) {
      console.log('[World Prices] Scheduled refresh skipped: previous run still in progress');
      return;
    }

    worldPriceRefreshRunning = true;
    try {
      console.log(`[World Prices] Scheduled refresh started (${WORLD_PRICE_CRAWL_CRON})`);
      await getWorldPricesResponse(true, { trigger: 'scheduler' });
      console.log('[World Prices] Scheduled refresh completed');
    } catch (error) {
      console.error('[World Prices] Scheduled refresh failed:', error);
    } finally {
      worldPriceRefreshRunning = false;
    }
  });
} else {
  console.log('[App Scheduler] World price refresh schedule is disabled');
}

if (WORLD_COFFEE_BENCHMARK_SYNC_ENABLED) {
  registerAppCron('world-coffee-benchmark-refresh', WORLD_COFFEE_BENCHMARK_SYNC_CRON, async () => {
    if (worldCoffeeBenchmarkRefreshRunning) {
      console.log('[World Coffee Benchmark] Scheduled refresh skipped: previous run still in progress');
      return;
    }

    worldCoffeeBenchmarkRefreshRunning = true;
    try {
      console.log(`[World Coffee Benchmark] Scheduled refresh started (${WORLD_COFFEE_BENCHMARK_SYNC_CRON})`);
      const sync = await syncWorldCoffeeBenchmark({ writeArtifacts: true });
      console.log(
        `[World Coffee Benchmark] Scheduled refresh completed raw=${sync.rawRows.length} facts=${sync.rows.length} persisted=${sync.rowsPersisted} sourceErrors=${sync.qc.sourceErrors.length}`,
      );
    } catch (error) {
      console.error('[World Coffee Benchmark] Scheduled refresh failed:', error);
    } finally {
      worldCoffeeBenchmarkRefreshRunning = false;
    }
  });
} else {
  console.log('[App Scheduler] World coffee benchmark refresh schedule is disabled');
}

if (EXCHANGE_RATE_SYNC_ENABLED) {
  registerAppCron('exchange-rate-refresh', EXCHANGE_RATE_SYNC_CRON, async () => {
    if (exchangeRateRefreshRunning) {
      console.log('[Exchange Rates] Scheduled refresh skipped: previous run still in progress');
      return;
    }

    exchangeRateRefreshRunning = true;
    try {
      console.log(`[Exchange Rates] Scheduled refresh started (${EXCHANGE_RATE_SYNC_CRON})`);
      const sync = await syncExchangeRatesToSupabase({
        backfillDays: Math.max(1, Math.min(365, EXCHANGE_RATE_BACKFILL_DAYS)),
      });
      console.log(
        `[Exchange Rates] Scheduled refresh completed success=${sync.success} rows=${sync.rowCount} errors=${sync.errors.length}`,
      );
    } catch (error) {
      console.error('[Exchange Rates] Scheduled refresh failed:', error);
    } finally {
      exchangeRateRefreshRunning = false;
    }
  });
} else {
  console.log('[App Scheduler] Exchange rate refresh schedule is disabled');
}

if (AI_ARTICLE_ENABLED) {
  registerAppCron('ai-export-articles-generate', AI_ARTICLE_EXPORT_CRON, async () => {
    if (aiArticleExportRunning) {
      console.log('[AI Articles] Export article generation skipped: previous run still in progress');
      return;
    }

    aiArticleExportRunning = true;
    try {
      console.log(`[AI Articles] Export article generation started (${AI_ARTICLE_EXPORT_CRON})`);
      await generateAiArticles({ articleType: 'export_period_report' });
      await generateAiArticles({ articleType: 'export_monthly_report' });
      console.log('[AI Articles] Export article generation completed');
    } catch (error) {
      console.error('[AI Articles] Export article generation failed:', error);
    } finally {
      aiArticleExportRunning = false;
    }
  });

  registerAppCron('ai-world-daily-articles-generate', AI_ARTICLE_WORLD_DAILY_CRON, async () => {
    if (aiArticleWorldRunning) {
      console.log('[AI Articles] World daily article generation skipped: previous run still in progress');
      return;
    }

    aiArticleWorldRunning = true;
    try {
      console.log(`[AI Articles] World daily article generation started (${AI_ARTICLE_WORLD_DAILY_CRON})`);
      await generateAiArticles({ articleType: 'world_daily_price_update' });
      console.log('[AI Articles] World daily article generation completed');
    } catch (error) {
      console.error('[AI Articles] World daily article generation failed:', error);
    } finally {
      aiArticleWorldRunning = false;
    }
  });
} else {
  console.log('[App Scheduler] AI article generation schedule is disabled');
}
