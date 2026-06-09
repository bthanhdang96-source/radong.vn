import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import { sendCachedJson } from '../middleware/publicResponseCache.js'
import {
  generateCommodityPricePages,
  getGeneratedCommodityPricePageDetail,
  listGeneratedCommodityPricePages,
} from '../services/generatedCommodityPricePages/service.js'

const router = Router()

router.get('/commodity-price-pages', async (req, res) => {
  try {
    await sendCachedJson(req, res, {
      label: 'commodity-price-pages',
      ttlSeconds: 600,
    }, async () => {
      const items = await listGeneratedCommodityPricePages({
        commoditySlug: typeof req.query.commoditySlug === 'string' ? req.query.commoditySlug : undefined,
        limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
      })

      return { success: true, items }
    })
  } catch (error) {
    console.error('[API] Failed to list generated commodity price pages:', error)
    res.status(500).json({ success: false, error: 'Failed to list generated commodity price pages' })
  }
})

router.get('/commodity-price-pages/:commoditySlug', async (req, res) => {
  try {
    const payload = await getGeneratedCommodityPricePageDetail(req.params.commoditySlug, {
      allowStale: req.query.allowStale === 'true',
    })

    if (!payload) {
      res.status(404).json({ success: false, error: 'Generated commodity price page not found' })
      return
    }

    res.json({ success: true, page: payload })
  } catch (error) {
    console.error('[API] Failed to load generated commodity price page:', error)
    res.status(500).json({ success: false, error: 'Failed to load generated commodity price page' })
  }
})

router.post('/admin/commodity-price-pages/generate', requireAdminApiKey, async (req, res) => {
  try {
    const payload = await generateCommodityPricePages({
      commoditySlug: typeof req.body?.commoditySlug === 'string' ? req.body.commoditySlug : undefined,
      staleHours: typeof req.body?.staleHours === 'number' ? req.body.staleHours : undefined,
    })

    res.json({ success: payload.status !== 'failed', ...payload })
  } catch (error) {
    console.error('[API] Failed to generate commodity price pages:', error)
    res.status(500).json({ success: false, error: 'Failed to generate commodity price pages' })
  }
})

export default router
