import { Router } from 'express';
import aiArticlesRouter from './aiArticles.js';
import assminReportRouter from './assminReport.js';
import agriWeatherRouter from './agriWeather.js';
import commodityPricePagesRouter from './commodityPricePages.js';
import contentRouter from './content.js';
import exportRegistryRouter from './exportRegistry.js';
import newsRouter from './news.js';
import pricePagesRouter from './pricePages.js';
import worldPricesRouter from './worldPrices.js';
import vnPriceChainRouter from './vnPriceChain.js';
import vnPricesRouter from './vnPrices.js';

const router = Router();

router.use(aiArticlesRouter);
router.use(assminReportRouter);
router.use(newsRouter);
router.use(contentRouter);
router.use(exportRegistryRouter);
router.use(commodityPricePagesRouter);
router.use(pricePagesRouter);
router.use(worldPricesRouter);
router.use(vnPricesRouter);
router.use(vnPriceChainRouter);
router.use(agriWeatherRouter);

export default router;
