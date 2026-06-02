import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyCoffeeMarketEventSourceHealth,
  COFFEE_MARKET_EVENT_SOURCES,
  isCoffeeMarketEventReviewQueueCandidate,
  parseCoffeeMarketEventRssItems,
  prepareCoffeeMarketEventsRows,
  renderCoffeeMarketEventsMethodology,
  renderCoffeeMarketEventSourceHealthMarkdown,
  renderCoffeeMarketEventSourceResearchMarkdown,
  renderCoffeeMarketEventsQcMarkdown,
  type MarketEventFactRow,
} from '../services/coffeeMarketEvents.js'

type MarketEventInputRow = Parameters<typeof prepareCoffeeMarketEventsRows>[0][number]

function inputRow(overrides: Partial<MarketEventInputRow> = {}): MarketEventInputRow {
  return {
    eventDate: '2026-05-28',
    publishedAt: '2026-05-28T09:00:00.000Z',
    commodityGroup: 'coffee',
    countryOrRegion: 'Vietnam',
    countryIso: 'VNM',
    eventType: 'weather',
    eventTitle: 'Heavy rain in Central Highlands affects coffee drying',
    eventSummary: 'Heavy rain may delay post-harvest drying in some coffee areas.',
    expectedImpactDirection: 'bullish',
    expectedImpactArea: 'supply',
    impactScore: 1,
    timeHorizon: 'short_term',
    confidenceScore: null,
    sourceName: 'MARD',
    sourceUrl: 'https://mard.gov.vn/coffee-rain-update',
    sourceReliabilityScore: 0.92,
    entities: null,
    notes: '',
    rawPayload: { fixture: true },
    fromRawFeed: false,
    ...overrides,
  }
}

test('prepareCoffeeMarketEventsRows applies quality flags for invalid vocab, missing source, stale events, and low reliability', () => {
  const prepared = prepareCoffeeMarketEventsRows(
    [
      inputRow({ eventTitle: 'Valid coffee weather event', sourceUrl: 'https://example.com/valid' }),
      inputRow({
        eventType: 'policy_update',
        eventTitle: 'Invalid event type fixture',
        sourceUrl: 'https://example.com/invalid-type',
      }),
      inputRow({
        sourceUrl: null,
        eventTitle: 'Missing source url fixture',
      }),
      inputRow({
        sourceReliabilityScore: 0.5,
        eventTitle: 'Low reliability source fixture',
        sourceUrl: 'https://example.com/low-reliability',
      }),
      inputRow({
        eventDate: '2025-12-01',
        eventTitle: 'Stale event fixture',
        sourceUrl: 'https://example.com/stale',
      }),
      inputRow({
        expectedImpactDirection: 'unclear',
        expectedImpactArea: 'other',
        impactScore: 0,
        eventTitle: 'Unclear impact fixture',
        sourceUrl: 'https://example.com/unclear',
      }),
      inputRow({
        fromRawFeed: true,
        eventTitle: 'Needs review from raw feed fixture',
        sourceUrl: 'https://example.com/raw-feed',
      }),
    ],
    {
      fetchedAt: '2026-06-01T00:00:00.000Z',
      staleDays: 90,
    },
  )

  const byTitle = new Map(prepared.factRows.map(row => [row.event_title, row]))
  assert.equal(byTitle.get('Valid coffee weather event')?.data_quality_flag, 'ok')
  assert.equal(byTitle.get('Invalid event type fixture')?.data_quality_flag, 'invalid_event_type')
  assert.equal(byTitle.get('Missing source url fixture')?.data_quality_flag, 'missing_source_url')
  assert.equal(byTitle.get('Low reliability source fixture')?.data_quality_flag, 'low_reliability_source')
  assert.equal(byTitle.get('Stale event fixture')?.data_quality_flag, 'stale_event')
  assert.equal(byTitle.get('Unclear impact fixture')?.data_quality_flag, 'unclear_impact')
  assert.equal(byTitle.get('Needs review from raw feed fixture')?.data_quality_flag, 'needs_human_review')
})

test('prepareCoffeeMarketEventsRows flags similar events inside 3-day window as possible duplicates', () => {
  const prepared = prepareCoffeeMarketEventsRows(
    [
      inputRow({
        eventDate: '2026-05-30',
        sourceUrl: 'https://example.com/vnm-rain-1',
        eventTitle: 'Brazil frost concern raises coffee supply risk',
        countryOrRegion: 'Brazil',
        countryIso: 'BRA',
      }),
      inputRow({
        eventDate: '2026-05-29',
        sourceUrl: 'https://example.com/vnm-rain-2',
        eventTitle: 'Brazil frost concern raises coffee supply risk',
        countryOrRegion: 'Brazil',
        countryIso: 'BRA',
      }),
    ],
    {
      fetchedAt: '2026-06-01T00:00:00.000Z',
    },
  )

  const duplicateRows = prepared.factRows.filter(row => row.data_quality_flag === 'possible_duplicate')
  assert.equal(duplicateRows.length, 1)
  assert.ok(duplicateRows[0]?.event_cluster_id)
  assert.ok(duplicateRows[0]?.duplicate_of)
  assert.equal(duplicateRows[0]?.notes.includes('Possible duplicate event cluster'), true)
})

