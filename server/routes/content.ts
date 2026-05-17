import { Router } from 'express'
import { isContentFamilySlug, isPublicPriceCommodityGroupSlug } from '../services/contentTaxonomy.js'
import { getContentFeed } from '../services/contentFeed.js'

const router = Router()

function parseBooleanFlag(value: unknown, fallback: boolean) {
  if (typeof value !== 'string') {
    return fallback
  }

  if (value === 'false' || value === '0') {
    return false
  }

  if (value === 'true' || value === '1') {
    return true
  }

  return fallback
}

router.get('/content/feed', async (req, res) => {
  try {
    const family = typeof req.query.family === 'string' ? req.query.family : undefined
    const priceGroup = typeof req.query.priceGroup === 'string' ? req.query.priceGroup : undefined
    const q = typeof req.query.q === 'string' ? req.query.q : undefined
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined
    const includeModules = parseBooleanFlag(req.query.includeModules, true)

    if (family && !isContentFamilySlug(family)) {
      res.status(400).json({ success: false, error: 'Invalid family filter' })
      return
    }

    if (priceGroup && !isPublicPriceCommodityGroupSlug(priceGroup)) {
      res.status(400).json({ success: false, error: 'Invalid price group filter' })
      return
    }

    if (priceGroup && family !== 'tin-gia-nong-san') {
      res.status(400).json({ success: false, error: 'priceGroup requires family=tin-gia-nong-san' })
      return
    }

    const payload = await getContentFeed({
      family,
      priceGroup,
      q,
      limit: Number.isFinite(limit) ? limit : undefined,
      includeModules,
    })

    res.json({ success: true, ...payload })
  } catch (error) {
    console.error('[API] Failed to load content feed:', error)
    res.status(500).json({ success: false, error: 'Failed to load content feed' })
  }
})

export default router
