import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import {
  getFreightLogisticsEventsResponse,
  getFreightLogisticsMonthlyResponse,
  getFreightLogisticsReviewQueueResponse,
  getFreightLogisticsResponse,
  syncFreightLogisticsProxy,
} from '../services/freightLogisticsProxy.js'

const router = Router()

function parseLimit(value: unknown, defaultValue: number, maxValue: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return defaultValue
  }
  return Math.max(1, Math.min(Math.trunc(parsed), maxValue))
}

function parseSourceIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
    : undefined
}

function parseInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

router.get('/coffee/freight-logistics', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 200, 500)
    const payload = await getFreightLogisticsResponse(limit)
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching freight logistics proxy:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch freight logistics proxy data',
    })
  }
})

router.get('/coffee/freight-logistics/events', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 200, 500)
    const payload = await getFreightLogisticsEventsResponse(limit)
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching freight logistics events:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch freight logistics event data',
    })
  }
})

router.get('/coffee/freight-logistics/monthly', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 100, 500)
    const payload = await getFreightLogisticsMonthlyResponse(limit)
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching freight logistics monthly proxy:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch freight logistics monthly data',
    })
  }
})

router.get('/coffee/freight-logistics/review-queue', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 100, 500)
    const payload = await getFreightLogisticsReviewQueueResponse(limit)
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching freight logistics review queue:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch freight logistics review queue data',
    })
  }
})

router.post('/admin/coffee/freight-logistics/refresh', requireAdminApiKey, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true
    const writeArtifacts = req.body?.writeArtifacts !== false
    const fetchSources = req.body?.fetchSources === true
    const probeSources = req.body?.probeSources === true
    const sourceHealthOnly = req.body?.sourceHealthOnly === true
    const maxItemsPerSource = parseInteger(req.body?.maxItemsPerSource)
    const seedCsvPath = typeof req.body?.seedCsvPath === 'string' ? req.body.seedCsvPath : undefined
    const fromDate = typeof req.body?.fromDate === 'string' ? req.body.fromDate : undefined
    const toDate = typeof req.body?.toDate === 'string' ? req.body.toDate : undefined
    const sourceIds = parseSourceIds(req.body?.sourceIds)

    const result = await syncFreightLogisticsProxy({
      dryRun,
      writeArtifacts,
      fetchSources,
      probeSources,
      sourceHealthOnly,
      maxItemsPerSource,
      seedCsvPath,
      fromDate,
      toDate,
      sourceIds,
    })

    res.json({
      success: true,
      dryRun,
      writeArtifacts,
      rawRows: result.rawRowsPrepared,
      factRows: result.factRowsPrepared,
      rawRowsPersisted: result.rawRowsPersisted,
      factRowsPersisted: result.factRowsPersisted,
      sourceRowsFetched: result.sourceRowsFetched,
      sourceErrors: result.sourceErrors,
      sourceHealth: result.sourceHealth,
      duplicateRawRowsCollapsed: result.duplicateRawRowsCollapsed,
      duplicateFactRowsCollapsed: result.duplicateFactRowsCollapsed,
      qualityFlagCounts: result.qc.flagCounts,
      artifacts: result.artifacts,
    })
  } catch (error) {
    console.error('[API] Error refreshing freight logistics proxy:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to refresh freight logistics proxy data',
    })
  }
})

export default router
