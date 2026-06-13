import assert from 'node:assert/strict'
import test from 'node:test'
import {
  __aiArticleTestUtils,
  buildAgriBlogArticleContextsFromInputs,
  buildAgriBlogArticleContextFromNews,
  buildAgriBlogArticleContextFromSeed,
  buildExportMonthlyArticleContextsFromRows,
  buildExportMonthlyArticleContextFromRows,
  buildExportPeriodArticleContextsFromRows,
  buildExportPeriodArticleContextFromRows,
  buildWorldDailyArticleContextsFromRows,
  buildWorldDailyArticleContextFromRows,
  slugifyAiArticle,
  toAiArticleContentFeedItem,
  type AiArticleSummary,
} from '../services/aiArticles/service.js'

type CustomsRows = Parameters<typeof buildExportPeriodArticleContextFromRows>[0]
type WorldRows = Parameters<typeof buildWorldDailyArticleContextFromRows>[0]
type BlogSeedRow = Parameters<typeof buildAgriBlogArticleContextFromSeed>[0]
type BlogNewsRow = Parameters<typeof buildAgriBlogArticleContextFromNews>[1]

function customsRow(overrides: Partial<CustomsRows[number]> = {}): CustomsRows[number] {
  return {
    crawled_at: '2026-05-23T01:00:00.000Z',
    commodity_slug: 'coffee-robusta',
    report_title: 'Customs report',
    report_url: 'https://example.com/customs.pdf',
    unit_value_vnd_per_kg: 102000,
    unit_value_usd_per_kg: 3.95,
    unit_value_usd_per_ton: 3950,
    quantity_ton: 1000,
    value_usd: 3_950_000,
    cumulative_quantity_ton: null,
    cumulative_value_usd: null,
    data_granularity: 'period',
    temporal_coverage: 'report_period',
    period_type: 'customs_semimonthly',
    period_code: '2026-t5-k1',
    period_label: 'Ky 1 thang 5 nam 2026',
    period_year: 2026,
    period_month: 5,
    period_number: 1,
    period_start_date: '2026-05-01',
    period_end_date: '2026-05-15',
    aggregation_method: 'unit_value_from_aggregate_quantity_value',
    geographic_scope: 'national',
    source_detail: 'customs_export_pdf_aggregate',
    raw_payload: {},
    ...overrides,
  }
}

function worldRow(overrides: Partial<WorldRows[number]> = {}): WorldRows[number] {
  return {
    recorded_at: '2026-05-23T01:00:00.000Z',
    observed_on: '2026-05-22',
    crawl_recorded_at: '2026-05-23T01:00:00.000Z',
    commodity_slug: 'coffee-robusta',
    exchange: 'ICO',
    price_usd: 250,
    price_unit: 'usc/lb',
    price_vnd_kg: 142000,
    change_1d: 3,
    change_1d_pct: 1.2,
    change_1w_pct: 2.1,
    data_granularity: 'daily',
    temporal_coverage: 'calendar_day',
    benchmark_type: 'indicator',
    source_id: 'ico_daily',
    source_license_note: 'Public facts only',
    quality_grade: 'Robustas indicator',
    contract_symbol: 'ICO_ROBUSTAS',
    source_observation_label: 'ICO Robustas indicator 2026-05-22',
    source_url: 'https://ico.org/resources/public-market-information/',
    raw_payload: { name: 'Ca phe Robusta', category: 'Ca phe' },
    ...overrides,
  }
}

