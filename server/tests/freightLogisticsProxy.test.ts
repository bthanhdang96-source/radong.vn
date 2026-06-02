import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FREIGHT_LOGISTICS_SOURCES,
  normalizeFreightValueToUsdPerFeu,
  parseDrewryWciPublicHtml,
  parseLogisticsEventPublicHtml,
  parseScfiPublicHtml,
  prepareFreightLogisticsRows,
  renderFreightLogisticsMethodology,
  renderFreightLogisticsQcMarkdown,
  type FreightLogisticsInputRow,
} from '../services/freightLogisticsProxy.js'

function inputRow(overrides: Partial<FreightLogisticsInputRow> = {}): FreightLogisticsInputRow {
  return {
    observationDate: '2026-05-30',
    indexName: 'Drewry World Container Index Route',
    proxyType: 'route_index',
    routeName: 'Shanghai to Rotterdam',
    originRegion: 'Asia',
    destinationRegion: 'Europe',
    freightValue: 3200,
    currency: 'USD',
    unit: 'USD/FEU',
    relevanceToCoffee: 'high',
    relevanceNotes: 'Asia-Europe proxy relevant to Vietnam coffee exports to Europe.',
    sourceName: 'Drewry World Container Index',
    sourceUrl: 'https://www.drewry.co.uk/wci',
    fetchedAt: null,
    confidenceScore: null,
    notes: 'Route proxy only; not Vietnam-origin quote.',
    rawPayload: { fixture: true },
    fromPublicAdapter: false,
    ...overrides,
  }
}

test('normalizeFreightValueToUsdPerFeu supports USD/FEU, USD/TEU, index points, and missing units', () => {
  assert.deepEqual(normalizeFreightValueToUsdPerFeu(1200, 'USD/FEU'), {
    normalizedValueUsdPerFeu: 1200,
    unit: 'USD/FEU',
    note: null,
  })
  assert.deepEqual(normalizeFreightValueToUsdPerFeu(1200, 'USD/TEU'), {
    normalizedValueUsdPerFeu: 2400,
    unit: 'USD/TEU',
    note: 'TEU-to-FEU conversion is approximate.',
  })
  assert.deepEqual(normalizeFreightValueToUsdPerFeu(1500, 'index_points'), {
    normalizedValueUsdPerFeu: null,
    unit: 'index_points',
    note: null,
  })
  assert.deepEqual(normalizeFreightValueToUsdPerFeu(1500, null), {
    normalizedValueUsdPerFeu: null,
    unit: null,
    note: null,
  })
})

test('prepareFreightLogisticsRows applies QC flags for source, date, unit, relevance, suspicious values, and adapters', () => {
  const prepared = prepareFreightLogisticsRows(
    [
      inputRow({ routeName: 'ok route', sourceUrl: 'https://example.com/ok' }),
      inputRow({ routeName: 'missing source', sourceUrl: null }),
      inputRow({ routeName: 'missing date', observationDate: null, sourceUrl: 'https://example.com/missing-date' }),
      inputRow({ routeName: 'missing unit', unit: null, sourceUrl: 'https://example.com/missing-unit' }),
      inputRow({ routeName: 'unknown unit', unit: 'bag', sourceUrl: 'https://example.com/unknown-unit' }),
      inputRow({ routeName: 'index points', unit: 'index_points', freightValue: 1400, sourceUrl: 'https://example.com/scfi' }),
      inputRow({ routeName: 'low relevance', relevanceToCoffee: 'low', sourceUrl: 'https://example.com/low' }),
      inputRow({ routeName: 'suspicious', freightValue: 50000, sourceUrl: 'https://example.com/high' }),
      inputRow({ routeName: 'adapter row', fromPublicAdapter: true, sourceUrl: 'https://example.com/adapter' }),
    ],
    { fetchedAt: '2026-06-02T00:00:00.000Z' },
  )

  const byRoute = new Map(prepared.factRows.map(row => [row.route_name, row]))
  assert.equal(byRoute.get('ok route')?.data_quality_flag, 'ok')
  assert.equal(byRoute.get('missing source')?.data_quality_flag, 'missing_source_url')
  assert.equal(byRoute.get('missing date')?.data_quality_flag, 'missing_observation_date')
  assert.equal(byRoute.get('missing unit')?.data_quality_flag, 'missing_unit')
  assert.equal(byRoute.get('unknown unit')?.data_quality_flag, 'unknown_unit')
  assert.equal(byRoute.get('index points')?.data_quality_flag, 'index_points_not_usd')
  assert.equal(byRoute.get('low relevance')?.data_quality_flag, 'low_relevance_to_coffee')
  assert.equal(byRoute.get('suspicious')?.data_quality_flag, 'suspicious_value')
  assert.equal(byRoute.get('adapter row')?.data_quality_flag, 'needs_human_review')
})

