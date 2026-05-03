import cors from 'cors';
import cron from 'node-cron';
import express from 'express';
import apiRouter from './routes/index.js';
import { getCrawlerScheduleConfig, registerCrawlerSchedules } from './services/crawlerScheduler.js';
import { readShopeeSessionMetadata } from './services/crawlers/shopeeSession.js';
import { getSupabaseRuntimeStatus } from './services/supabaseClient.js';
import { getVnPrices } from './services/supabaseMarketDataService.js';

const app = express();
const PORT = process.env.PORT || 3001;
const VN_PRICE_CRON = process.env.VN_PRICE_CRON ?? '0 8,14 * * *';

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  }),
);
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use('/api', apiRouter);

app.get('/api/health', async (_req, res) => {
  const shopeeSession = await readShopeeSessionMetadata()
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    supabase: getSupabaseRuntimeStatus(),
    crawlers: {
      schedule: getCrawlerScheduleConfig(),
      shopeeSession,
    },
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`NongSanVN API Server listening on http://localhost:${PORT}`);
  registerCrawlerSchedules();
});

cron.schedule(VN_PRICE_CRON, async () => {
  try {
    console.log(`[VN Prices] Scheduled refresh started (${VN_PRICE_CRON})`);
    await getVnPrices(true);
    console.log('[VN Prices] Scheduled refresh completed');
  } catch (error) {
    console.error('[VN Prices] Scheduled refresh failed:', error);
  }
});
