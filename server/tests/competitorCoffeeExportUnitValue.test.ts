import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCompetitorCoffeeBenchmarkRows,
  COMPETITOR_COFFEE_REPORTERS,
  normalizeCompetitorQuantityToTon,
  prepareCompetitorCoffeeExportRows,
  renderCompetitorCoffeeExportUnitValueQcMarkdown,
  verifyCompetitorCoffeeReporterCodes,
  type CompetitorComtradeRawRow,
} from '../services/competitorCoffeeExportUnitValue.js'

const REPORTER_CODES = {
  VNM: 704,
  BRA: 76,
  IDN: 360,
} as const

const REPORTER_COUNTRIES = {
  VNM: 'Vietnam',
  BRA: 'Brazil',
  IDN: 'Indonesia',
} as const

function rawRow(
  overrides: Partial<CompetitorComtradeRawRow> & {
    reporterISO?: keyof typeof REPORTER_CODES
    partnerISO?: string
    partnerDesc?: string
    period?: string
  } = {},
): CompetitorComtradeRawRow {
  const reporterISO = overrides.reporterISO ?? 'VNM'
  return {
    typeCode: 'C',
    freqCode: 'A',
    refPeriodId: overrides.period ?? '2024',
    period: overrides.period ?? '2024',
    reporterCode: REPORTER_CODES[reporterISO],
    reporterISO,
    reporterDesc: REPORTER_COUNTRIES[reporterISO],
    partnerCode: 276,
    partnerISO: overrides.partnerISO ?? 'DEU',
    partnerDesc: overrides.partnerDesc ?? 'Germany',
    partner2Code: 0,
    partner2ISO: 'W00',
    partner2Desc: 'World',
    flowCode: 'X',
    flowDesc: 'Export',
    classificationCode: 'HS',
    cmdCode: '090111',
    cmdDesc: 'Coffee; not roasted or decaffeinated',
    customsCode: 'C00',
    customsDesc: 'TOTAL CPC',
    motCode: 0,
    motDesc: 'TOTAL MOT',
    qtyUnitCode: 8,
    qtyUnitAbbr: 'kg',
    qty: 1000,
    netWgt: 1000,
    grossWgt: null,
    primaryValue: 1000,
    fobvalue: null,
    isOriginalClassification: true,
    isReported: true,
    isAggregate: false,
    ...overrides,
  }
}

function transform(rows: CompetitorComtradeRawRow[]) {
  return prepareCompetitorCoffeeExportRows(rows, {
    periodType: 'A',
    fetchedAt: '2026-05-31T00:00:00.000Z',
    sourceUrl: 'https://comtradeapi.un.org/mock',
    queryParams: { test: true },
  })
}

test('reporter validation fixture verifies Vietnam, Brazil, and Indonesia Comtrade codes', () => {
  const result = verifyCompetitorCoffeeReporterCodes(COMPETITOR_COFFEE_REPORTERS)
  assert.deepEqual(
    result.map(item => ({ iso: item.reporter.iso, code: item.reporter.code, ok: item.ok })),
    [
      { iso: 'VNM', code: 704, ok: true },
      { iso: 'BRA', code: 76, ok: true },
      { iso: 'IDN', code: 360, ok: true },
    ],
  )
})

test('normalizeCompetitorQuantityToTon prioritizes net weight, then qty units', () => {
  assert.deepEqual(normalizeCompetitorQuantityToTon({ netWeightKg: 2500, qty: 1, qtyUnitAbbr: 'ton' }), {
    quantityTon: 2.5,
    quantitySource: 'net_wgt_kg',
  })
  assert.deepEqual(normalizeCompetitorQuantityToTon({ netWeightKg: null, qty: 2500, qtyUnitAbbr: 'kg' }), {
    quantityTon: 2.5,
    quantitySource: 'qty_kg',
  })
  assert.deepEqual(normalizeCompetitorQuantityToTon({ netWeightKg: null, qty: 2.5, qtyUnitAbbr: 'ton' }), {
    quantityTon: 2.5,
    quantitySource: 'qty_ton',
  })
  assert.deepEqual(normalizeCompetitorQuantityToTon({ netWeightKg: null, qty: 2.5, qtyUnitAbbr: 'bag' }), {
    quantityTon: null,
    quantitySource: 'unknown',
  })
})

