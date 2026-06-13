import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import { getAssminReport, getPublicAssminReport } from '../services/assminReportService.js'

const router = Router()

router.get('/assmin/report', async (_req, res) => {
  try {
    const payload = await getPublicAssminReport()
    res.json({ success: true, ...payload })
  } catch (error) {
    console.error('[API] Failed to build /assmin report:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build assmin report',
    })
  }
})

router.get('/admin/assmin/report', requireAdminApiKey, async (_req, res) => {
  try {
    const payload = await getAssminReport()
    res.json({ success: true, ...payload })
  } catch (error) {
    console.error('[API] Failed to build admin /assmin report:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build admin assmin report',
    })
  }
})

export default router
