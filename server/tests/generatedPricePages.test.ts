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

  assert.match(copy.bodyText, /đổi chiều trong ngắn hạn/i)
  assert.match(copy.title, /Giá Cà phê Robusta Đắk Lắk hôm nay/i)
})

test('buildPageCopy uses phổ quát wording when price is stable', () => {
  const copy = __generatedPricePagesTestUtils.buildPageCopy({
    commoditySlug: 'cam-sanh',
    commodityName: 'Cam sành',
    category: 'Trái cây',
    scope: {
      scopeType: 'province',
      scopeKey: 'VLO',
      provinceCode: 'VLO',
      regionLabel: null,
      locationLabel: 'Vĩnh Long',
      locationSlug: 'vinh-long',
    },
    primaryPriceType: 'wholesale',
    latestDate: '2026-05-16',
    latestPriceVnd: 32000,
    dayChangeVnd: 50,
    dayChangePct: 0.16,
    change7dVnd: 70,
    change7dPct: 0.22,
    minPrice7dVnd: 31500,
    maxPrice7dVnd: 32400,
    observationCount7d: 5,
    vsNationalAvgPct: 0.1,
    trend7dPct: 0.22,
    trend30dPct: 0.8,
    volatilityPct: 0.4,
  })

  assert.doesNotMatch(copy.answerSummary, /đi ngang/i)
  assert.match(copy.answerSummary, /gần như không thay đổi/i)
  assert.match(copy.bodyText, /Khoảng giá 7 ngày gần nhất|nằm trong khoảng/i)
  assert.match(copy.title, /giữ mức ổn định/i)
  assert.match(copy.bodyHtml, /Giá trong 7 ngày gần đây/i)
  assert.match(copy.bodyHtml, /So với mức giá chung/i)
  assert.doesNotMatch(copy.bodyText, /xu hướng 7 ngày|mặt bằng chung|điểm quan sát/i)
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

test('buildCandidatePages normalizes commodity and location labels for public titles', () => {
  const pages = __generatedPricePagesTestUtils.buildCandidatePages(
    {
      latestRows: [
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'cam-sanh',
          province_code: 'VLO',
          price_type: 'wholesale',
          variety: null,
          market_name: null,
          raw_payload: null,
        },
      ],
      observations: [
        {
          recorded_at: '2026-05-16T01:00:00.000Z',
          commodity_slug: 'cam-sanh',
          province_code: 'VLO',
          price_type: 'wholesale',
          price_vnd: 32500,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: null,
        },
        {
          recorded_at: '2026-05-15T01:00:00.000Z',
          commodity_slug: 'cam-sanh',
          province_code: 'VLO',
          price_type: 'wholesale',
          price_vnd: 30000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: null,
        },
        {
          recorded_at: '2026-05-14T01:00:00.000Z',
          commodity_slug: 'cam-sanh',
          province_code: 'VLO',
          price_type: 'wholesale',
          price_vnd: 31000,
          confidence: 0.8,
          variety: null,
          market_name: null,
          raw_payload: null,
        },
      ],
      commodities: [{ slug: 'cam-sanh', name_vi: 'Cam sanh', category: 'Trai cay' }],
      provinces: [{ code: 'VLO', name_vi: 'Vinh Long' }],
      regionalPrices: [],
      trends: [],
    },
    {},
  )

  assert.equal(pages[0]?.commodityName, 'Cam sành')
  assert.equal(pages[0]?.scope.locationLabel, 'Vĩnh Long')
  assert.match(
    __generatedPricePagesTestUtils.getCommodityThumbnailUrl('cam-sanh'),
    /^\/images\/commodities\/cam-sanh\//,
  )
})
