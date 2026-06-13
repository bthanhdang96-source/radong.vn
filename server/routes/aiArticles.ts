import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import {
  buildAiArticleContext,
  createAiBlogTopicSeed,
  deleteAiBlogTopicSeed,
  generateAiArticles,
  getAiArticle,
  isAiBlogAudience,
  isAiBlogStyle,
  isAiBlogTopicSeedStatus,
  listAiBlogTopicSeeds,
  listAiArticles,
  updateAiBlogTopicSeed,
  updateAiArticleStatus,
  type AiBlogAudience,
  type AiBlogStyle,
  type AiBlogTopicSeedStatus,
  type AiArticleStatus,
  type AiArticleType,
} from '../services/aiArticles/service.js'

const router = Router()
const AI_ARTICLE_TYPES: AiArticleType[] = ['export_period_report', 'export_monthly_report', 'world_daily_price_update', 'agri_blog']
const AI_ARTICLE_STATUSES: AiArticleStatus[] = ['draft', 'published', 'archived', 'failed']
const REVIEWABLE_AI_ARTICLE_STATUSES: Array<Exclude<AiArticleStatus, 'failed'>> = ['draft', 'published', 'archived']

function parseArticleType(value: unknown) {
  return typeof value === 'string' && AI_ARTICLE_TYPES.includes(value as AiArticleType) ? (value as AiArticleType) : undefined
}

function parseArticleStatus(value: unknown) {
  return typeof value === 'string' && AI_ARTICLE_STATUSES.includes(value as AiArticleStatus) ? (value as AiArticleStatus) : undefined
}

function parseBlogAudience(value: unknown) {
  return isAiBlogAudience(value) ? value : undefined
}

function parseBlogStyle(value: unknown) {
  return isAiBlogStyle(value) ? value : undefined
}

function parseBlogSeedStatus(value: unknown) {
  return isAiBlogTopicSeedStatus(value) ? value : undefined
}

function parseReviewableArticleStatus(value: unknown) {
  return typeof value === 'string' && REVIEWABLE_AI_ARTICLE_STATUSES.includes(value as Exclude<AiArticleStatus, 'failed'>)
    ? (value as Exclude<AiArticleStatus, 'failed'>)
    : undefined
}

function getRouteParam(value: unknown) {
  return typeof value === 'string' ? value : undefined
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

function parseInteger(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  }

  return undefined
}

function parseJsonObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function parseSeedInput(body: Record<string, unknown>) {
  return {
    topicKey: typeof body.topicKey === 'string' ? body.topicKey : undefined,
    audience: parseBlogAudience(body.audience) as AiBlogAudience,
    headlineHint: typeof body.headlineHint === 'string' ? body.headlineHint : '',
    keywordMain: typeof body.keywordMain === 'string' ? body.keywordMain : '',
    keywordsSub: parseStringArray(body.keywordsSub),
    style: parseBlogStyle(body.style) as AiBlogStyle | undefined,
    priority: parseInteger(body.priority),
    status: parseBlogSeedStatus(body.status) as AiBlogTopicSeedStatus | undefined,
    sourceRef: parseJsonObject(body.sourceRef),
  }
}

router.get('/ai-articles', async (req, res) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined
    const items = await listAiArticles({
      limit: Number.isFinite(limit) ? limit : undefined,
      articleType: parseArticleType(req.query.articleType),
    })
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

router.get('/admin/ai-articles', requireAdminApiKey, async (req, res) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined
    const status = req.query.status === 'all' ? 'all' : parseArticleStatus(req.query.status) ?? 'draft'
    const articleType = parseArticleType(req.query.articleType)
    const items = await listAiArticles({
      includeDrafts: true,
      limit: Number.isFinite(limit) ? limit : undefined,
      status,
      articleType,
    })

    res.json({ success: true, items, filters: { status, articleType: articleType ?? 'all' } })
  } catch (error) {
    console.error('[API] Failed to load admin AI articles:', error)
    res.status(500).json({ success: false, error: 'Failed to load admin AI articles' })
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
      audience: parseBlogAudience(req.query.audience),
      seedId: typeof req.query.seedId === 'string' ? req.query.seedId : undefined,
      dailyLimit: parseInteger(req.query.dailyLimit),
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
      audience: parseBlogAudience(body.audience),
      seedId: typeof body.seedId === 'string' ? body.seedId : undefined,
      dailyLimit: parseInteger(body.dailyLimit),
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

router.post('/admin/ai-articles/generate-blog', requireAdminApiKey, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
    const result = await generateAiArticles({
      articleType: 'agri_blog',
      audience: parseBlogAudience(body.audience),
      seedId: typeof body.seedId === 'string' ? body.seedId : undefined,
      dailyLimit: parseInteger(body.dailyLimit),
      force: typeof body.force === 'boolean' ? body.force : parseBooleanFlag(req.query.force, false),
    })

    res.json({ success: result.status !== 'failed', ...result })
  } catch (error) {
    console.error('[API] Failed to generate AI blog articles:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate AI blog articles',
    })
  }
})

