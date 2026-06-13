import { Router } from 'express'
import { setSeoHtmlHeaders } from '../services/httpSecurity.js'
import { getPublicOrigin } from '../services/publicOrigin.js'
import { getAiArticleAsNewsDetail } from '../services/aiArticles/service.js'
import { renderNewsArticleHtml } from '../services/news/htmlRenderer.js'
import { getNewsArticle } from '../services/news/service.js'
import type { NewsDetailResponse } from '../services/news/types.js'

const router = Router()

async function loadNewsArticle(slug: string): Promise<NewsDetailResponse | null> {
  return ((await getNewsArticle(slug)) ?? (await getAiArticleAsNewsDetail(slug))) as NewsDetailResponse | null
}

router.get('/tin-tuc/:slug', async (req, res) => {
  try {
    const payload = await loadNewsArticle(req.params.slug)
    if (!payload) {
      res.status(404).send('Article not found')
      return
    }

    setSeoHtmlHeaders(res)
    res.status(200).send(renderNewsArticleHtml(payload, getPublicOrigin(req)))
  } catch (error) {
    console.error('[Public News] Failed to render news article:', error)
    res.status(500).send('Failed to render news article')
  }
})

export default router
