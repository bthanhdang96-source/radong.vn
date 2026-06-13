import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import test from 'node:test'
import express from 'express'
import type { Request } from 'express'
import {
  ANTI_SCRAPE_INTERNAL_HEADER,
  MemoryAntiScrapeStore,
  classifyAntiScrapeBucket,
  createAntiScrapeMiddleware,
  createAntiScrapeStore,
} from '../middleware/antiScrape.js'

async function requestApp(
  app: express.Express,
  path: string,
  headers: Record<string, string> = {},
) {
  const server: Server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))

  try {
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not bind to a TCP port')
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { headers })
    return {
      status: response.status,
      headers: response.headers,
      body: await response.text(),
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }
}

function makeProtectedApp(options: Parameters<typeof createAntiScrapeMiddleware>[0] = {}) {
  const app = express()
  app.use(createAntiScrapeMiddleware(options))
  app.get('/api/news/articles', (_req, res) => {
    res.json({ success: true, route: 'news-list' })
  })
  app.get('/api/price-pages', (_req, res) => {
    res.json({ success: true, route: 'price-pages' })
  })
  app.get('/gia-nong-san/:commoditySlug', (_req, res) => {
    res.type('html').send('<h1>ok</h1>')
  })
  return app
}

function makeRequestForClassification(originalUrl: string, query: Record<string, string> = {}) {
  return {
    method: 'GET',
    originalUrl,
    url: originalUrl,
    query,
  } as Request
}

test('anti-scrape blocks default automation user agents on protected public APIs', async () => {
  const app = makeProtectedApp({
    store: new MemoryAntiScrapeStore(),
  })

  const response = await requestApp(app, '/api/news/articles', {
    'user-agent': 'curl/8.0.1',
    accept: 'application/json',
  })

  assert.equal(response.status, 403)
  assert.match(response.body, /Forbidden/)
  assert.equal(response.headers.get('x-ratelimit-bucket'), 'json-list')
})

test('anti-scrape returns 429 with retry metadata when minute quota is exceeded', async () => {
  const app = makeProtectedApp({
    store: new MemoryAntiScrapeStore(),
    limits: {
      'json-list': { minute: 1, hour: 10 },
    },
  })

  const first = await requestApp(app, '/api/news/articles', {
    'user-agent': 'Mozilla/5.0',
    accept: 'application/json',
  })
  const second = await requestApp(app, '/api/news/articles', {
    'user-agent': 'Mozilla/5.0',
    accept: 'application/json',
  })

  assert.equal(first.status, 200)
  assert.equal(second.status, 429)
  assert.equal(second.headers.get('retry-after') !== null, true)
  assert.equal(second.headers.get('x-ratelimit-bucket'), 'json-list')
  assert.match(second.body, /Too many requests/)
  assert.match(second.body, /retryAfterSeconds/)
})

test('anti-scrape enforces hourly quota independently from minute quota', async () => {
  const app = makeProtectedApp({
    store: new MemoryAntiScrapeStore(),
    limits: {
      'json-list': { minute: 10, hour: 1 },
    },
  })

  const first = await requestApp(app, '/api/news/articles', {
    'user-agent': 'Mozilla/5.0',
    accept: 'application/json',
  })
  const second = await requestApp(app, '/api/news/articles', {
    'user-agent': 'Mozilla/5.0',
    accept: 'application/json',
  })

  assert.equal(first.status, 200)
  assert.equal(second.status, 429)
  assert.equal(second.headers.get('x-ratelimit-limit'), '1')
})

test('anti-scrape internal key bypasses bulk sitemap-style requests', async () => {
  const app = makeProtectedApp({
    internalKey: 'internal-secret',
    store: new MemoryAntiScrapeStore(),
    limits: {
      bulk: { minute: 1, hour: 1 },
    },
  })

  const headers = {
    [ANTI_SCRAPE_INTERNAL_HEADER]: 'internal-secret',
    'user-agent': 'curl/8.0.1',
    accept: 'application/json',
  }
  const first = await requestApp(app, '/api/price-pages?limit=5000', headers)
  const second = await requestApp(app, '/api/price-pages?limit=5000', headers)

  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(second.headers.get('x-ratelimit-bucket'), null)
})

test('anti-scrape skips valid admin API key requests before user-agent block', async () => {
  const previous = process.env.ADMIN_API_KEY
  process.env.ADMIN_API_KEY = 'test-admin-key'

  try {
    const app = makeProtectedApp({
      store: new MemoryAntiScrapeStore(),
    })
    const response = await requestApp(app, '/api/news/articles', {
      authorization: 'Bearer test-admin-key',
      'user-agent': 'curl/8.0.1',
      accept: 'application/json',
    })

    assert.equal(response.status, 200)
  } finally {
    if (previous === undefined) {
      delete process.env.ADMIN_API_KEY
    } else {
      process.env.ADMIN_API_KEY = previous
    }
  }
})

test('anti-scrape classifier treats link indexes as list traffic and oversized full lists as bulk', () => {
  assert.equal(
    classifyAntiScrapeBucket(makeRequestForClassification('/api/price-page-links?limit=400', { limit: '400' })),
    'json-list',
  )
  assert.equal(
    classifyAntiScrapeBucket(makeRequestForClassification('/api/price-pages?limit=5000', { limit: '5000' })),
    'bulk',
  )
  assert.equal(
    classifyAntiScrapeBucket(makeRequestForClassification('/gia-nong-san/ca-phe-robusta')),
    'html-detail',
  )
})

test('anti-scrape memory store resets counters on fixed-window boundaries', async () => {
  let now = 1_000
  const store = new MemoryAntiScrapeStore(() => now)
  const first = await store.increment('client:minute', 60_000)
  const second = await store.increment('client:minute', 60_000)
  now = 61_000
  const third = await store.increment('client:minute', 60_000)

  assert.equal(first.count, 1)
  assert.equal(second.count, 2)
  assert.equal(third.count, 1)
})

test('anti-scrape uses memory store when REDIS_URL is not configured', () => {
  const previous = process.env.REDIS_URL
  delete process.env.REDIS_URL

  try {
    assert.ok(createAntiScrapeStore() instanceof MemoryAntiScrapeStore)
  } finally {
    if (previous === undefined) {
      delete process.env.REDIS_URL
    } else {
      process.env.REDIS_URL = previous
    }
  }
})
