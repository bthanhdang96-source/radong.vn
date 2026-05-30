import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import {
  getCoffeeCompetitorBenchmarkResponse,
  getCoffeeCompetitorBenchmarkSummaryResponse,
} from '../services/supabaseMarketDataService.js'
import { syncCompetitorCoffeeExportUnitValue, type CompetitorCoffeePeriodType } from '../services/competitorCoffeeExportUnitValue.js'

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

function parsePeriodType(value: unknown): CompetitorCoffeePeriodType {
  return value === 'M' ? 'M' : 'A'
}

router.get('/coffee/competitor-benchmark', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 200, 500)
    const periodLabel = typeof req.query.period === 'string' ? req.query.period : undefined
    const qualityFlag = typeof req.query.qualityFlag === 'string' ? req.query.qualityFlag : undefined
    const payload = await getCoffeeCompetitorBenchmarkResponse({ limit, periodLabel, qualityFlag })
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching coffee competitor benchmark:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coffee competitor benchmark data',
    })
  }
})

router.get('/coffee/competitor-benchmark/summary', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 20, 100)
    const payload = await getCoffeeCompetitorBenchmarkSummaryResponse(limit)
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching coffee competitor benchmark summary:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coffee competitor benchmark summary data',
    })
  }
})

router.post('/admin/coffee/competitor-benchmark/refresh', requireAdminApiKey, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true
    const writeArtifacts = req.body?.writeArtifacts !== false
    const fromYear = parseInteger(req.body?.fromYear)
    const toYear = parseInteger(req.body?.toYear)
    const periodType = parsePeriodType(req.body?.periodType)

    const result = await syncCompetitorCoffeeExportUnitValue({
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
      benchmarkRows: result.benchmarkRows.length,
      rawRowsPersisted: result.rawRowsPersisted,
      factRowsPersisted: result.factRowsPersisted,
      flagCounts: result.qc.flagCounts,
      reporterCoverage: result.qc.reporterCoverage,
      artifacts: result.artifacts,
    })
  } catch (error) {
    console.error('[API] Error refreshing coffee competitor benchmark:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to refresh coffee competitor benchmark data',
    })
  }
})

export default router
