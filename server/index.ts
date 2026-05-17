import './env.js';
import cors from 'cors';
import cron from 'node-cron';
import express from 'express';
import { requireAdminApiKey } from './middleware/adminAuth.js';
import apiRouter from './routes/index.js';
import { getAppScheduleConfig } from './services/appRuntimeConfig.js';
import { getCrawlerScheduleConfig, registerCrawlerSchedules } from './services/crawlerScheduler.js';
import { readShopeeSessionMetadata } from './services/crawlers/shopeeSession.js';
import { generateCommodityPricePages } from './services/generatedCommodityPricePages/service.js';
import { generatePricePages } from './services/generatedPricePages/service.js';
import { refreshLiveNewsArticlesCache } from './services/news/liveCache.js';
import { getNewsSchedulerConfig, registerNewsScheduler } from './services/news/scheduler.js';
import { getNewsHealth } from './services/news/service.js';
import { getVnPrices, getWorldPricesResponse } from './services/supabaseMarketDataService.js';

const app = express();
const PORT = process.env.PORT || 3001;
const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];
const CORS_ALLOWED_ORIGINS = parseCsv(process.env.CORS_ALLOWED_ORIGINS, DEFAULT_CORS_ORIGINS);
let worldPriceRefreshRunning = false;
let priceContentRefreshRunning = false;
const appScheduleConfig = getAppScheduleConfig();
const {
  timezone: TZ,
  vnPricesCron: VN_PRICE_CRON,
  priceContentEnabled: PRICE_CONTENT_ENABLED,
  priceContentCron: PRICE_CONTENT_CRON,
  priceContentStaleHours: PRICE_CONTENT_STALE_HOURS,
  worldPriceCrawlEnabled: WORLD_PRICE_CRAWL_ENABLED,
  worldPriceCrawlCron: WORLD_PRICE_CRAWL_CRON,
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

function sanitizeShopeeSession(metadata: Awaited<ReturnType<typeof readShopeeSessionMetadata>>) {
  return {
    status: metadata.status,
    refreshedAt: metadata.refreshedAt,
    expiresAt: metadata.expiresAt,
    checkedAt: metadata.checkedAt,
    headless: metadata.headless,
    keyword: metadata.keyword,
    sampleCount: metadata.sampleCount,
    responseStatus: metadata.responseStatus,
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
  const [shopeeSession, news] = await Promise.all([
    readShopeeSessionMetadata(),
    getNewsHealth(),
  ]);

  res.json({
    ...toHealthResponse(),
    crawlers: {
      schedule: getCrawlerScheduleConfig(),
      newsSchedule: getNewsSchedulerConfig(),
      appSchedule: appScheduleConfig,
      shopeeSession: sanitizeShopeeSession(shopeeSession),
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
      await getWorldPricesResponse(true);
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