test('prepareCompetitorCoffeeExportRows uses SUM(value) / SUM(quantity), collapses duplicate grain, and excludes World', () => {
  const result = transform([
    rawRow({ partnerCode: 0, partnerISO: 'W00', partnerDesc: 'World', netWgt: 10_000, primaryValue: 10_000 }),
    rawRow({ partnerISO: 'DEU', partnerDesc: 'Germany', netWgt: 1000, primaryValue: 1000 }),
    rawRow({ partnerISO: 'DEU', partnerDesc: 'Germany', netWgt: 3000, primaryValue: 9000 }),
  ])

  assert.equal(result.aggregatePartnerRowsExcluded, 1)
  assert.equal(result.duplicateRawRowsCollapsed, 1)
  assert.equal(result.duplicateFactRowsCollapsed, 1)
  assert.equal(result.factRows.length, 1)

  const germany = result.factRows[0]
  assert.equal(germany.partner_iso, 'DEU')
  assert.equal(germany.export_value_usd, 10_000)
  assert.equal(germany.export_quantity_ton, 4)
  assert.equal(germany.export_unit_value_usd_per_ton, 2500)
  assert.equal(result.factRows.some(row => row.partner_iso === 'W00'), false)
})

test('prepareCompetitorCoffeeExportRows flags missing, zero, unknown-unit, invalid, and low-volume rows', () => {
  const result = transform([
    rawRow({ partnerISO: 'USA', partnerDesc: 'United States', netWgt: 49_000, primaryValue: 147_000 }),
    rawRow({ partnerISO: 'CAN', partnerDesc: 'Canada', netWgt: 100_000, primaryValue: null }),
    rawRow({ partnerISO: 'KOR', partnerDesc: 'Korea', netWgt: 0, primaryValue: 500 }),
    rawRow({ partnerISO: 'MEX', partnerDesc: 'Mexico', netWgt: 100_000, primaryValue: -5 }),
    rawRow({ partnerISO: 'JPN', partnerDesc: 'Japan', netWgt: null, qty: 10, qtyUnitAbbr: 'bag', primaryValue: 5000 }),
  ])

  assert.equal(result.factRows.find(row => row.partner_iso === 'USA')?.unit_value_flag, 'low_volume_for_competitor_benchmark')
  assert.equal(result.factRows.find(row => row.partner_iso === 'CAN')?.unit_value_flag, 'missing_value')
  assert.equal(result.factRows.find(row => row.partner_iso === 'KOR')?.unit_value_flag, 'zero_quantity')
  assert.equal(result.factRows.find(row => row.partner_iso === 'MEX')?.unit_value_flag, 'invalid_unit_value')
  assert.equal(result.factRows.find(row => row.partner_iso === 'JPN')?.unit_value_flag, 'missing_or_unknown_quantity_unit')
})

test('benchmark rows calculate Vietnam gaps, tracked-reporter shares, and missing competitor quality', () => {
  const result = transform([
    rawRow({ reporterISO: 'VNM', partnerISO: 'DEU', partnerDesc: 'Germany', netWgt: 100_000, primaryValue: 300_000 }),
    rawRow({ reporterISO: 'BRA', partnerISO: 'DEU', partnerDesc: 'Germany', netWgt: 100_000, primaryValue: 250_000 }),
    rawRow({ reporterISO: 'IDN', partnerISO: 'DEU', partnerDesc: 'Germany', netWgt: 100_000, primaryValue: 200_000 }),
    rawRow({ reporterISO: 'VNM', partnerISO: 'USA', partnerDesc: 'United States', netWgt: 100_000, primaryValue: 400_000 }),
  ])
  const benchmarkRows = buildCompetitorCoffeeBenchmarkRows(result.factRows)
  const germany = benchmarkRows.find(row => row.partner_iso === 'DEU')
  const usa = benchmarkRows.find(row => row.partner_iso === 'USA')
  const vnmGermany = result.factRows.find(row => row.reporter_iso === 'VNM' && row.partner_iso === 'DEU')

  assert.equal(germany?.vietnam_vs_brazil_gap_pct, 20)
  assert.equal(germany?.vietnam_vs_indonesia_gap_pct, 50)
  assert.equal(germany?.benchmark_quality_flag, 'ok')
  assert.equal(usa?.benchmark_quality_flag, 'missing_competitors')
  assert.equal(vnmGermany?.tracked_reporter_share_by_value_pct, 40)
  assert.equal(vnmGermany?.rank_by_unit_value_in_partner_market, 1)
})

