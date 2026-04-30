import { Router } from 'express';
import { getWorldPrices, getCategories } from '../services/worldBankService.js';
import type { WorldCategory } from '../services/worldBankService.js';

const router = Router();

// Reference exchange rate (updated periodically)
const USD_VND_RATE = 25_850;

/**
 * GET /api/world-prices
 * Query params:
 *   - category: filter by category (optional)
 *   - q: search query (optional)
 */
router.get('/world-prices', async (_req, res) => {
  try {
    const { category, q } = _req.query;
    let data = await getWorldPrices();

    // Filter by category
    if (category && category !== 'Tất cả') {
      data = data.filter((item) => item.category === (category as WorldCategory));
    }

    // Search filter
    if (q && typeof q === 'string' && q.trim()) {
      const query = q.toLowerCase().trim();
      data = data.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.nameEn.toLowerCase().includes(query) ||
          item.symbol.toLowerCase().includes(query)
      );
    }

    res.json({
      success: true,
      count: data.length,
      exchangeRate: USD_VND_RATE,
      categories: getCategories(),
      data,
    });
  } catch (err) {
    console.error('[API] Error fetching world prices:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch world commodity prices',
    });
  }
});

/**
 * GET /api/exchange-rate
 */
router.get('/exchange-rate', (_req, res) => {
  res.json({
    success: true,
    rate: USD_VND_RATE,
    pair: 'USD/VND',
    source: 'Reference rate',
    lastUpdate: new Date().toISOString(),
  });
});

export default router;
