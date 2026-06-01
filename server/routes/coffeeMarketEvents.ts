import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import {
  getCoffeeMarketEventBriefCandidatesResponse,
  getCoffeeMarketEventsResponse,
  getCoffeePolicyWatchResponse,
  getCoffeeSupplyRiskEventsResponse,
  syncCoffeeMarketEvents,
} from '../services/coffeeMarketEvents.js'

const router = Router()

function parseLimit(value: unknown, defaultValue: number, maxValue: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return defaultValue
  }
  return Math.max(1, Math.min(Math.trunc(parsed), maxValue))
}

function parseInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

router.get('/coffee/market-events', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 200, 500)
    const eventType = typeof req.query.eventType === 'string' ? req.query.eventType : undefined
    const countryIso = typeof req.query.countryIso === 'string' ? req.query.countryIso : undefined
    const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined
    const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined

    const payload = await getCoffeeMarketEventsResponse({
      limit,
      eventType,
      countryIso,
      fromDate,
      toDate,
    })
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching coffee market events:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coffee market event data',
    })
  }
})

router.get('/coffee/market-events/policy-watch', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 200, 500)
    const payload = await getCoffeePolicyWatchResponse(limit)
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching coffee policy watch:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coffee policy watch data',
    })
  }
})

router.get('/coffee/market-events/supply-risk', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 200, 500)
    const payload = await getCoffeeSupplyRiskEventsResponse(limit)
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching coffee supply risk events:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coffee supply risk event data',
    })
  }
})

router.get('/coffee/market-events/brief-candidates', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 50, 200)
    const payload = await getCoffeeMarketEventBriefCandidatesResponse(limit)
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching coffee market event brief candidates:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coffee market event brief candidate data',
    })
  }
})

router.post('/admin/coffee/market-events/refresh', requireAdminApiKey, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true
    const writeArtifacts = req.body?.writeArtifacts !== false
    const staleDays = parseInteger(req.body?.staleDays)
    const seedCsvPath = typeof req.body?.seedCsvPath === 'string' ? req.body.seedCsvPath : undefined
    const rawCsvPath = typeof req.body?.rawCsvPath === 'string' ? req.body.rawCsvPath : undefined

    const result = await syncCoffeeMarketEvents({
      dryRun,
      writeArtifacts,
      staleDays,
      seedCsvPath,
      rawCsvPath,
    })

    res.json({
      success: true,
      dryRun,
      writeArtifacts,
      rawRows: result.rawRowsPrepared,
      factRows: result.factRowsPrepared,
      rawRowsPersisted: result.rawRowsPersisted,
      factRowsPersisted: result.factRowsPersisted,
      duplicateRawRowsCollapsed: result.duplicateRawRowsCollapsed,
      duplicateFactRowsCollapsed: result.duplicateFactRowsCollapsed,
      qualityFlagCounts: result.qc.countByQualityFlag,
      artifacts: result.artifacts,
    })
  } catch (error) {
    console.error('[API] Error refreshing coffee market events:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to refresh coffee market event data',
    })
  }
})

export default router
