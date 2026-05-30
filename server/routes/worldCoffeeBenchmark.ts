import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import {
  getCoffeePriceStackResponse,
  getWorldCoffeeBenchmarkResponse,
} from '../services/supabaseMarketDataService.js'
import { syncWorldCoffeeBenchmark } from '../services/worldCoffeeBenchmark.js'

const router = Router()

function parseLimit(value: unknown, defaultValue: number, maxValue: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return defaultValue
  }
  return Math.max(1, Math.min(Math.trunc(parsed), maxValue))
}

router.get('/coffee/world-benchmark', async (req, res) => {
  try {
    const dailyLimit = parseLimit(req.query.dailyLimit, 120, 500)
    const monthlyLimit = parseLimit(req.query.monthlyLimit, 240, 500)
    const payload = await getWorldCoffeeBenchmarkResponse({ dailyLimit, monthlyLimit })
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching world coffee benchmark:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch world coffee benchmark data',
    })
  }
})

router.get('/coffee/price-stack', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 180, 500)
    const payload = await getCoffeePriceStackResponse(limit)
    res.json(payload)
  } catch (error) {
    console.error('[API] Error fetching coffee price stack:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coffee price stack data',
    })
  }
})

router.post('/admin/coffee/world-benchmark/refresh', requireAdminApiKey, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true
    const writeArtifacts = req.body?.writeArtifacts !== false

    const result = await syncWorldCoffeeBenchmark({
      dryRun,
      writeArtifacts,
    })

    res.json({
      success: true,
      dryRun,
      writeArtifacts,
      rawRows: result.rawRows.length,
      factRows: result.rows.length,
      rowsPersisted: result.rowsPersisted,
      flagCounts: result.qc.flagCounts,
      sourceErrors: result.qc.sourceErrors,
      artifacts: result.artifacts,
    })
  } catch (error) {
    console.error('[API] Error refreshing world coffee benchmark:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to refresh world coffee benchmark data',
    })
  }
})

export default router
