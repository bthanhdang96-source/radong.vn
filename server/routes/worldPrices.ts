import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import { getWorldPricesResponse } from '../services/supabaseMarketDataService.js'
import type { WorldCategory } from '../services/worldBankService.js'

const router = Router()

router.get('/world-prices', async (_req, res) => {
  try {
    const { category, q } = _req.query
    const payload = await getWorldPricesResponse(false)
    let data = payload.data

    if (category && category !== 'Tất cả') {
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

router.post('/admin/world-prices/refresh', requireAdminApiKey, async (_req, res) => {
  try {
    const payload = await getWorldPricesResponse(true)
    res.json(payload)
  } catch (error) {
    console.error('[API] Error refreshing world prices:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to refresh world commodity prices',
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
