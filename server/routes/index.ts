import { Router } from 'express';
import worldPricesRouter from './worldPrices.js';
import vnPriceChainRouter from './vnPriceChain.js';
import vnPricesRouter from './vnPrices.js';

const router = Router();

router.use(worldPricesRouter);
router.use(vnPricesRouter);
router.use(vnPriceChainRouter);

export default router;
