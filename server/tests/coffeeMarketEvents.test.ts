import assert from 'node:assert/strict'
import test from 'node:test'
import {
  prepareCoffeeMarketEventsRows,
  renderCoffeeMarketEventsMethodology,
  renderCoffeeMarketEventsQcMarkdown,
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
})

test('renderCoffeeMarketEventsMethodology includes cautious interpretation notes', () => {
  const markdown = renderCoffeeMarketEventsMethodology()
  assert.equal(markdown.includes('contextual signals, not deterministic forecasts'), true)
  assert.equal(markdown.includes('High-impact claims should prefer reliable sources'), true)
  assert.equal(markdown.includes('Low-reliability or unclear-impact events require human review'), true)
})
