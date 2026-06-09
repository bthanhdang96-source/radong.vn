import { Router } from 'express'
import { sendCachedJson } from '../middleware/publicResponseCache.js'
import { getVnPriceChainResponse } from '../services/supabaseMarketDataService.js'

const router = Router()

router.get('/vn-price-chain', async (_req, res) => {
  try {
    await sendCachedJson(_req, res, {
      label: 'vn-price-chain',
      ttlSeconds: 300,
      warnAfterMs: 2500,
    }, async () => {
      const payload = await getVnPriceChainResponse()
      return { success: true, ...payload }
    })
  } catch (error) {
    console.error('[API] Failed to load VN price chain:', error)
    res.status(500).json({ success: false, error: 'Failed to load VN price chain' })
  }
})

export default router
