import { fetchBackendResponse } from '../../_shared.js'

function firstHeaderValue(value) {
  if (Array.isArray(value)) {
    return firstHeaderValue(value[0])
  }

  return typeof value === 'string' ? value : ''
}

function buildForwardHeaders(req) {
  const headers = {}
  for (const name of ['accept', 'user-agent', 'referer', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip']) {
    const value = firstHeaderValue(req.headers[name])
    if (value) {
      headers[name] = value
    }
  }

  return headers
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ success: false, error: 'Method not allowed' })
    return
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
  if (!slug) {
    res.status(400).json({ success: false, error: 'Article slug is required' })
    return
  }

  try {
    const response = await fetchBackendResponse(`/api/news/articles/${encodeURIComponent(slug)}`, {
      headers: buildForwardHeaders(req),
    })
    const body = await response.text()
    res.status(response.status)
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8')

    const retryAfter = response.headers.get('retry-after')
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter)
    }

    if (response.ok) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    }

    res.send(body)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to proxy article',
    })
  }
}