function blogSeed(overrides: Partial<BlogSeedRow> = {}): BlogSeedRow {
  return {
    id: 'seed-farmer-1',
    topic_key: 'lich-xuong-giong-lua-he-thu',
    audience: 'farmer',
    headline_hint: 'Lich xuong giong lua he thu can luu y gi',
    keyword_main: 'lich xuong giong lua',
    keywords_sub: ['lua he thu', 'quan ly nuoc'],
    style: 'guide',
    priority: 80,
    status: 'pending',
    source_ref: {},
    last_used_at: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function blogNewsRow(overrides: Partial<BlogNewsRow> = {}): BlogNewsRow {
  return {
    id: 'news-1',
    source_key: 'congthuong',
    canonical_url: 'https://example.com/news-1',
    slug: 'xuat-khau-gao-sang-eu',
    title: 'Doanh nghiep xuat khau gao chuan bi tieu chuan moi',
    excerpt: 'Doanh nghiep can theo doi tieu chuan va logistics trong thang 6.',
    content_text: 'Theo co quan chuc nang, doanh nghiep xuat khau gao can cap nhat tieu chuan va ho so truy xuat nguon goc trong nam 2026.',
    category: 'Xuat khau',
    topic_tags: ['gao', 'xuat-khau', 'tieu-chuan'],
    published_at: '2026-06-10T00:00:00.000Z',
    fetched_at: '2026-06-10T01:00:00.000Z',
    ...overrides,
  }
}

test('export period context stays period scoped for one customs period', () => {
  const context = buildExportPeriodArticleContextFromRows([
    customsRow(),
    customsRow({ commodity_slug: 'ho-tieu', value_usd: 2_000_000, quantity_ton: 250, unit_value_usd_per_ton: 8000 }),
  ])

  assert.equal(context?.articleType, 'export_period_report')
  assert.equal(context?.dataGranularity, 'period')
  assert.equal(context?.primaryPeriodCode, '2026-t5-k1')
  assert.equal(context?.period.type, 'customs_semimonthly')
  assert.equal(context?.commodities.length, 2)
})

test('export period contexts cover every eligible customs period and sort newest first', () => {
  const contexts = buildExportPeriodArticleContextsFromRows([
    customsRow({
      period_code: '2026-t4-k2',
      period_label: 'Ky 2 thang 4 nam 2026',
      period_month: 4,
      period_number: 2,
      period_start_date: '2026-04-16',
      period_end_date: '2026-04-30',
    }),
    customsRow(),
    customsRow({ commodity_slug: 'ho-tieu' }),
  ])

  assert.deepEqual(contexts.map(context => context.articleScopeKey), ['2026-t5-k1', '2026-t4-k2'])
  assert.deepEqual(contexts.map(context => context.commodities.length), [2, 1])
})

test('export monthly context requires at least two customs periods', () => {
  const onePeriod = buildExportMonthlyArticleContextFromRows([customsRow()])
  assert.equal(onePeriod, null)

  const monthly = buildExportMonthlyArticleContextFromRows([
    customsRow(),
    customsRow({
      period_code: '2026-t5-k2',
      period_label: 'Ky 2 thang 5 nam 2026',
      period_number: 2,
      period_start_date: '2026-05-16',
      period_end_date: '2026-05-31',
      value_usd: 4_100_000,
      quantity_ton: 1000,
    }),
  ])

  assert.equal(monthly?.articleType, 'export_monthly_report')
  assert.equal(monthly?.dataGranularity, 'monthly')
  assert.equal(monthly?.month.periodCount, 2)
  assert.deepEqual(monthly?.month.periodCodes, ['2026-t5-k1', '2026-t5-k2'])
  assert.equal(monthly?.commodities[0]?.valueUsd, 8_050_000)
})

test('export monthly contexts only include complete months and sort by data date', () => {
  const contexts = buildExportMonthlyArticleContextsFromRows([
    customsRow(),
    customsRow({
      period_code: '2026-t4-k1',
      period_label: 'Ky 1 thang 4 nam 2026',
      period_month: 4,
      period_number: 1,
      period_start_date: '2026-04-01',
      period_end_date: '2026-04-15',
    }),
    customsRow({
      period_code: '2026-t4-k2',
      period_label: 'Ky 2 thang 4 nam 2026',
      period_month: 4,
      period_number: 2,
      period_start_date: '2026-04-16',
      period_end_date: '2026-04-30',
    }),
    customsRow({
      period_code: '2026-t3-k1',
      period_label: 'Ky 1 thang 3 nam 2026',
      period_month: 3,
      period_number: 1,
      period_start_date: '2026-03-01',
      period_end_date: '2026-03-15',
    }),
    customsRow({
      period_code: '2026-t3-k2',
      period_label: 'Ky 2 thang 3 nam 2026',
      period_month: 3,
      period_number: 2,
      period_start_date: '2026-03-16',
      period_end_date: '2026-03-31',
    }),
  ])

  assert.deepEqual(contexts.map(context => context.articleScopeKey), ['2026-04', '2026-03'])
  assert.deepEqual(contexts.map(context => context.primaryObservedOn), ['2026-04-30', '2026-03-31'])
})

test('world daily context only promotes daily rows to daily signals', () => {
  const context = buildWorldDailyArticleContextFromRows([
    worldRow(),
    worldRow({
      commodity_slug: 'rice-5pct',
      exchange: 'Thai Rice Exporters Association',
      price_usd: 446,
      price_unit: 'USD/MT',
      change_1d: null,
      change_1d_pct: null,
      data_granularity: 'as_published',
      benchmark_type: 'spot_export_benchmark',
      source_id: 'thai_rice_exporters',
      source_url: 'https://www.thairiceexporters.or.th/price.htm',
      source_observation_label: 'Thai rice FOB 2026-05-20',
      observed_on: '2026-05-20',
    }),
    worldRow({
      commodity_slug: 'shrimp',
      exchange: 'Legacy fallback',
      price_usd: 8.5,
      price_unit: 'USD/kg',
      change_1d: null,
      change_1d_pct: null,
      data_granularity: 'unknown',
      benchmark_type: 'unknown',
      source_id: 'legacy',
      source_url: null,
      source_observation_label: 'Legacy fallback shrimp',
      observed_on: '2026-05-20',
    }),
  ])

  assert.equal(context?.articleType, 'world_daily_price_update')
  assert.equal(context?.dataGranularity, 'daily')
  assert.deepEqual(context?.dailySignals.map(item => item.commoditySlug), ['coffee-robusta'])
  assert.deepEqual(context?.referenceBenchmarks.map(item => item.commoditySlug), ['rice-5pct'])
})

test('world daily contexts cover each observed day with daily signals and exclude future references', () => {
  const contexts = buildWorldDailyArticleContextsFromRows([
    worldRow({ observed_on: '2026-05-22', commodity_slug: 'coffee-robusta' }),
    worldRow({ observed_on: '2026-05-21', commodity_slug: 'pepper-black', exchange: 'IPC', source_id: 'ipc_daily' }),
    worldRow({
      observed_on: '2026-05-22',
      commodity_slug: 'rice-5pct',
      data_granularity: 'as_published',
      change_1d: null,
      change_1d_pct: null,
      source_id: 'thai_rice_exporters',
    }),
    worldRow({
      observed_on: '2026-05-20',
      commodity_slug: 'rice-25pct',
      data_granularity: 'as_published',
      change_1d: null,
      change_1d_pct: null,
      source_id: 'thai_rice_exporters',
    }),
  ])

  assert.deepEqual(contexts.map(context => context.articleScopeKey), ['2026-05-22', '2026-05-21'])
  assert.deepEqual(contexts[1]?.referenceBenchmarks.map(item => item.commoditySlug), ['rice-25pct'])
})

test('agri blog contexts choose pending seed before news fallback and rotate audiences', () => {
  const contexts = buildAgriBlogArticleContextsFromInputs({
    seeds: [blogSeed()],
    newsRows: [
      blogNewsRow({
        id: 'news-farmer',
        slug: 'khuyen-nong-lua-he-thu',
        title: 'Khuyen nong lua he thu can quan ly nuoc',
        category: 'Khuyen nong',
        topic_tags: ['lua', 'ky-thuat'],
      }),
      blogNewsRow({
        id: 'news-trader',
        slug: 'thi-truong-thu-mua-ca-phe',
        title: 'Thi truong thu mua ca phe co tin hieu moi',
        category: 'Thi truong',
        topic_tags: ['ca-phe', 'thu-mua'],
      }),
      blogNewsRow(),
    ],
    dailyLimit: 3,
  })

  assert.deepEqual(contexts.map(context => context.audience), ['farmer', 'trader', 'exporter'])
  assert.equal(contexts[0]?.sourceMode, 'seed')
  assert.equal(contexts[0]?.seedId, 'seed-farmer-1')
  assert.equal(contexts[1]?.sourceMode, 'news_fallback')
  assert.equal(contexts[2]?.sourceMode, 'news_fallback')
  assert.equal(new Set(contexts.map(context => context.audience)).size, 3)
})

test('agri blog contexts avoid existing article_scope_key duplicates', () => {
  const seed = blogSeed()
  const seedContext = buildAgriBlogArticleContextFromSeed(seed, [blogNewsRow()])
  const contexts = buildAgriBlogArticleContextsFromInputs({
    seeds: [seed],
    newsRows: [blogNewsRow()],
    existingScopeKeys: new Set([seedContext.articleScopeKey]),
    audience: 'farmer',
  })

  assert.equal(contexts.length, 1)
  assert.notEqual(contexts[0]?.articleScopeKey, seedContext.articleScopeKey)
  assert.equal(contexts[0]?.sourceMode, 'news_fallback')
})

test('agri blog prompt stays on blog article type instead of daily price context', () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  const prompt = __aiArticleTestUtils.buildArticlePrompt(context)

  assert.equal(context.articleType, 'agri_blog')
  assert.equal(context.contentFamilySlug, 'blog-nong-nghiep')
  assert.equal('dailySignals' in context, false)
  assert.match(prompt, /blog SEO hang ngay/)
  assert.match(prompt, /khong phai "gia hom nay"/)
})

test('agri blog draft validation warns on raw HTML, short body, and missing attribution', () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  const quality = __aiArticleTestUtils.validateDraft(context, {
    title: 'Cach chuan bi vu lua he thu',
    excerpt: 'Checklist ngan cho nha nong.',
    answerSummary: 'Can kiem tra lich xuong giong, nuoc va sau benh.',
    bodyMarkdown: [
      'Mo bai co so lieu 12% nhung khong co chu thich.',
      '## Viec can lam dau tien',
      '<div>Quan sat dong ruong</div>',
      '## Quan ly nuoc',
      'Giu muc nuoc phu hop.',
      '## Ket luan',
      'Lap checklist truoc khi xuong giong.',
    ].join('\n\n'),
    seo: { title: 'Cach chuan bi vu lua he thu', description: 'Checklist ngan.' },
    topicTags: ['lua'],
    audience: 'farmer',
    style: 'guide',
  })

  assert.equal(quality.valid, false)
  assert.ok(quality.warnings.some(warning => warning.includes('raw HTML')))
  assert.ok(quality.warnings.some(warning => warning.includes('shorter')))
  assert.ok(quality.warnings.some(warning => warning.includes('lacks visible attribution')))
  assert.throws(() => __aiArticleTestUtils.parseAiDraft('{"title":"Thieu body"}'), /missing title, excerpt, or bodyMarkdown/)
})

