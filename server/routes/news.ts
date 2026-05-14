import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import {
  crawlNewsSource,
  getNewsArticle,
  getNewsArticles,
  getNewsHealth,
  getNewsRuns,
  getNewsSources,
  getNewsTopics,
} from '../services/news/service.js'
import { NEWS_SOURCE_KEYS, isNewsSourceVisible } from '../services/news/sourceRegistry.js'
import type { NewsSourceKey } from '../services/news/types.js'

const router = Router()

router.get('/news/articles', async (req, res) => {
  try {
    const payload = await getNewsArticles({
      source:
        typeof req.query.source === 'string' && NEWS_SOURCE_KEYS.includes(req.query.source as NewsSourceKey)
          ? (req.query.source as NewsSourceKey)
          : undefined,
      topic: typeof req.query.topic === 'string' ? req.query.topic : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    })

    res.json({ success: true, ...payload })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load news articles',
    })
  }
})

router.get('/news/articles/:slug', async (req, res) => {
  try {
    const payload = await getNewsArticle(req.params.slug)
    if (!payload) {
      res.status(404).json({ success: false, error: 'Article not found' })
      return
    }

    res.json({ success: true, ...payload })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load article',
    })
  }
})

router.get('/news/sources', async (_req, res) => {
  try {
    const sources = await getNewsSources()
    res.json({ success: true, items: sources })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load news sources',
    })
  }
})

router.get('/news/topics', async (_req, res) => {
  try {
    const items = await getNewsTopics()
    res.json({ success: true, items })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load topics',
    })
  }
})

router.post('/admin/news/crawl/:sourceKey', requireAdminApiKey, async (req, res) => {
  const sourceKey = req.params.sourceKey
  if (!NEWS_SOURCE_KEYS.includes(sourceKey as NewsSourceKey)) {
    res.status(400).json({ success: false, error: 'Unknown source key' })
    return
  }

  if (!isNewsSourceVisible(sourceKey as NewsSourceKey)) {
    res.status(400).json({ success: false, error: 'Source is disabled' })
    return
  }

  try {
    const payload = await crawlNewsSource(sourceKey as NewsSourceKey)
    res.json({ success: true, ...payload })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to crawl source',
    })
  }
})

router.get('/admin/news/runs', requireAdminApiKey, async (req, res) => {
  const sourceKey =
    typeof req.query.source === 'string' && NEWS_SOURCE_KEYS.includes(req.query.source as NewsSourceKey)
      ? (req.query.source as NewsSourceKey)
      : undefined

  try {
    const items = await getNewsRuns(sourceKey)
    res.json({ success: true, items })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load crawl runs',
    })
  }
})

router.get('/admin/news/health', requireAdminApiKey, async (_req, res) => {
  try {
    const payload = await getNewsHealth()
    res.json({ success: true, ...payload })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load news health',
    })
  }
})

export default router
