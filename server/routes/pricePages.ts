import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import {
  generatePricePages,
  getGeneratedPricePageDetail,
  listGeneratedPricePages,
} from '../services/generatedPricePages/service.js'
import type { PricePageScopeType } from '../services/generatedPricePages/types.js'

const router = Router()

function parseScopeType(value: unknown): PricePageScopeType | undefined {
  return value === 'province' || value === 'region_label' ? value : undefined
}

router.get('/price-pages', async (req, res) => {
  try {
    const items = await listGeneratedPricePages({
      commoditySlug: typeof req.query.commoditySlug === 'string' ? req.query.commoditySlug : undefined,
      provinceCode: typeof req.query.provinceCode === 'string' ? req.query.provinceCode : undefined,
      scopeType: parseScopeType(req.query.scopeType),
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
    })

    res.json({ success: true, items })
  } catch (error) {
    console.error('[API] Failed to list generated price pages:', error)
    res.status(500).json({ success: false, error: 'Failed to list generated price pages' })
  }
})

router.get('/price-pages/:commoditySlug/:locationSlug', async (req, res) => {
  try {
    const payload = await getGeneratedPricePageDetail(req.params.commoditySlug, req.params.locationSlug, {
      allowStale: req.query.allowStale === 'true',
    })

    if (!payload) {
      res.status(404).json({ success: false, error: 'Generated price page not found' })
      return
    }

    res.json({ success: true, page: payload })
  } catch (error) {
    console.error('[API] Failed to load generated price page:', error)
    res.status(500).json({ success: false, error: 'Failed to load generated price page' })
  }
})

router.post('/admin/price-pages/generate', requireAdminApiKey, async (req, res) => {
  try {
    const payload = await generatePricePages({
      commoditySlug: typeof req.body?.commoditySlug === 'string' ? req.body.commoditySlug : undefined,
      scopeType: parseScopeType(req.body?.scopeType),
      scopeKey: typeof req.body?.scopeKey === 'string' ? req.body.scopeKey : undefined,
    })

    res.json({ success: payload.status !== 'failed', ...payload })
  } catch (error) {
    console.error('[API] Failed to generate price pages:', error)
    res.status(500).json({ success: false, error: 'Failed to generate price pages' })
  }
})

export default router
