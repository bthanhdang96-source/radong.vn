import './env.js';
import cors from 'cors';
import cron from 'node-cron';
import express from 'express';
import apiRouter from './routes/index.js';
import { getCrawlerScheduleConfig, registerCrawlerSchedules } from './services/crawlerScheduler.js';
import { readShopeeSessionMetadata } from './services/crawlers/shopeeSession.js';
import { refreshLiveNewsArticlesCache } from './services/news/liveCache.js';
import { getNewsSchedulerConfig, registerNewsScheduler } from './services/news/scheduler.js';
import { getNewsHealth } from './services/news/service.js';
import { getSupabaseRuntimeStatus } from './services/supabaseClient.js';
import { getVnPrices, getWorldPricesResponse } from './services/supabaseMarketDataService.js';

const app = express();
const PORT = process.env.PORT || 3001;
const TZ = process.env.TZ ?? 'UTC';
const VN_PRICE_CRON = process.env.VN_PRICE_CRON ?? '0 8,14 * * *';
const WORLD_PRICE_CRAWL_ENABLED = parseBoolean(process.env.WORLD_PRICE_CRAWL_ENABLED, true);
const WORLD_PRICE_CRAWL_CRON = process.env.WORLD_PRICE_CRAWL_CRON ?? '30 7,13 * * *';
const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];
const CORS_ALLOWED_ORIGINS = parseCsv(process.env.CORS_ALLOWED_ORIGINS, DEFAULT_CORS_ORIGINS);
let worldPriceRefreshRunning = false;

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return defaultValue;
}

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
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'nongsanvn-api',
    uptimeSeconds: Math.round(process.uptime()),
    supabase: getSupabaseRuntimeStatus(),
    crawlers: {
      schedule: getCrawlerScheduleConfig(),
      newsSchedule: getNewsSchedulerConfig(),
      appSchedule: {
        vnPricesCron: VN_PRICE_CRON,
        worldPriceCrawlEnabled: WORLD_PRICE_CRAWL_ENABLED,
        worldPriceCrawlCron: WORLD_PRICE_CRAWL_CRON,
        corsAllowedOrigins: CORS_ALLOWED_ORIGINS,
        timezone: TZ,
      },
    },
  });
});

app.get('/api/health/details', async (_req, res) => {
  const [shopeeSession, news] = await Promise.all([
    readShopeeSessionMetadata(),
    getNewsHealth(),
  ]);

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'nongsanvn-api',
    uptimeSeconds: Math.round(process.uptime()),
    supabase: getSupabaseRuntimeStatus(),
    crawlers: {
      schedule: getCrawlerScheduleConfig(),
      newsSchedule: getNewsSchedulerConfig(),
      appSchedule: {
        vnPricesCron: VN_PRICE_CRON,
        worldPriceCrawlEnabled: WORLD_PRICE_CRAWL_ENABLED,
        worldPriceCrawlCron: WORLD_PRICE_CRAWL_CRON,
        corsAllowedOrigins: CORS_ALLOWED_ORIGINS,
        timezone: TZ,
      },
      shopeeSession,
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
