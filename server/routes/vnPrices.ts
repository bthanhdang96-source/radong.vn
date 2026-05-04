import { Router } from 'express'
import { getVnPriceSourceStatus, getVnPrices, getVnPricesHistory } from '../services/supabaseMarketDataService.js'
import type { PriceType } from '../services/marketDataMappings.js'

const router = Router()
const VALID_PRICE_TYPES = new Set(['farm_gate', 'wholesale', 'retail', 'export'])

let lastRefreshAt = 0
const REFRESH_COOLDOWN_MS = 15 * 60 * 1000

function parsePriceTypes(value: unknown): PriceType[] | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined
  }

  const parsed = value
    .split(',')
    .map(entry => entry.trim())
    .filter((entry): entry is PriceType => VALID_PRICE_TYPES.has(entry))

  return parsed.length > 0 ? parsed : undefined
}

router.get('/vn-prices', async (_req, res) => {
  try {
    const payload = await getVnPrices(false, {
      priceTypes: parsePriceTypes(_req.query.priceType),
    })
    res.json({ success: true, ...payload })
  } catch (error) {
    console.error('[API] Failed to load VN prices:', error)
    res.status(500).json({ success: false, error: 'Failed to load VN prices' })
  }
})

router.get('/vn-prices/refresh', async (_req, res) => {
  const now = Date.now()
  if (now - lastRefreshAt < REFRESH_COOLDOWN_MS) {
    res.status(429).json({
      success: false,
      error: 'Refresh is rate limited',
      retryAfterMs: REFRESH_COOLDOWN_MS - (now - lastRefreshAt),
    })
    return
  }

  try {
    lastRefreshAt = now
    const payload = await getVnPrices(true, {
      priceTypes: parsePriceTypes(_req.query.priceType),
    })
    res.json({ success: true, ...payload })
  } catch (error) {
    console.error('[API] Failed to refresh VN prices:', error)
    res.status(500).json({ success: false, error: 'Failed to refresh VN prices' })
  }
})

router.get('/vn-prices/history', (_req, res) => {
  const date = typeof _req.query.date === 'string' ? _req.query.date : ''
  if (!date) {
    res.status(400).json({ success: false, error: 'Missing required date query' })
    return
  }

  const snapshot = getVnPricesHistory(date)
  if (!snapshot) {
    res.status(404).json({ success: false, error: 'No history found for the requested date' })
    return
  }

  res.json({ success: true, data: snapshot })
})

router.get('/vn-prices/sources', async (_req, res) => {
  try {
    const sources = await getVnPriceSourceStatus()
    res.json({ success: true, data: sources })
  } catch (error) {
    console.error('[API] Failed to load VN price sources:', error)
    res.status(500).json({ success: false, error: 'Failed to load source status' })
  }
})

export default router