test('renderCoffeeMarketEventsQcMarkdown includes required Step 8 QC sections', () => {
  const prepared = prepareCoffeeMarketEventsRows(
    [
      inputRow({ sourceUrl: 'https://example.com/qc-valid', eventTitle: 'QC valid event' }),
      inputRow({
        sourceUrl: 'https://example.com/qc-unclear',
        eventTitle: 'QC unclear impact',
        expectedImpactDirection: 'unclear',
        impactScore: 0,
      }),
      inputRow({
        sourceUrl: null,
        eventTitle: 'QC missing source',
      }),
    ],
    {
      fetchedAt: '2026-06-01T00:00:00.000Z',
    },
  )

  const markdown = renderCoffeeMarketEventsQcMarkdown(prepared.qc, {
    generatedAt: '2026-06-01T00:00:00.000Z',
  })

  assert.equal(markdown.includes('Count By Event Type'), true)
  assert.equal(markdown.includes('Count By Country Or Region'), true)
  assert.equal(markdown.includes('Count By Impact Direction'), true)
  assert.equal(markdown.includes('Count By Data Quality Flag'), true)
  assert.equal(markdown.includes('Events With Low Reliability'), true)
  assert.equal(markdown.includes('Possible Duplicate Events'), true)
  assert.equal(markdown.includes('Events Usable For Coffee Brief'), true)
  assert.equal(markdown.includes('Events Needing Human Review'), true)
  assert.equal(markdown.includes('Source Health Summary'), true)
  assert.equal(markdown.includes('Official Source Limitations'), true)
})

test('renderCoffeeMarketEventsMethodology includes cautious interpretation notes', () => {
  const markdown = renderCoffeeMarketEventsMethodology()
  assert.equal(markdown.includes('contextual signals, not deterministic forecasts'), true)
  assert.equal(markdown.includes('High-impact claims should prefer reliable sources'), true)
  assert.equal(markdown.includes('Low-reliability or unclear-impact events require human review'), true)
  assert.equal(markdown.includes('Public source adapters ingest only RSS/API-like endpoints'), true)
})

test('parseCoffeeMarketEventRssItems filters coffee items and classifies public feed rows', () => {
  const source = {
    ...COFFEE_MARKET_EVENT_SOURCES.find(item => item.id === 'eurostat_agriculture_rss')!,
    sourceName: 'Fixture Official Feed',
    sourceUrl: 'https://example.com/rss.xml',
  }
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss><channel>',
    '<item>',
    '<title>Brazil coffee drought raises crop concern</title>',
    '<link>https://example.com/brazil-coffee</link>',
    '<pubDate>Mon, 01 Jun 2026 08:00:00 GMT</pubDate>',
    '<description><![CDATA[Dryness in Brazil coffee areas may lower production.]]></description>',
    '</item>',
    '<item>',
    '<title>EU wheat statistics update</title>',
    '<link>https://example.com/wheat</link>',
    '<pubDate>Mon, 01 Jun 2026 09:00:00 GMT</pubDate>',
    '<description>Wheat-only update.</description>',
    '</item>',
    '</channel></rss>',
  ].join('')

  const rows = parseCoffeeMarketEventRssItems(xml, source, {
    fetchedAt: '2026-06-02T00:00:00.000Z',
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.eventTitle, 'Brazil coffee drought raises crop concern')
  assert.equal(rows[0]?.countryIso, 'BRA')
  assert.equal(rows[0]?.eventType, 'weather')
  assert.equal(rows[0]?.expectedImpactDirection, 'bullish')
  assert.equal(rows[0]?.expectedImpactArea, 'supply')
  assert.equal(rows[0]?.fromRawFeed, true)
})

