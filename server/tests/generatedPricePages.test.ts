import test from 'node:test'
import assert from 'node:assert/strict'
import {
  __generatedPricePagesTestUtils,
  buildGeneratedPricePagePath,
} from '../services/generatedPricePages/service.js'

test('buildGeneratedPricePagePath returns commodity-by-location route', () => {
  assert.equal(buildGeneratedPricePagePath('ca-phe-robusta', 'dak-lak'), '/gia-nong-san/ca-phe-robusta/dak-lak')
})

test('deriveScope prefers province code and falls back to normalized region label', () => {
  const provinceLookup = new Map([
    ['DLK', 'Đắk Lắk'],
  ])

  const provinceScope = __generatedPricePagesTestUtils.deriveScope(
    {
      province_code: 'DLK',
      variety: null,
      market_name: null,
      raw_payload: null,
    },
    provinceLookup,
  )
  const regionScope = __generatedPricePagesTestUtils.deriveScope(
    {
      province_code: null,
      variety: null,
      market_name: null,
      raw_payload: { region: 'Lua tuoi OM 18' },
    },
    provinceLookup,
  )

  assert.equal(provinceScope?.scopeType, 'province')
  assert.equal(provinceScope?.locationLabel, 'Đắk Lắk')
  assert.equal(regionScope?.scopeType, 'region_label')
  assert.equal(regionScope?.locationSlug, 'lua-tuoi-om-18')
})

test('buildPageCopy includes reversal note when daily and 7d movement diverge', () => {
  const copy = __generatedPricePagesTestUtils.buildPageCopy({
    commoditySlug: 'ca-phe-robusta',
    commodityName: 'Cà phê Robusta',
    category: 'Cây công nghiệp',
    scope: {
      scopeType: 'province',
      scopeKey: 'DLK',
      provinceCode: 'DLK',
      regionLabel: null,
      locationLabel: 'Đắk Lắk',
      locationSlug: 'dak-lak',
    },
    primaryPriceType: 'wholesale',
    latestDate: '2026-05-16',
    latestPriceVnd: 120000,
    dayChangeVnd: 1500,
    dayChangePct: 1.27,
    change7dVnd: -2200,
    change7dPct: -1.81,
    minPrice7dVnd: 116000,
    maxPrice7dVnd: 123000,
    observationCount7d: 5,
    vsNationalAvgPct: 3.2,
    trend7dPct: -1.81,
    trend30dPct: 4.25,
    volatilityPct: 2.11,
  })

  assert.match(copy.bodyText, /đảo chiều ngắn hạn/i)
  assert.match(copy.title, /Giá Cà phê Robusta Đắk Lắk hôm nay/i)
})

test('buildCandidatePages requires latest day, yesterday, and at least three observations', () => {
  const pages = __generatedPricePagesTestUtils.buildCandidatePages(
    {
      latestRows: [
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'ca-phe-robusta',
          province_code: 'DLK',
          price_type: 'wholesale',
          variety: null,
          market_name: null,
          raw_payload: null,
        },
      ],
      observations: [
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'ca-phe-robusta',
          province_code: 'DLK',
          price_type: 'wholesale',
          price_vnd: 120000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: null,
        },
        {
          recorded_at: '2026-05-15T01:00:00.000Z',
          commodity_slug: 'ca-phe-robusta',
          province_code: 'DLK',
          price_type: 'wholesale',
          price_vnd: 118000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: null,
        },
        {
          recorded_at: '2026-05-14T01:00:00.000Z',
          commodity_slug: 'ca-phe-robusta',
          province_code: 'DLK',
          price_type: 'wholesale',
          price_vnd: 119000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: null,
        },
      ],
      commodities: [{ slug: 'ca-phe-robusta', name_vi: 'Cà phê Robusta', category: 'Cây công nghiệp' }],
      provinces: [{ code: 'DLK', name_vi: 'Đắk Lắk' }],
      regionalPrices: [
        {
          commodity_slug: 'ca-phe-robusta',
          price_type: 'wholesale',
          province_code: 'DLK',
          vs_national_avg_pct: 2.5,
        },
      ],
      trends: [],
    },
    {},
  )

  assert.equal(pages.length, 1)
  assert.equal(pages[0]?.primaryPriceType, 'wholesale')
  assert.equal(pages[0]?.dayChangeVnd, 2000)
})
