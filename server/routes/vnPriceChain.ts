import { Router } from 'express'
import { getVnPriceChainResponse } from '../services/supabaseMarketDataService.js'

const router = Router()

router.get('/vn-price-chain', async (_req, res) => {
  try {
    const payload = await getVnPriceChainResponse()
    res.json({ success: true, ...payload })
  } catch (error) {
    console.error('[API] Failed to load VN price chain:', error)
    res.status(500).json({ success: false, error: 'Failed to load VN price chain' })
  }
})

export default router