test('AI article feed item keeps news path and taxonomy metadata', () => {
  const item = toAiArticleContentFeedItem({
    id: 'article-1',
    slug: 'gia-nong-san-the-gioi-2026-05-22',
    path: '/tin-tuc/gia-nong-san-the-gioi-2026-05-22',
    articleType: 'world_daily_price_update',
    title: 'Gia nong san the gioi ngay 22/5',
    excerpt: 'Ca phe va ho tieu co tin hieu moi.',
    thumbnailUrl: null,
    sourceKey: 'nongsanvn_ai',
    sourceLabel: 'NongSanVN AI',
    publishedAt: '2026-05-23T02:00:00.000Z',
    updatedAt: '2026-05-23T02:00:00.000Z',
    sortAt: '2026-05-22T00:00:00.000Z',
    category: 'Gia the gioi',
    topicTags: ['gia-the-gioi'],
    contentFamilySlug: 'gia-nong-san-the-gioi',
    contentFamilyLabel: 'Gia nong san the gioi',
    familyPath: '/tin-tuc/nhom/gia-nong-san-the-gioi',
    badgeLabel: 'Gia the gioi',
    dataGranularity: 'daily',
    primaryPeriodCode: null,
    primaryObservedOn: '2026-05-22',
    status: 'published',
  } satisfies AiArticleSummary)

  assert.equal(item.kind, 'ai_article')
  assert.equal(item.path, '/tin-tuc/gia-nong-san-the-gioi-2026-05-22')
  assert.equal(item.contentFamilySlug, 'gia-nong-san-the-gioi')
  assert.equal(item.familyPath, '/tin-tuc/nhom/gia-nong-san-the-gioi')
  assert.equal(item.sortAt, '2026-05-22T00:00:00.000Z')
})

