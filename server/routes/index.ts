import { Router } from 'express';
import worldPricesRouter from './worldPrices.js';
import vnPricesRouter from './vnPrices.js';

const router = Router();

router.use(worldPricesRouter);
router.use(vnPricesRouter);

export default router;
