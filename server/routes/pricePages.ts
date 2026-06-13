import { Router } from 'express'
import type { Request } from 'express'
import { hasValidAntiScrapeInternalKey } from '../middleware/antiScrape.js'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import { sendCachedJson } from '../middleware/publicResponseCache.js'
import {
  generatePricePages,
  getGeneratedPricePageDetail,
  listGeneratedPricePages,
} from '../services/generatedPricePages/service.js'
import type { GeneratedPricePageSummary, PricePageScopeType } from '../services/generatedPricePages/types.js'

const router = Router()
const PUBLIC_FULL_LIST_LIMIT = 120
const PUBLIC_LINK_LIST_LIMIT = 500
const INTERNAL_LIST_LIMIT = 5000

function parseScopeType(value: unknown): PricePageScopeType | undefined {
  return value === 'province' || value === 'region_label' ? value : undefined
}

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

export function toGeneratedPricePageLink(item: GeneratedPricePageSummary) {
  return {
    path: item.path,
    commoditySlug: item.commoditySlug,
    locationSlug: item.locationSlug,
    provinceCode: item.provinceCode,
    locationLabel: item.locationLabel,
  }
}

router.get('/price-pages', async (req, res) => {
  try {
    await sendCachedJson(req, res, {
      label: 'price-pages',
      ttlSeconds: 600,
    }, async () => {
      const items = await listGeneratedPricePages({
        commoditySlug: typeof req.query.commoditySlug === 'string' ? req.query.commoditySlug : undefined,
        provinceCode: typeof req.query.provinceCode === 'string' ? req.query.provinceCode : undefined,
        scopeType: parseScopeType(req.query.scopeType),
        limit: getFullListLimit(req),
      })

      return { success: true, items }
    })
  } catch (error) {
    console.error('[API] Failed to list generated price pages:', error)
    res.status(500).json({ success: false, error: 'Failed to list generated price pages' })
  }
})

router.get('/price-page-links', async (req, res) => {
  try {
    await sendCachedJson(req, res, {
      label: 'price-page-links',
      ttlSeconds: 600,
    }, async () => {
      const items = await listGeneratedPricePages({
        commoditySlug: typeof req.query.commoditySlug === 'string' ? req.query.commoditySlug : undefined,
        provinceCode: typeof req.query.provinceCode === 'string' ? req.query.provinceCode : undefined,
        scopeType: parseScopeType(req.query.scopeType),
        limit: getLinkListLimit(req),
      })

      return {
        success: true,
        items: items.map(toGeneratedPricePageLink),
      }
    })
  } catch (error) {
    console.error('[API] Failed to list generated price page links:', error)
    res.status(500).json({ success: false, error: 'Failed to list generated price page links' })
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
