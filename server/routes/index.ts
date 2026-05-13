import { Router } from 'express';
import assminReportRouter from './assminReport.js';
import agriWeatherRouter from './agriWeather.js';
import newsRouter from './news.js';
import worldPricesRouter from './worldPrices.js';
import vnPriceChainRouter from './vnPriceChain.js';
import vnPricesRouter from './vnPrices.js';

const router = Router();

router.use(assminReportRouter);
router.use(newsRouter);
router.use(worldPricesRouter);
router.use(vnPricesRouter);
router.use(vnPriceChainRouter);
router.use(agriWeatherRouter);

export default router;