test('source health classifier maps official feed and blocked source states', () => {
  const eurostat = COFFEE_MARKET_EVENT_SOURCES.find(item => item.id === 'eurostat_agriculture_rss')!
  const usda = COFFEE_MARKET_EVENT_SOURCES.find(item => item.id === 'usda_fas_gain_search_api')!
  const ico = COFFEE_MARKET_EVENT_SOURCES.find(item => item.id === 'ico_public_updates')!
  const vietnam = COFFEE_MARKET_EVENT_SOURCES.find(item => item.id === 'vietnam_official_portals')!

  const xml = [
    '<rss><channel>',
    '<item><title>Brazil coffee drought raises crop concern</title><link>https://example.com/coffee</link></item>',
    '<item><title>Wheat report</title><link>https://example.com/wheat</link></item>',
    '</channel></rss>',
  ].join('')

  const available = classifyCoffeeMarketEventSourceHealth({
    source: eurostat,
    probedAt: '2026-06-02T00:00:00.000Z',
    httpStatus: 200,
    contentType: 'application/rss+xml',
    bodyText: xml,
  })
  assert.equal(available.status, 'available')
  assert.equal(available.itemCount, 2)
  assert.equal(available.coffeeHitCount, 1)

  const authGated = classifyCoffeeMarketEventSourceHealth({
    source: usda,
    probedAt: '2026-06-02T00:00:00.000Z',
    httpStatus: null,
    contentType: null,
    bodyText: null,
  })
  assert.equal(authGated.status, 'auth_gated')

  const unsupportedHtml = classifyCoffeeMarketEventSourceHealth({
    source: ico,
    probedAt: '2026-06-02T00:00:00.000Z',
    httpStatus: 200,
    contentType: 'text/html',
    bodyText: '<html><h1>Press Releases</h1></html>',
  })
  assert.equal(unsupportedHtml.status, 'unsupported_html')

  const retired = classifyCoffeeMarketEventSourceHealth({
    source: vietnam,
    probedAt: '2026-06-02T00:00:00.000Z',
    httpStatus: 200,
    contentType: 'text/html',
    bodyText: '<html>IPAD retired - site no longer available to the public</html>',
  })
  assert.equal(retired.status, 'retired')

  const fetchError = classifyCoffeeMarketEventSourceHealth({
    source: eurostat,
    probedAt: '2026-06-02T00:00:00.000Z',
    httpStatus: 500,
    contentType: 'text/plain',
    bodyText: null,
    errorMessage: 'HTTP 500',
  })
  assert.equal(fetchError.status, 'fetch_error')
})

test('review queue predicate includes only review-needed rows and recent adapter candidates', () => {
  const base: MarketEventFactRow = {
    event_date: '2026-06-01',
    published_at: null,
    commodity_group: 'coffee',
    country_or_region: 'Brazil',
    country_iso: 'BRA',
    event_type: 'weather',
    event_title: 'Brazil coffee weather update',
    event_summary: null,
    expected_impact_direction: 'bullish',
    expected_impact_area: 'supply',
    impact_score: 1,
    time_horizon: 'short_term',
    confidence_score: 0.8,
    source_name: 'Fixture',
    source_url: 'https://example.com/ok',
    source_reliability_score: 0.9,
    fetched_at: '2026-06-02T00:00:00.000Z',
    event_cluster_id: null,
    duplicate_of: null,
    data_quality_flag: 'ok',
    entities: {},
    raw_payload: {},
    notes: '',
  }

  assert.equal(isCoffeeMarketEventReviewQueueCandidate(base, { asOfDate: '2026-06-02' }), false)
  assert.equal(isCoffeeMarketEventReviewQueueCandidate({ ...base, data_quality_flag: 'needs_human_review' }, { asOfDate: '2026-06-02' }), true)
  assert.equal(isCoffeeMarketEventReviewQueueCandidate({ ...base, data_quality_flag: 'unclear_impact' }, { asOfDate: '2026-06-02' }), true)
  assert.equal(isCoffeeMarketEventReviewQueueCandidate({ ...base, notes: 'Adapter source=eurostat_agriculture_rss; review required.' }, { asOfDate: '2026-06-02' }), true)
  assert.equal(isCoffeeMarketEventReviewQueueCandidate({ ...base, event_date: '2026-04-01', notes: 'Adapter source=eurostat_agriculture_rss; review required.' }, { asOfDate: '2026-06-02' }), false)
})

test('source research markdown documents disabled official-source limitations and errors', () => {
  const sourceHealth = [
    classifyCoffeeMarketEventSourceHealth({
      source: COFFEE_MARKET_EVENT_SOURCES.find(item => item.id === 'usda_fas_gain_search_api')!,
      probedAt: '2026-06-02T00:00:00.000Z',
      httpStatus: null,
      contentType: null,
      bodyText: null,
    }),
  ]
  const markdown = renderCoffeeMarketEventSourceResearchMarkdown({
    generatedAt: '2026-06-02T00:00:00.000Z',
    fetchedRows: 0,
    errors: [
      {
        sourceId: 'usda_fas_gain_search_api',
        sourceName: 'USDA FAS GAIN public search',
        sourceUrl: 'https://gain.fas.usda.gov/#/search',
        message: 'Source type api_research is probe_only; ingestion requires a stable RSS/XML/JSON endpoint',
      },
    ],
    sourceHealth,
  })

  const healthMarkdown = renderCoffeeMarketEventSourceHealthMarkdown({
    generatedAt: '2026-06-02T00:00:00.000Z',
    sourceHealth,
  })

  assert.equal(markdown.includes('Configured Sources'), true)
  assert.equal(markdown.includes('usda_fas_gain_search_api'), true)
  assert.equal(markdown.includes('mode=probe_only'), true)
  assert.equal(markdown.includes('auth_gated'), true)
  assert.equal(markdown.includes('no generic HTML scraping'), true)
  assert.equal(markdown.includes('Source type api_research is probe_only'), true)
  assert.equal(healthMarkdown.includes('Coffee Market Event Source Health'), true)
  assert.equal(healthMarkdown.includes('auth_gated'), true)
})