test('completeness guard suppresses periods that have no Vietnam rows by default', () => {
  const result = transform([
    rawRow({ reporterISO: 'BRA', period: '2024', partnerISO: 'DEU', partnerDesc: 'Germany', netWgt: 100_000, primaryValue: 250_000 }),
    rawRow({ reporterISO: 'IDN', period: '2024', partnerISO: 'DEU', partnerDesc: 'Germany', netWgt: 100_000, primaryValue: 200_000 }),
    rawRow({ reporterISO: 'VNM', period: '2023', partnerISO: 'DEU', partnerDesc: 'Germany', netWgt: 100_000, primaryValue: 300_000 }),
  ])

  assert.deepEqual(result.suppressedIncompletePeriodLabels, ['2024'])
  assert.equal(result.suppressedIncompleteFactRows, 2)
  assert.equal(result.factRows.some(row => row.period_label === '2024'), false)
  assert.equal(result.factRows.some(row => row.period_label === '2023'), true)
})

test('completeness guard can be disabled for source investigation', () => {
  const result = prepareCompetitorCoffeeExportRows(
    [
      rawRow({ reporterISO: 'BRA', period: '2024', partnerISO: 'DEU', partnerDesc: 'Germany', netWgt: 100_000, primaryValue: 250_000 }),
    ],
    {
      periodType: 'A',
      fetchedAt: '2026-05-31T00:00:00.000Z',
      sourceUrl: 'https://comtradeapi.un.org/mock',
      queryParams: { test: true },
      suppressIncompleteBenchmarkPeriods: false,
    },
  )

  assert.deepEqual(result.suppressedIncompletePeriodLabels, [])
  assert.equal(result.suppressedIncompleteFactRows, 0)
  assert.equal(result.factRows.length, 1)
})

test('QC markdown includes duplicate, World partner, outlier, low-volume, coverage, and limitation sections', () => {
  const result = transform([
    rawRow({ partnerCode: 0, partnerISO: 'W00', partnerDesc: 'World', netWgt: 10_000, primaryValue: 10_000 }),
    rawRow({ reporterISO: 'VNM', partnerISO: 'DEU', partnerDesc: 'Germany', netWgt: 40_000, primaryValue: 120_000 }),
    rawRow({ reporterISO: 'BRA', partnerISO: 'DEU', partnerDesc: 'Germany', netWgt: 100_000, primaryValue: 250_000 }),
  ])
  const markdown = renderCompetitorCoffeeExportUnitValueQcMarkdown(result.qc, {
    generatedAt: '2026-05-31T00:00:00.000Z',
  })

  assert.equal(markdown.includes('Duplicate raw grain rows collapsed'), true)
  assert.equal(markdown.includes('World partner fact rows after exclusion: 0'), true)
  assert.equal(markdown.includes('Top 20 Highest Unit Values'), true)
  assert.equal(markdown.includes('Low-Volume Rows'), true)
  assert.equal(markdown.includes('Benchmark Coverage'), true)
  assert.equal(markdown.includes('Completeness Guard'), true)
  assert.equal(markdown.includes('not a transaction price'), true)
  assert.equal(markdown.includes('tracked-reporter shares'), true)
})
