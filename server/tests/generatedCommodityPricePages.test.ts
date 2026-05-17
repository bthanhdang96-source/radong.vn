import test from 'node:test'
import assert from 'node:assert/strict'
import { __generatedCommodityPricePagesTestUtils } from '../services/generatedCommodityPricePages/service.js'
import { __generatedPricePagesTestUtils } from '../services/generatedPricePages/service.js'

test('buildGeneratedCommodityPricePagePath returns commodity route', () => {
  assert.equal(
    __generatedCommodityPricePagesTestUtils.buildGeneratedCommodityPricePagePath('ho-tieu'),
    '/gia-nong-san/ho-tieu',
  )
})

test('buildCommodityCandidatePages publishes regional_table and excludes Viet Nam row from the table', () => {
  const pages = __generatedCommodityPricePagesTestUtils.buildCommodityCandidatePages(
    {
      latestRows: [
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: 'DLK',
          price_type: 'farm_gate',
          variety: null,
          market_name: null,
          raw_payload: null,
        },
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: 'DNO',
          price_type: 'farm_gate',
          variety: null,
          market_name: null,
          raw_payload: null,
        },
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: null,
          price_type: 'farm_gate',
          variety: null,
          market_name: null,
          raw_payload: { region: 'Viet Nam' },
        },
      ],
      observations: [
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: 'DLK',
          price_type: 'farm_gate',
          price_vnd: 150000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: null,
        },
        {
          recorded_at: '2026-05-15T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: 'DLK',
          price_type: 'farm_gate',
          price_vnd: 149000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: null,
        },
        {
          recorded_at: '2026-05-14T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: 'DLK',
          price_type: 'farm_gate',
          price_vnd: 148000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: null,
        },
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: 'DNO',
          price_type: 'farm_gate',
          price_vnd: 147000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: null,
        },
        {
          recorded_at: '2026-05-15T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: 'DNO',
          price_type: 'farm_gate',
          price_vnd: 146000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: null,
        },
        {
          recorded_at: '2026-05-14T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: 'DNO',
          price_type: 'farm_gate',
          price_vnd: 145000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: null,
        },
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: null,
          price_type: 'farm_gate',
          price_vnd: 148500,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: { region: 'Viet Nam' },
        },
        {
          recorded_at: '2026-05-15T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: null,
          price_type: 'farm_gate',
          price_vnd: 148000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: { region: 'Viet Nam' },
        },
        {
          recorded_at: '2026-05-14T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: null,
          price_type: 'farm_gate',
          price_vnd: 147500,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: { region: 'Viet Nam' },
        },
      ],
      commodities: [{ slug: 'ho-tieu', name_vi: 'Hồ tiêu', category: 'Cây công nghiệp' }],
      provinces: [
        { code: 'DLK', name_vi: 'Đắk Lắk' },
        { code: 'DNO', name_vi: 'Đắk Nông' },
      ],
      regionalPrices: [],
      trends: [],
    },
    {},
  )

  assert.equal(pages.length, 1)
  assert.equal(pages[0]?.renderMode, 'regional_table')
  assert.equal(pages[0]?.locationCount, 2)
  assert.deepEqual(
    pages[0]?.regionRows.map(row => row.locationLabel),
    ['Đắk Lắk', 'Đắk Nông'],
  )
})

test('buildCommodityCandidatePages publishes national_article when only Viet Nam scope is valid', () => {
  const pages = __generatedCommodityPricePagesTestUtils.buildCommodityCandidatePages(
    {
      latestRows: [
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'ca-cao',
          province_code: null,
          price_type: 'wholesale',
          variety: null,
          market_name: null,
          raw_payload: { region: 'Viet Nam' },
        },
      ],
      observations: [
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'ca-cao',
          province_code: null,
          price_type: 'wholesale',
          price_vnd: 72000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: { region: 'Viet Nam' },
        },
        {
          recorded_at: '2026-05-15T01:00:00.000Z',
          commodity_slug: 'ca-cao',
          province_code: null,
          price_type: 'wholesale',
          price_vnd: 71000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: { region: 'Viet Nam' },
        },
        {
          recorded_at: '2026-05-14T01:00:00.000Z',
          commodity_slug: 'ca-cao',
          province_code: null,
          price_type: 'wholesale',
          price_vnd: 70500,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: { region: 'Viet Nam' },
        },
      ],
      commodities: [{ slug: 'ca-cao', name_vi: 'Ca cao', category: 'Cây công nghiệp' }],
      provinces: [],
      regionalPrices: [],
      trends: [],
    },
    {},
  )

  assert.equal(pages.length, 1)
  assert.equal(pages[0]?.renderMode, 'national_article')
  assert.equal(pages[0]?.locationCount, 1)
  assert.equal(pages[0]?.nationalScopeLabel, 'Việt Nam')
  assert.deepEqual(pages[0]?.regionRows, [])
})