test('prepareFreightLogisticsRows calculates change metrics only for comparable USD/FEU series', () => {
  const prepared = prepareFreightLogisticsRows(
    [
      inputRow({ observationDate: '2026-05-23', freightValue: 3000 }),
      inputRow({ observationDate: '2026-05-30', freightValue: 3300 }),
      inputRow({
        observationDate: '2026-05-30',
        indexName: 'Shanghai Containerized Freight Index',
        routeName: 'SCFI Composite',
        freightValue: 1500,
        unit: 'index_points',
        sourceName: 'Shanghai Shipping Exchange',
        sourceUrl: 'https://en.sse.net.cn/indices/scfi.jsp',
      }),
    ],
    { fetchedAt: '2026-06-02T00:00:00.000Z' },
  )

  const latestRoute = prepared.factRows.find(row => row.observation_date === '2026-05-30' && row.route_name === 'Shanghai to Rotterdam')
  const scfi = prepared.factRows.find(row => row.route_name === 'SCFI Composite')
  assert.equal(latestRoute?.wow_change_pct, 10)
  assert.equal(scfi?.normalized_value_usd_per_feu, null)
  assert.equal(scfi?.wow_change_pct, null)
})

test('prepareFreightLogisticsRows collapses duplicate fact grain and preserves latest row metadata', () => {
  const prepared = prepareFreightLogisticsRows(
    [
      inputRow({ freightValue: 3200, notes: 'first duplicate' }),
      inputRow({ freightValue: 3300, notes: 'second duplicate' }),
    ],
    { fetchedAt: '2026-06-02T00:00:00.000Z' },
  )

  assert.equal(prepared.factRows.length, 1)
  assert.equal(prepared.duplicateRawRowsCollapsed, 1)
  assert.equal(prepared.factRows[0]?.freight_value, 3300)
  assert.equal(prepared.factRows[0]?.notes, 'second duplicate')
})

test('public source parsers handle Drewry-like HTML, SCFI index points, and text events', () => {
  const drewryHtml = [
    '<html><body>',
    '<p>30 May 2026</p>',
    '<p>World Container Index increased to $2,300 per 40ft container.</p>',
    '<p>Shanghai to Rotterdam $3,200 this week.</p>',
    '</body></html>',
  ].join('')
  const drewryRows = parseDrewryWciPublicHtml(drewryHtml, { fetchedAt: '2026-06-02T00:00:00.000Z' })
  assert.equal(drewryRows.some(row => row.indexName === 'Drewry World Container Index Composite'), true)
  assert.equal(drewryRows.some(row => row.routeName === 'Shanghai to Rotterdam'), true)

  const scfiRows = parseScfiPublicHtml('<p>2026-05-30 SCFI 1450.25 points</p>', {
    fetchedAt: '2026-06-02T00:00:00.000Z',
  })
  assert.equal(scfiRows.length, 1)
  assert.equal(scfiRows[0]?.unit, 'index_points')

  const source = FREIGHT_LOGISTICS_SOURCES.find(item => item.id === 'loadstar_public')!
  const eventRows = parseLogisticsEventPublicHtml('<p>Port congestion affects container shipping to Europe.</p>', source, {
    fetchedAt: '2026-06-02T00:00:00.000Z',
  })
  assert.equal(eventRows.length, 1)
  assert.equal(eventRows[0]?.unit, 'text_event')
  assert.equal(eventRows[0]?.fromPublicAdapter, true)
})

test('QC and methodology markdown include required Step 9 guardrails', () => {
  const prepared = prepareFreightLogisticsRows(
    [
      inputRow(),
      inputRow({
        indexName: 'Shanghai Containerized Freight Index',
        routeName: 'SCFI Composite',
        freightValue: 1500,
        unit: 'index_points',
        sourceName: 'Shanghai Shipping Exchange',
        sourceUrl: 'https://en.sse.net.cn/indices/scfi.jsp',
      }),
      inputRow({
        indexName: 'Public Logistics Event',
        proxyType: 'logistics_event',
        routeName: null,
        freightValue: null,
        unit: 'text_event',
        sourceName: 'The Loadstar',
        sourceUrl: 'https://theloadstar.com/',
        notes: '',
      }),
    ],
    {
      fetchedAt: '2026-06-02T00:00:00.000Z',
      sourceErrors: [
        {
          sourceId: 'freightos_fbx_research',
          sourceName: 'Freightos Baltic Index methodology',
          sourceUrl: 'https://www.freightos.com/data/',
          message: 'Research-only source; numeric ingestion requires public value/API permission.',
        },
      ],
    },
  )

  const qc = renderFreightLogisticsQcMarkdown(prepared.qc, { generatedAt: '2026-06-02T00:00:00.000Z' })
  const methodology = renderFreightLogisticsMethodology()
  assert.equal(qc.includes('TEU/FEU Conversion Check'), true)
  assert.equal(qc.includes('Index Points Not Converted'), true)
  assert.equal(qc.includes('Source Errors'), true)
  assert.equal(qc.includes('Freight proxy is not a Vietnam coffee freight quote'), true)
  assert.equal(methodology.includes('not transaction-level quotes'), true)
  assert.equal(methodology.includes('Do not claim freight caused a mirror gap'), true)
})