router.get('/admin/ai-blog-topic-seeds', requireAdminApiKey, async (req, res) => {
  try {
    const status = req.query.status === 'all' ? 'all' : parseBlogSeedStatus(req.query.status)
    const seeds = await listAiBlogTopicSeeds({
      audience: parseBlogAudience(req.query.audience),
      status,
      limit: parseInteger(req.query.limit),
    })
    res.json({ success: true, items: seeds, filters: { status: status ?? 'all' } })
  } catch (error) {
    console.error('[API] Failed to load AI blog topic seeds:', error)
    res.status(500).json({ success: false, error: 'Failed to load AI blog topic seeds' })
  }
})

router.post('/admin/ai-blog-topic-seeds', requireAdminApiKey, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
    const seed = await createAiBlogTopicSeed(parseSeedInput(body))
    res.status(201).json({ success: true, seed })
  } catch (error) {
    console.error('[API] Failed to create AI blog topic seed:', error)
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create AI blog topic seed',
    })
  }
})

router.patch('/admin/ai-blog-topic-seeds/:id', requireAdminApiKey, async (req, res) => {
  try {
    const id = getRouteParam(req.params.id)
    if (!id) {
      res.status(400).json({ success: false, error: 'Invalid blog topic seed id' })
      return
    }

    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
    const seed = await updateAiBlogTopicSeed(id, parseSeedInput(body))
    res.json({ success: true, seed })
  } catch (error) {
    console.error('[API] Failed to update AI blog topic seed:', error)
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update AI blog topic seed',
    })
  }
})

router.delete('/admin/ai-blog-topic-seeds/:id', requireAdminApiKey, async (req, res) => {
  try {
    const id = getRouteParam(req.params.id)
    if (!id) {
      res.status(400).json({ success: false, error: 'Invalid blog topic seed id' })
      return
    }

    const result = await deleteAiBlogTopicSeed(id)
    res.json({ success: true, ...result })
  } catch (error) {
    console.error('[API] Failed to delete AI blog topic seed:', error)
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete AI blog topic seed',
    })
  }
})

router.get('/admin/ai-articles/:slug', requireAdminApiKey, async (req, res) => {
  try {
    const slug = getRouteParam(req.params.slug)
    if (!slug) {
      res.status(400).json({ success: false, error: 'Invalid AI article slug' })
      return
    }

    const article = await getAiArticle(slug, { includeDrafts: true })
    if (!article) {
      res.status(404).json({ success: false, error: 'AI article not found' })
      return
    }

    res.json({ success: true, article })
  } catch (error) {
    console.error('[API] Failed to load admin AI article:', error)
    res.status(500).json({ success: false, error: 'Failed to load admin AI article' })
  }
})

router.patch('/admin/ai-articles/:slug', requireAdminApiKey, async (req, res) => {
  try {
    const slug = getRouteParam(req.params.slug)
    if (!slug) {
      res.status(400).json({ success: false, error: 'Invalid AI article slug' })
      return
    }

    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
    const status = parseReviewableArticleStatus(body.status)
    if (!status) {
      res.status(400).json({ success: false, error: 'Invalid AI article status' })
      return
    }

    const article = await updateAiArticleStatus(slug, status)
    if (!article) {
      res.status(404).json({ success: false, error: 'AI article not found' })
      return
    }

    res.json({ success: true, article })
  } catch (error) {
    console.error('[API] Failed to update admin AI article:', error)
    res.status(500).json({ success: false, error: 'Failed to update admin AI article' })
  }
})

export default router
