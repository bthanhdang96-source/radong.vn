import { Router } from 'express'
import { getWorldPricesResponse } from '../services/supabaseMarketDataService.js'
import type { WorldCategory } from '../services/worldBankService.js'

const router = Router()

router.get('/world-prices', async (_req, res) => {
  try {
    const { category, q, refresh } = _req.query
    const forceRefresh = refresh === '1' || refresh === 'true'
    const payload = await getWorldPricesResponse(forceRefresh)
    let data = payload.data

    if (category && category !== 'Táº¥t cáº£') {
      data = data.filter(item => item.category === (category as WorldCategory))
    }

    if (q && typeof q === 'string' && q.trim()) {
      const query = q.toLowerCase().trim()
      data = data.filter(
        item =>
          item.name.toLowerCase().includes(query) ||
          item.nameEn.toLowerCase().includes(query) ||
          item.symbol.toLowerCase().includes(query),
      )
    }

    res.json({
      ...payload,
      count: data.length,
      data,
    })
  } catch (err) {
    console.error('[API] Error fetching world prices:', err)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch world commodity prices',
    })
  }
})

router.get('/exchange-rate', (_req, res) => {
  res.json({
    success: true,
    rate: 25_850,
    pair: 'USD/VND',
    source: 'Reference rate',
    lastUpdate: new Date().toISOString(),
  })
})

export default router