test('agri blog feed item maps into blog content family', () => {
  const item = toAiArticleContentFeedItem({
    id: 'blog-1',
    slug: 'blog-nong-nghiep-farmer-lich-xuong-giong-lua',
    path: '/tin-tuc/blog-nong-nghiep-farmer-lich-xuong-giong-lua',
    articleType: 'agri_blog',
    title: 'Lich xuong giong lua he thu can luu y gi',
    excerpt: 'Checklist ngan cho nha nong.',
    thumbnailUrl: null,
    sourceKey: 'nongsanvn_ai',
    sourceLabel: 'NongSanVN AI',
    publishedAt: '2026-06-10T02:00:00.000Z',
    updatedAt: '2026-06-10T02:00:00.000Z',
    sortAt: '2026-06-10T00:00:00.000Z',
    category: 'Blog nha nong',
    topicTags: ['blog-nong-nghiep', 'nha-nong'],
    contentFamilySlug: 'blog-nong-nghiep',
    contentFamilyLabel: 'Blog nong nghiep',
    familyPath: '/tin-tuc/nhom/blog-nong-nghiep',
    badgeLabel: 'Blog',
    dataGranularity: 'mixed',
    primaryPeriodCode: null,
    primaryObservedOn: '2026-06-10',
    status: 'published',
  } satisfies AiArticleSummary)

  assert.equal(item.kind, 'ai_article')
  assert.equal(item.articleType, 'agri_blog')
  assert.equal(item.contentFamilySlug, 'blog-nong-nghiep')
  assert.equal(item.familyPath, '/tin-tuc/nhom/blog-nong-nghiep')
})

test('AI article slug is stable ASCII', () => {
  assert.equal(slugifyAiArticle('Báo cáo xuất khẩu nông sản kỳ 1 tháng 5/2026'), 'bao-cao-xuat-khau-nong-san-ky-1-thang-5-2026')
})
