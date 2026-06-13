import { Router } from 'express'
import type { Request } from 'express'
import { hasValidAntiScrapeInternalKey } from '../middleware/antiScrape.js'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import { sendCachedJson } from '../middleware/publicResponseCache.js'
import {
  generateCommodityPricePages,
  getGeneratedCommodityPricePageDetail,
  listGeneratedCommodityPricePages,
} from '../services/generatedCommodityPricePages/service.js'
import type { GeneratedCommodityPricePageSummary } from '../services/generatedPricePages/types.js'

const router = Router()
const PUBLIC_FULL_LIST_LIMIT = 120
const PUBLIC_LINK_LIST_LIMIT = 500
const INTERNAL_LIST_LIMIT = 5000

function parseLimit(value: unknown, fallback: number, max: number) {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = typeof raw === 'string' ? Number(raw) : Number.NaN
  return Number.isFinite(parsed) ? Math.max(1, Math.min(Math.trunc(parsed), max)) : fallback
}

function getFullListLimit(req: Request) {
  const max = hasValidAntiScrapeInternalKey(req) ? INTERNAL_LIST_LIMIT : PUBLIC_FULL_LIST_LIMIT
  return parseLimit(req.query.limit, 24, max)
}

function getLinkListLimit(req: Request) {
  return parseLimit(req.query.limit, 400, PUBLIC_LINK_LIST_LIMIT)
}

export function toGeneratedCommodityPricePageLink(item: GeneratedCommodityPricePageSummary) {
  return {
    path: item.path,
    commoditySlug: item.commoditySlug,
  }
}

router.get('/commodity-price-pages', async (req, res) => {
  try {
    await sendCachedJson(req, res, {
      label: 'commodity-price-pages',
      ttlSeconds: 600,
    }, async () => {
      const items = await listGeneratedCommodityPricePages({
        commoditySlug: typeof req.query.commoditySlug === 'string' ? req.query.commoditySlug : undefined,
        limit: getFullListLimit(req),
      })

      return { success: true, items }
    })
  } catch (error) {
    console.error('[API] Failed to list generated commodity price pages:', error)
    res.status(500).json({ success: false, error: 'Failed to list generated commodity price pages' })
  }
})

router.get('/commodity-price-page-links', async (req, res) => {
  try {
    await sendCachedJson(req, res, {
      label: 'commodity-price-page-links',
      ttlSeconds: 600,
    }, async () => {
      const items = await listGeneratedCommodityPricePages({
        commoditySlug: typeof req.query.commoditySlug === 'string' ? req.query.commoditySlug : undefined,
        limit: getLinkListLimit(req),
      })

      return {
        success: true,
        items: items.map(toGeneratedCommodityPricePageLink),
      }
    })
  } catch (error) {
    console.error('[API] Failed to list generated commodity price page links:', error)
    res.status(500).json({ success: false, error: 'Failed to list generated commodity price page links' })
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