test('commodity page copy avoids finance-heavy stable wording', () => {
  const regionalCopy = __generatedCommodityPricePagesTestUtils.buildRegionalTableCopy(
    {
      commoditySlug: 'ho-tieu',
      commodityName: 'Hồ tiêu',
      category: 'Cây công nghiệp',
      primaryPriceType: 'farm_gate',
      renderMode: 'regional_table',
      headlineLatestPriceVnd: 148500,
      headlineLatestPriceUnit: 'VND/kg',
      dayChangeVnd: 100,
      dayChangePct: 0.07,
      change7dVnd: 80,
      change7dPct: 0.05,
      lowestPriceVnd: 147000,
      highestPriceVnd: 150000,
      priceSpreadVnd: 3000,
      locationCount: 2,
      provinceCount: 2,
      regionLabelCount: 0,
      latestDate: '2026-05-16',
      nationalScopeLabel: null,
      regionRows: [],
      metricsJson: {
        topLocationLabel: 'Đắk Lắk',
        bottomLocationLabel: 'Đắk Nông',
      },
    },
    'Hồ tiêu',
  )
  const nationalCopy = __generatedCommodityPricePagesTestUtils.buildNationalArticleCopy(
    {
      commoditySlug: 'cocoa',
      commodityName: 'Ca cao',
      category: 'Cây công nghiệp',
      primaryPriceType: 'wholesale',
      renderMode: 'national_article',
      headlineLatestPriceVnd: 72000,
      headlineLatestPriceUnit: 'VND/kg',
      dayChangeVnd: 50,
      dayChangePct: 0.07,
      change7dVnd: 90,
      change7dPct: 0.12,
      lowestPriceVnd: 71000,
      highestPriceVnd: 72500,
      priceSpreadVnd: 1500,
      locationCount: 1,
      provinceCount: 0,
      regionLabelCount: 1,
      latestDate: '2026-05-16',
      nationalScopeLabel: 'Việt Nam',
      regionRows: [],
      metricsJson: {},
    },
    'Ca cao',
  )

  assert.doesNotMatch(regionalCopy.answerSummary, /đi ngang/i)
  assert.match(regionalCopy.bodyHtml, /ít thay đổi so với hôm qua/i)
  assert.match(regionalCopy.bodyHtml, /giữ mức giá cao/i)
  assert.doesNotMatch(nationalCopy.answerSummary, /đi ngang/i)
  assert.match(nationalCopy.bodyHtml, /ít thay đổi so với hôm qua/i)
  assert.match(nationalCopy.bodyHtml, /Khoảng giá ghi nhận/i)
})

test('location price pages do not publish a Viet Nam region_label route anymore', () => {
  const pages = __generatedPricePagesTestUtils.buildCandidatePages(
    {
      latestRows: [
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: null,
          price_type: 'farm_gate',
          variety: null,
          market_name: null,
          raw_payload: { region: 'Viet Nam' },
        },
      ],
      observations: [
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: null,
          price_type: 'farm_gate',
          price_vnd: 148500,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: { region: 'Viet Nam' },
        },
        {
          recorded_at: '2026-05-15T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: null,
          price_type: 'farm_gate',
          price_vnd: 148000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: { region: 'Viet Nam' },
        },
        {
          recorded_at: '2026-05-14T01:00:00.000Z',
          commodity_slug: 'ho-tieu',
          province_code: null,
          price_type: 'farm_gate',
          price_vnd: 147500,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: { region: 'Viet Nam' },
        },
      ],
      commodities: [{ slug: 'ho-tieu', name_vi: 'Hồ tiêu', category: 'Cây công nghiệp' }],
      provinces: [],
      regionalPrices: [],
      trends: [],
    },
    {},
  )

  assert.equal(pages.length, 0)
})
