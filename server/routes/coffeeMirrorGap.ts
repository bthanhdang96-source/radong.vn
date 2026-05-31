import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import {
  getCoffeeMirrorGapResponse,
  getCoffeeMirrorGapSummaryResponse,
} from '../services/supabaseMarketDataService.js'
import { syncCoffeeMirrorImportUnitValue, type MirrorImportPeriodType } from '../services/coffeeMirrorImportUnitValue.js'

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

function parsePeriodType(value: unknown): MirrorImportPeriodType {
  return value === 'M' ? 'M' : 'A'
}

router.get('/coffee/mirror-gap', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 200, 500)
    const periodLabel = typeof req.query.period === 'string' ? req.query.period : undefined
    const qualityFlag = typeof req.query.qualityFlag === 'string' ? req.query.qualityFlag : undefined
    const payload = await getCoffeeMirrorGapResponse({ limit, periodLabel, qualityFlag })
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching coffee mirror gap:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coffee mirror gap data',
    })
  }
})

router.get('/coffee/mirror-gap/summary', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 20, 100)
    const payload = await getCoffeeMirrorGapSummaryResponse(limit)
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching coffee mirror gap summary:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coffee mirror gap summary data',
    })
  }
})

router.post('/admin/coffee/mirror-gap/refresh', requireAdminApiKey, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true
    const writeArtifacts = req.body?.writeArtifacts !== false
    const fromYear = parseInteger(req.body?.fromYear)
    const toYear = parseInteger(req.body?.toYear)
    const periodType = parsePeriodType(req.body?.periodType)

    const result = await syncCoffeeMirrorImportUnitValue({
      dryRun,
      writeArtifacts,
      fromYear,
      toYear,
      periodType,
    })

    res.json({
      success: true,
      dryRun,
      writeArtifacts,
      requestedPeriods: result.requestedPeriods,
      rawRows: result.rawRowsPrepared,
      factRows: result.factRowsPrepared,
      mirrorGapRows: result.mirrorGapRows.length,
      rawRowsPersisted: result.rawRowsPersisted,
      factRowsPersisted: result.factRowsPersisted,
      flagCounts: result.qc.flagCounts,
      mirrorGapFlagCounts: result.qc.mirrorGapFlagCounts,
      importerCoverage: result.qc.importerCoverage,
      artifacts: result.artifacts,
    })
  } catch (error) {
    console.error('[API] Error refreshing coffee mirror gap:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to refresh coffee mirror gap data',
    })
  }
})

export default router
