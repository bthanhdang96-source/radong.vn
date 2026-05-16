import { Router } from 'express'
import { getContentFeed } from '../services/contentFeed.js'

const router = Router()

router.get('/content/feed', async (req, res) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 18
    const items = await getContentFeed(limit)
    res.json({ success: true, items })
  } catch (error) {
    console.error('[API] Failed to load content feed:', error)
    res.status(500).json({ success: false, error: 'Failed to load content feed' })
  }
})

export default router
