import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import {
  getExchangeRateLookupResponse,
  parseExchangeRateBackfillDaysParam,
  getExchangeRateSyncRuns,
  parseExchangeRateCodesParam,
  parseExchangeRateDaysParam,
  syncExchangeRatesToSupabase,
} from '../services/exchangeRatesService.js'

const router = Router()

let lastRefreshAt = 0
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000

router.get('/exchange-rates', async (req, res) => {
  try {
    const payload = await getExchangeRateLookupResponse({
      days: parseExchangeRateDaysParam(req.query.days),
      codes: parseExchangeRateCodesParam(req.query.codes),
    })

    res.json({
      success: true,
      ...payload,
    })
  } catch (error) {
    console.error('[API] Failed to load exchange rates:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load exchange rates',
    })
  }
})

router.post('/admin/exchange-rates/refresh', requireAdminApiKey, async (req, res) => {
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
    const requestedDays = parseExchangeRateBackfillDaysParam(req.body?.backfillDays ?? req.query.backfillDays ?? 1)
    const sync = await syncExchangeRatesToSupabase({
      backfillDays: requestedDays,
    })
    const payload = await getExchangeRateLookupResponse({
      days: parseExchangeRateDaysParam(req.query.days),
      codes: parseExchangeRateCodesParam(req.query.codes),
    })

    res.json({
      success: sync.success,
      sync,
      ...payload,
    })
  } catch (error) {
    console.error('[API] Failed to refresh exchange rates:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refresh exchange rates',
    })
  }
})

router.get('/admin/exchange-rates/sync-runs', requireAdminApiKey, async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit)
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(Math.trunc(rawLimit), 200)) : 20
    const runs = await getExchangeRateSyncRuns(limit)

    res.json({
      success: true,
      count: runs.length,
      runs,
    })
  } catch (error) {
    console.error('[API] Failed to load exchange rate sync runs:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load exchange rate sync runs',
    })
  }
})

export default router
