import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import {
  buildAiArticleContext,
  generateAiArticles,
  getAiArticle,
  listAiArticles,
  type AiArticleType,
} from '../services/aiArticles/service.js'

const router = Router()
const AI_ARTICLE_TYPES: AiArticleType[] = ['export_period_report', 'export_monthly_report', 'world_daily_price_update']

function parseArticleType(value: unknown) {
  return typeof value === 'string' && AI_ARTICLE_TYPES.includes(value as AiArticleType) ? (value as AiArticleType) : undefined
}

function parseBooleanFlag(value: unknown, fallback = false) {
  if (typeof value !== 'string') {
    return fallback
  }

  if (value === 'true' || value === '1') {
    return true
  }

  if (value === 'false' || value === '0') {
    return false
  }

  return fallback
}

router.get('/ai-articles', async (req, res) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined
    const items = await listAiArticles({ limit: Number.isFinite(limit) ? limit : undefined })
    res.json({ success: true, items })
  } catch (error) {
    console.error('[API] Failed to load AI articles:', error)
    res.status(500).json({ success: false, error: 'Failed to load AI articles' })
  }
})

router.get('/ai-articles/:slug', async (req, res) => {
  try {
    const article = await getAiArticle(req.params.slug)
    if (!article) {
      res.status(404).json({ success: false, error: 'AI article not found' })
      return
    }

    res.json({ success: true, article })
  } catch (error) {
    console.error('[API] Failed to load AI article:', error)
    res.status(500).json({ success: false, error: 'Failed to load AI article' })
  }
})

router.get('/admin/ai-articles/context', requireAdminApiKey, async (req, res) => {
  try {
    const articleType = parseArticleType(req.query.articleType)
    if (!articleType) {
      res.status(400).json({ success: false, error: 'Invalid articleType' })
      return
    }

    const context = await buildAiArticleContext({
      articleType,
      periodCode: typeof req.query.periodCode === 'string' ? req.query.periodCode : undefined,
      year: typeof req.query.year === 'string' ? Number(req.query.year) : undefined,
      month: typeof req.query.month === 'string' ? Number(req.query.month) : undefined,
      observedOn: typeof req.query.observedOn === 'string' ? req.query.observedOn : undefined,
    })

    if (!context) {
      res.status(404).json({ success: false, error: 'No eligible context found' })
      return
    }

    res.json({ success: true, context })
  } catch (error) {
    console.error('[API] Failed to build AI article context:', error)
    res.status(500).json({ success: false, error: 'Failed to build AI article context' })
  }
})

router.post('/admin/ai-articles/generate', requireAdminApiKey, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
    const result = await generateAiArticles({
      articleType: parseArticleType(body.articleType),
      periodCode: typeof body.periodCode === 'string' ? body.periodCode : undefined,
      year: typeof body.year === 'number' ? body.year : undefined,
      month: typeof body.month === 'number' ? body.month : undefined,
      observedOn: typeof body.observedOn === 'string' ? body.observedOn : undefined,
      force: typeof body.force === 'boolean' ? body.force : parseBooleanFlag(req.query.force, false),
    })

    res.json({ success: result.status !== 'failed', ...result })
  } catch (error) {
    console.error('[API] Failed to generate AI articles:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate AI articles',
    })
  }
})

export default router
