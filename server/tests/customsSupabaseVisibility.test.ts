import test from 'node:test'
import assert from 'node:assert/strict'
import { getCustomsReportPeriod, parseCustomsPdfText } from '../services/crawlers/customsCrawler.js'
import {
  aggregateLatestSourceSnapshotsFromRows,
  resolveSourceSnapshotIds,
  selectLatestObservationRows,
  type RawCrawlLogRow,
} from '../services/supabaseMarketDataService.js'
import type { SourceSnapshot } from '../services/crawlers/types.js'

test('resolveSourceSnapshotIds includes customs in the default source snapshot query set', () => {
  const sourceIds = resolveSourceSnapshotIds()

  assert.ok(sourceIds.includes('customs'))
  assert.ok(sourceIds.includes('bhx'))
  assert.ok(sourceIds.includes('coop'))
})

test('selectLatestObservationRows keeps only the newest customs export row per commodity signature', () => {
  const rows = selectLatestObservationRows([
    {
      recorded_at: '2026-05-06T17:19:45.843Z',
      commodity_slug: 'cashew',
      province_code: null,
      variety: null,
      quality_grade: null,
      price_type: 'export',
      price_vnd: 186919.42,
      price_usd: 7.0889,
      source: 'customs',
      raw_payload: {},
    },
    {
      recorded_at: '2026-05-07T12:31:10.043Z',
      commodity_slug: 'cashew',
      province_code: null,
      variety: null,
      quality_grade: null,
      price_type: 'export',
      price_vnd: 187377.54,
      price_usd: 7.1062,
      source: 'customs',
      raw_payload: {},
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.recorded_at, '2026-05-07T12:31:10.043Z')
  assert.equal(rows[0]?.price_vnd, 187377.54)
})

test('customs report period metadata identifies semimonthly aggregate coverage', () => {
  const period = getCustomsReportPeriod({
    code: '2026-t4-k2',
    title: 'Xuat khau hang hoa theo ky 2 thang 4 nam 2026',
    periodNumber: 2,
    reportMonth: 4,
    reportYear: 2026,
  })

  assert.equal(period.type, 'customs_semimonthly')
  assert.equal(period.label, 'Ky 2 thang 4 nam 2026')
  assert.equal(period.startsOn, '2026-04-16')
  assert.equal(period.endsOn, '2026-04-30')
})

test('parseCustomsPdfText parses pdf-parse tabular rows with leading numeric columns', () => {
  const text = `
    CỤC HẢI QUAN
    Kỳ 2 tháng 5 năm 2026
    Lượng\tTrị giá (USD) \tTrị giá (USD)\tLượng
    1.877.394.179\t268.408\t293.197.782\tTấn\t3 \tHạt điều \t41.159
    4.225.736.599\t927.339\t348.413.868\tTấn\t4 \tCà phê \t76.400
    74.667.651\t43.166\t8.777.528\tTấn\t5 \tChè \t4.593
    789.740.528\t121.914\t100.585.711\tTấn\t6 \tHạt tiêu \t14.996
    124.266.836\t52.557\t19.647.072\tTấn\t7 \tQuế và hoa quế \t7.481
    2.009.954.677\t4.275.174\t212.153.683\tTấn\t8 \tGạo \t433.492
    617.954.295\t1.789.214\t42.065.114\tTấn\t9 \tSắn và các sản phẩm từ sắn \t103.841
    760.799.252\t1.443.295\t64.293.783\tTấn\t21 \tPhân bón các loại \t103.045
    994.867.726\t529.055\t93.055.116\tTấn\t24 \tCao su \t45.891
  `

  const parsed = parseCustomsPdfText(text)

  assert.equal(parsed.report.code, '2026-t5-k2')
  assert.equal(parsed.rows.length, 7)
  assert.deepEqual(
    parsed.rows.map(row => row.commoditySlug),
    ['cashew', 'ca-phe-robusta', 'tea-avg', 'ho-tieu', 'rice-5pct', 'cassava', 'rubber-rss3'],
  )
})

test('aggregateLatestSourceSnapshotsFromRows batches latest rows by source', () => {
  function snapshot(id: SourceSnapshot['id'], label: string, itemCount: number): SourceSnapshot {
    return {
      id,
      label,
      url: `https://example.test/${id}`,
      fetchedAt: '2026-06-01T01:00:00.000Z',
      success: true,
      itemCount,
      priority: 80,
      coverage: [label],
    }
  }

  const rows: RawCrawlLogRow[] = [
    {
      source_name: 'bhx',
      source_url: 'https://example.test/bhx-old',
      crawled_at: '2026-05-31T00:00:00.000Z',
      raw_json: { snapshot: snapshot('bhx', 'old', 1) },
    },
    {
      source_name: 'bhx',
      source_url: 'https://example.test/bhx-1',
      crawled_at: '2026-06-01T00:00:00.000Z',
      raw_json: { snapshot: snapshot('bhx', 'fruit', 2) },
    },
    {
      source_name: 'bhx',
      source_url: 'https://example.test/bhx-2',
      crawled_at: '2026-06-01T00:00:00.000Z',
      raw_json: { snapshot: snapshot('bhx', 'vegetable', 3) },
    },
    {
      source_name: 'coop',
      source_url: 'https://example.test/coop',
      crawled_at: '2026-06-01T00:00:00.000Z',
      raw_json: { snapshot: snapshot('coop', 'coop', 4) },
    },
  ]

  const aggregated = aggregateLatestSourceSnapshotsFromRows(['bhx', 'coop'], rows, 'source_name')
  const bySource = new Map(aggregated.map(item => [item.id, item]))

  assert.equal(aggregated.length, 2)
  assert.equal(bySource.get('bhx')?.itemCount, 5)
  assert.deepEqual(bySource.get('bhx')?.coverage.sort(), ['fruit', 'vegetable'])
  assert.equal(bySource.get('coop')?.itemCount, 4)
})
