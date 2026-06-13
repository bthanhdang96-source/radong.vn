import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import express, { type Router } from 'express'
import aiArticlesRouter from '../routes/aiArticles.js'
import assminReportRouter from '../routes/assminReport.js'
import coffeeMarketEventsRouter from '../routes/coffeeMarketEvents.js'
import freightLogisticsProxyRouter from '../routes/freightLogisticsProxy.js'
import {
  renderCommodityPricePageHtml,
} from '../services/generatedPricePages/htmlRenderer.js'
import { renderNewsArticleHtml } from '../services/news/htmlRenderer.js'
import { getPublicOrigin, toAbsolutePublicUrl } from '../services/publicOrigin.js'
import { buildVnPricesHistoryFromSupabaseRows } from '../services/supabaseMarketDataService.js'
import type { SourceSnapshot } from '../services/crawlers/types.js'
import type { GeneratedCommodityPricePageDetail } from '../services/generatedPricePages/types.js'
import type { NewsDetailResponse } from '../services/news/types.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function routeIndex(path: string, method: string) {
  const stack = (aiArticlesRouter as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>
  }).stack

  return stack.findIndex(layer => layer.route?.path === path && layer.route.methods[method] === true)
}

async function requestRouter(router: Router, path: string) {
  const app = express()
  app.use('/api', router)

  const server: Server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))

  try {
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not bind to a TCP port')
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${path}`)
    return {
      status: response.status,
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

async function withAdminApiKey<T>(callback: () => Promise<T>) {
  const previous = process.env.ADMIN_API_KEY
  process.env.ADMIN_API_KEY = 'test-admin-key'
  try {
    return await callback()
  } finally {
    if (previous === undefined) {
      delete process.env.ADMIN_API_KEY
    } else {
      process.env.ADMIN_API_KEY = previous
    }
  }
}

test('admin AI static routes are registered before slug route', () => {
  const contextIndex = routeIndex('/admin/ai-articles/context', 'get')
  const generateIndex = routeIndex('/admin/ai-articles/generate', 'post')
  const generateBlogIndex = routeIndex('/admin/ai-articles/generate-blog', 'post')
  const topicSeedsIndex = routeIndex('/admin/ai-blog-topic-seeds', 'get')
  const slugIndex = routeIndex('/admin/ai-articles/:slug', 'get')

  assert.notEqual(contextIndex, -1)
  assert.notEqual(generateIndex, -1)
  assert.notEqual(generateBlogIndex, -1)
  assert.notEqual(topicSeedsIndex, -1)
  assert.notEqual(slugIndex, -1)
  assert.ok(contextIndex < slugIndex)
  assert.ok(generateIndex < slugIndex)
  assert.ok(generateBlogIndex < slugIndex)
})

test('public origin helper ignores untrusted host headers outside local development', () => {
  const previous = process.env.PUBLIC_SITE_URL
  delete process.env.PUBLIC_SITE_URL

  try {
    assert.equal(
      getPublicOrigin({
        get(name: string) {
          if (name === 'x-forwarded-host') {
            return 'attacker.example'
          }
          if (name === 'host') {
            return 'attacker.example'
          }
          return undefined
        },
        protocol: 'https',
      }),
      'https://radongvn.vercel.app',
    )

    assert.equal(
      getPublicOrigin({
        get(name: string) {
          if (name === 'host') {
            return 'localhost:5173'
          }
          if (name === 'x-forwarded-proto') {
            return 'http'
          }
          return undefined
        },
        protocol: 'http',
      }),
      'http://localhost:5173',
    )

    process.env.PUBLIC_SITE_URL = 'https://www.nongsanvn.example/path'
    assert.equal(
      toAbsolutePublicUrl('/gia-nong-san/thanh-long', {
        get(name: string) {
          return name === 'host' ? 'attacker.example' : undefined
        },
        protocol: 'https',
      }),
      'https://www.nongsanvn.example/gia-nong-san/thanh-long',
    )
    assert.equal(toAbsolutePublicUrl('https://attacker.example/landing'), 'https://www.nongsanvn.example')
  } finally {
    if (previous === undefined) {
      delete process.env.PUBLIC_SITE_URL
    } else {
      process.env.PUBLIC_SITE_URL = previous
    }
  }
})

test('operational diagnostics and review queues require admin API key', async () => {
  await withAdminApiKey(async () => {
    const protectedRoutes: Array<[Router, string]> = [
      [assminReportRouter, '/api/admin/assmin/report'],
      [coffeeMarketEventsRouter, '/api/coffee/market-events/brief-candidates'],
      [coffeeMarketEventsRouter, '/api/coffee/market-events/review-queue'],
      [freightLogisticsProxyRouter, '/api/coffee/freight-logistics/review-queue'],
    ]

    for (const [router, path] of protectedRoutes) {
      const response = await requestRouter(router, path)
      assert.equal(response.status, 401, path)
      assert.match(response.body, /Admin API key is required/, path)
    }
  })
})

test('review queue views are revoked from public Supabase roles', () => {
  const sql = readFileSync(join(repoRoot, 'supabase', 'migrations', '20260613055444_restrict_public_diagnostics.sql'), 'utf8')
  const views = [
    'vw_coffee_market_event_brief_candidates',
    'vw_coffee_market_event_review_queue',
    'vw_coffee_freight_logistics_review_queue',
  ]

  for (const view of views) {
    assert.match(sql, new RegExp(`revoke select on public\\.${view} from anon, authenticated;`, 'i'))
    assert.match(sql, new RegExp(`grant select on public\\.${view} to service_role;`, 'i'))
  }
})

test('commodity price HTML renderer emits SEO metadata instead of SPA shell', () => {
  const page: GeneratedCommodityPricePageDetail = {
    id: 'page-1',
    slug: 'thanh-long',
    path: '/gia-nong-san/thanh-long',
    commoditySlug: 'thanh-long',
    category: 'Trai cay',
    title: 'Gia thanh long hom nay',
    excerpt: 'Gia thanh long moi nhat.',
    answerSummary: 'Gia thanh long dang duoc cap nhat tu du lieu thi truong.',
    topicTags: ['gia-nong-san'],
    thumbnailUrl: '/images/commodities/thanh-long/hero.jpg',
    thumbnailAlt: 'Thanh long',
    primaryPriceType: 'farm_gate',
    renderMode: 'national_article',
    headlineLatestPriceVnd: 18000,
    headlineLatestPriceUnit: 'VND/kg',
    dayChangeVnd: 100,
    dayChangePct: 0.56,
    change7dVnd: 200,
    change7dPct: 1.12,
    lowestPriceVnd: 17000,
    highestPriceVnd: 19000,
    priceSpreadVnd: 2000,
    locationCount: 1,
    latestObservedOn: '2026-06-06',
    nationalScopeLabel: 'Viet Nam',
    publishedAt: '2026-06-06T01:00:00.000Z',
    updatedAt: '2026-06-06T02:00:00.000Z',
    status: 'published',
    bodyHtml: '<section><h2>Cap nhat gia</h2><p>Noi dung gia.</p></section>',
    bodyText: 'Noi dung gia.',
    faq: [{ question: 'Gia thanh long bao nhieu?', answer: 'Khoang 18.000 dong/kg.' }],
    seo: {
      title: 'Gia thanh long hom nay | NongSanVN',
      description: 'Bang gia thanh long moi nhat.',
      canonicalPath: '/gia-nong-san/thanh-long',
      ogTitle: 'Gia thanh long hom nay',
      ogDescription: 'Bang gia thanh long moi nhat.',
    },
    regionRows: [],
    varietySections: [],
    unitSections: [],
    chainCards: [],
    relatedLocationPages: [],
    relatedCommodityPages: [],
  }

  const html = renderCommodityPricePageHtml(page, 'https://radongvn.vercel.app')

  assert.match(html, /<title>Gia thanh long hom nay \| NongSanVN<\/title>/)
  assert.match(html, /<meta name="description" content="Bang gia thanh long moi nhat\." \/>/)
  assert.match(html, /<link rel="canonical" href="https:\/\/radongvn\.vercel\.app\/gia-nong-san\/thanh-long" \/>/)
  assert.match(html, /<script type="application\/ld\+json">/)
  assert.match(html, /<h1>Gia thanh long hom nay<\/h1>/)
  assert.doesNotMatch(html, /<div id="root"><\/div>/)
})

test('news article HTML renderer emits SEO metadata, canonical, OG, and Article schema', () => {
  const payload: NewsDetailResponse = {
    article: {
      id: 'blog-1',
      sourceKey: 'nongsanvn_ai',
      canonicalUrl: '/tin-tuc/blog-nong-nghiep-farmer-lua-he-thu',
      slug: 'blog-nong-nghiep-farmer-lua-he-thu',
      title: 'Lich xuong giong lua he thu can luu y gi',
      excerpt: 'Checklist ngan cho nha nong truoc vu lua he thu.',
      contentHtml: '<h2>Viec can lam</h2><p>Can kiem tra lich xuong giong.</p>',
      contentText: 'Can kiem tra lich xuong giong.',
      thumbnailUrl: '/images/commodities/gao-noi-dia/rice-01.jpg',
      author: 'NongSanVN AI',
      category: 'Blog nha nong',
      topicTags: ['blog-nong-nghiep', 'lua'],
      publishedAt: '2026-06-10T02:00:00.000Z',
      fetchedAt: '2026-06-10T02:30:00.000Z',
      contentMode: 'full_html',
      fingerprint: 'hash',
      status: 'published',
      sourceLabel: 'NongSanVN AI',
      contentFamilySlug: 'blog-nong-nghiep',
      contentFamilyLabel: 'Blog nong nghiep',
      familyPath: '/tin-tuc/nhom/blog-nong-nghiep',
    },
    related: [],
    latestFromSource: [],
  }

  const html = renderNewsArticleHtml(payload, 'https://radongvn.vercel.app')

  assert.match(html, /<title>Lich xuong giong lua he thu can luu y gi<\/title>/)
  assert.match(html, /<meta name="description" content="Checklist ngan cho nha nong truoc vu lua he thu\."/)
  assert.match(html, /<link rel="canonical" href="https:\/\/radongvn\.vercel\.app\/tin-tuc\/blog-nong-nghiep-farmer-lua-he-thu">/)
  assert.match(html, /<meta property="og:title" content="Lich xuong giong lua he thu can luu y gi">/)
  assert.match(html, /"@type":"Article"/)
  assert.match(html, /<h1>Lich xuong giong lua he thu can luu y gi<\/h1>/)
  assert.doesNotMatch(html, /<div id="root"><\/div>/)
})

test('VN price history builder preserves legacy response shape from Supabase rows', async () => {
  const source: SourceSnapshot = {
    id: 'nongnghiep',
    label: 'Nong nghiep',
    url: 'https://example.com/source',
    fetchedAt: '2026-06-06T03:00:00.000Z',
    success: true,
    itemCount: 1,
    priority: 100,
    coverage: ['thanh-long'],
  }

  const history = await buildVnPricesHistoryFromSupabaseRows(
    '2026-06-06',
    [
      {
        recorded_at: '2026-06-06T03:00:00.000Z',
        commodity_slug: 'thanh-long',
        province_code: 'BDH',
        variety: null,
        quality_grade: null,
        price_type: 'farm_gate',
        unit: 'VND/kg',
        price_vnd: 18000,
        price_usd: null,
        source: 'nongnghiep',
        raw_payload: {
          commodityName: 'Thanh long',
          category: 'Trai cay',
          region: 'Binh Dinh',
          unit: 'VND/kg',
          change: 500,
          previousPrice: 17500,
        },
      },
    ],
    [source],
  )

  assert.equal(history?.date, '2026-06-06')
  assert.equal(history?.items.length, 1)
  assert.equal(history?.items[0]?.commodity, 'thanh-long')
  assert.equal(history?.items[0]?.price, 18000)
  assert.equal(history?.items[0]?.changePct, 2.86)
  assert.deepEqual(history?.sources, [source])
})
