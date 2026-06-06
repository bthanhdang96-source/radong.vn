import assert from 'node:assert/strict'
import test from 'node:test'
import aiArticlesRouter from '../routes/aiArticles.js'
import {
  renderCommodityPricePageHtml,
} from '../services/generatedPricePages/htmlRenderer.js'
import { buildVnPricesHistoryFromSupabaseRows } from '../services/supabaseMarketDataService.js'
import type { SourceSnapshot } from '../services/crawlers/types.js'
import type { GeneratedCommodityPricePageDetail } from '../services/generatedPricePages/types.js'

function routeIndex(path: string, method: string) {
  const stack = (aiArticlesRouter as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>
  }).stack

  return stack.findIndex(layer => layer.route?.path === path && layer.route.methods[method] === true)
}

test('admin AI static routes are registered before slug route', () => {
  const contextIndex = routeIndex('/admin/ai-articles/context', 'get')
  const generateIndex = routeIndex('/admin/ai-articles/generate', 'post')
  const slugIndex = routeIndex('/admin/ai-articles/:slug', 'get')

  assert.notEqual(contextIndex, -1)
  assert.notEqual(generateIndex, -1)
  assert.notEqual(slugIndex, -1)
  assert.ok(contextIndex < slugIndex)
  assert.ok(generateIndex < slugIndex)
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
