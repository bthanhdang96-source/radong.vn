import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildExportMonthlyArticleContextFromRows,
  buildExportPeriodArticleContextFromRows,
  buildWorldDailyArticleContextFromRows,
  slugifyAiArticle,
  toAiArticleContentFeedItem,
  type AiArticleSummary,
} from '../services/aiArticles/service.js'

type CustomsRows = Parameters<typeof buildExportPeriodArticleContextFromRows>[0]
type WorldRows = Parameters<typeof buildWorldDailyArticleContextFromRows>[0]

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
})

test('AI article slug is stable ASCII', () => {
  assert.equal(slugifyAiArticle('Báo cáo xuất khẩu nông sản kỳ 1 tháng 5/2026'), 'bao-cao-xuat-khau-nong-san-ky-1-thang-5-2026')
})
