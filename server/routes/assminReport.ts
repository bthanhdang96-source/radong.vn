import { Router } from 'express'
import { getAssminReport } from '../services/assminReportService.js'

const router = Router()

router.get('/assmin/report', async (_req, res) => {
  try {
    const payload = await getAssminReport()
    res.json({ success: true, ...payload })
  } catch (error) {
    console.error('[API] Failed to build /assmin report:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build assmin report',
    })
  }
})

export default router
