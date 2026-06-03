import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCoffeeMirrorGapRows,
  buildCoffeeMirrorImportQcReport,
  buildMonthlyPeriods,
  COFFEE_MIRROR_IMPORTERS,
  normalizeMirrorImportQuantityToTon,
  prepareCoffeeMirrorImportRows,
  renderCoffeeMirrorImportQcMarkdown,
  resolveDynamicTopExportImportersFromRows,
  resolveMirrorImporters,
  verifyCoffeeMirrorImporterCodes,
  type DynamicExportMarketRow,
  type MirrorComtradeRawRow,
  type MirrorImportUnitValueRow,
} from '../services/coffeeMirrorImportUnitValue.js'

const IMPORTER_CODES = {
  DEU: 276,
  USA: 842,
  ITA: 380,
  JPN: 392,
  KOR: 410,
  BEL: 56,
  ESP: 724,
  NLD: 528,
  FRA: 251,
  GBR: 826,
} as const

const IMPORTER_COUNTRIES = {
  DEU: 'Germany',
  USA: 'United States',
  ITA: 'Italy',
  JPN: 'Japan',
  KOR: 'South Korea',
  BEL: 'Belgium',
  ESP: 'Spain',
  NLD: 'Netherlands',
  FRA: 'France',
  GBR: 'United Kingdom',
} as const

type ImporterIso = keyof typeof IMPORTER_CODES
type ExportMirrorRow = Parameters<typeof buildCoffeeMirrorGapRows>[0][number]

function rawRow(
  overrides: Partial<MirrorComtradeRawRow> & {
    reporterISO?: ImporterIso
    period?: string
  } = {},
): MirrorComtradeRawRow {
  const reporterISO = overrides.reporterISO ?? 'DEU'
  return {
    typeCode: 'C',
    freqCode: 'A',
    refPeriodId: overrides.period ?? '2024',
    period: overrides.period ?? '2024',
    reporterCode: IMPORTER_CODES[reporterISO],
    reporterISO,
    reporterDesc: IMPORTER_COUNTRIES[reporterISO],
    partnerCode: 704,
    partnerISO: 'VNM',
    partnerDesc: 'Viet Nam',
    flowCode: 'M',
    flowDesc: 'Import',
    classificationCode: 'HS',
    cmdCode: '090111',
    cmdDesc: 'Coffee; not roasted or decaffeinated',
    qtyUnitCode: 8,
    qtyUnitAbbr: 'kg',
    qty: 1000,
    netWgt: 1000,
    grossWgt: null,
    primaryValue: 1000,
    isOriginalClassification: true,
    isReported: true,
    isAggregate: false,
    ...overrides,
  }
}

function transform(rows: MirrorComtradeRawRow[]) {
  return prepareCoffeeMirrorImportRows(rows, {
    periodType: 'A',
    fetchedAt: '2026-05-31T00:00:00.000Z',
    sourceUrl: 'https://comtradeapi.un.org/mock',
    queryParams: { test: true },
  })
}

function importFactRow(overrides: Partial<MirrorImportUnitValueRow>): MirrorImportUnitValueRow {
  return {
    period_type: 'A',
    period_start: '2024-01-01',
    period_label: '2024',
    importer_country: 'Germany',
    importer_iso: 'DEU',
    origin_country: 'Vietnam',
    origin_iso: 'VNM',
    flow: 'Import',
    commodity_group: 'coffee',
    analysis_bucket: 'coffee_raw_core',
    hs6: '090111',
    hs_description: 'Coffee; not roasted or decaffeinated',
    import_value_usd: 50_000,
    import_quantity_raw: 20_000,
    import_quantity_unit_raw: 'kg',
    import_net_weight_kg: 20_000,
    import_quantity_ton: 20,
    import_unit_value_usd_per_ton: 2_500,
    source_name: 'UN Comtrade',
    source_url: 'https://comtradeapi.un.org/mock',
    fetched_at: '2026-05-31T00:00:00.000Z',
    data_quality_flag: 'ok',
    unit_value_flag: 'ok',
    confidence_score: 0.82,
    notes: 'test row',
    ...overrides,
  }
}

test('importer validation fixture verifies configured P0/P1 Comtrade reporter codes', () => {
  const result = verifyCoffeeMirrorImporterCodes(COFFEE_MIRROR_IMPORTERS)
  const expected = new Map([
    ['DEU', 276],
    ['USA', 842],
    ['ITA', 380],
    ['JPN', 392],
    ['KOR', 410],
    ['BEL', 56],
    ['ESP', 724],
    ['NLD', 528],
    ['FRA', 251],
    ['GBR', 826],
    ['RUS', 643],
    ['DZA', 12],
    ['PHL', 608],
    ['CHN', 156],
    ['MYS', 458],
    ['THA', 764],
    ['AUS', 36],
    ['TUR', 792],
    ['UKR', 804],
    ['CHE', 757],
  ])
  assert.deepEqual(
    result.map(item => ({ iso: item.importer.iso, code: item.importer.code, ok: item.ok })),
    [...expected.entries()].map(([iso, code]) => ({ iso, code, ok: true })),
  )
})

test('importer tier resolver supports core, extended, all, and custom importers', () => {
  assert.deepEqual(
    resolveMirrorImporters({ importerTier: 'core' }).importers.map(importer => importer.iso),
    ['DEU', 'USA', 'ITA', 'JPN', 'KOR', 'BEL', 'ESP', 'NLD', 'FRA', 'GBR'],
  )
  assert.deepEqual(
    resolveMirrorImporters({ importerTier: 'extended_static' }).importers.map(importer => importer.iso).sort(),
    ['AUS', 'CHE', 'CHN', 'DZA', 'MYS', 'PHL', 'RUS', 'THA', 'TUR', 'UKR'],
  )
  assert.equal(resolveMirrorImporters({ importerTier: 'all' }).importers.length, 20)

  const custom = resolveMirrorImporters({ importers: ['DEU', 'PHL', 'XXX'] })
  assert.deepEqual(
    custom.importers.map(importer => importer.iso),
    ['DEU', 'PHL'],
  )
  assert.deepEqual(custom.skippedUnverifiedImporters, ['XXX'])
})

test('dynamic top exporter resolver uses only verified coffee raw core markets', () => {
  const rows: DynamicExportMarketRow[] = [
    {
      period_type: 'A',
      period_start: '2023-01-01',
      period_label: '2023',
      partner_country: 'Germany',
      partner_iso: 'DEU',
      export_value_usd: 1000,
      export_quantity_ton: 10,
      export_unit_value_usd_per_ton: 100,
      unit_value_flag: 'ok',
      confidence_score: 0.9,
      hs6: '090111',
      flow: 'Export',
      commodity_group: 'coffee',
      analysis_bucket: 'coffee_raw_core',
    },
    {
      period_type: 'A',
      period_start: '2023-01-01',
      period_label: '2023',
      partner_country: 'Unverified Market',
      partner_iso: 'ZZZ',
      export_value_usd: 900,
      export_quantity_ton: 9,
      export_unit_value_usd_per_ton: 100,
      unit_value_flag: 'ok',
      confidence_score: 0.9,
      hs6: '090111',
      flow: 'Export',
      commodity_group: 'coffee',
      analysis_bucket: 'coffee_raw_core',
    },
    {
      period_type: 'A',
      period_start: '2023-01-01',
      period_label: '2023',
      partner_country: 'Processed Coffee Market',
      partner_iso: 'PHL',
      export_value_usd: 2000,
      export_quantity_ton: 10,
      export_unit_value_usd_per_ton: 200,
      unit_value_flag: 'ok',
      confidence_score: 0.9,
      hs6: '210111',
      flow: 'Export',
      commodity_group: 'coffee',
      analysis_bucket: 'coffee_instant',
    },
  ]

  const resolved = resolveDynamicTopExportImportersFromRows(rows, { topN: 5, includeStaticCore: false })
  assert.deepEqual(
    resolved.importers.map(importer => importer.iso),
    ['DEU'],
  )
  assert.deepEqual(resolved.skippedUnverifiedImporters, ['ZZZ'])
})

test('monthly period builder returns latest completed months only', () => {
  assert.deepEqual(buildMonthlyPeriods(3, new Date(Date.UTC(2026, 5, 4))), ['202603', '202604', '202605'])
})

test('normalizeMirrorImportQuantityToTon prioritizes net weight, then qty kg, then qty ton', () => {
  assert.deepEqual(normalizeMirrorImportQuantityToTon({ netWeightKg: 2_500, qty: 1, qtyUnitAbbr: 'ton' }), {
    quantityTon: 2.5,
    quantitySource: 'net_wgt_kg',
  })
  assert.deepEqual(normalizeMirrorImportQuantityToTon({ netWeightKg: null, qty: 2_500, qtyUnitAbbr: 'kg' }), {
    quantityTon: 2.5,
    quantitySource: 'qty_kg',
  })
  assert.deepEqual(normalizeMirrorImportQuantityToTon({ netWeightKg: null, qty: 2.5, qtyUnitAbbr: 'tonne' }), {
    quantityTon: 2.5,
    quantitySource: 'qty_ton',
  })
  assert.deepEqual(normalizeMirrorImportQuantityToTon({ netWeightKg: null, qty: 2.5, qtyUnitAbbr: 'bag' }), {
    quantityTon: null,
    quantitySource: 'unknown',
  })
})

test('prepareCoffeeMirrorImportRows uses SUM/SUM on duplicates and preserves importer/origin metadata', () => {
  const result = transform([
    rawRow({ reporterISO: 'DEU', netWgt: 1_000, qty: 1_000, primaryValue: 1_000 }),
    rawRow({ reporterISO: 'DEU', netWgt: 3_000, qty: 3_000, primaryValue: 9_000 }),
  ])

  assert.equal(result.duplicateRawRowsCollapsed, 1)
  assert.equal(result.factRows.length, 1)

  const germany = result.factRows[0]
  assert.equal(germany.importer_iso, 'DEU')
  assert.equal(germany.origin_iso, 'VNM')
  assert.equal(germany.import_value_usd, 10_000)
  assert.equal(germany.import_quantity_ton, 4)
  assert.equal(germany.import_unit_value_usd_per_ton, 2_500)
  assert.equal(germany.unit_value_flag, 'low_volume')
})

test('prepareCoffeeMirrorImportRows flags missing value, unknown unit, zero quantity, and invalid value', () => {
  const result = transform([
    rawRow({ reporterISO: 'USA', netWgt: 9_000, primaryValue: 27_000 }),
    rawRow({ reporterISO: 'ITA', netWgt: 12_000, primaryValue: null }),
    rawRow({ reporterISO: 'JPN', netWgt: null, qty: 10, qtyUnitAbbr: 'bag', primaryValue: 5_000 }),
    rawRow({ reporterISO: 'KOR', netWgt: 0, primaryValue: 300 }),
    rawRow({ reporterISO: 'BEL', netWgt: 15_000, primaryValue: -5 }),
  ])

  assert.equal(result.factRows.find(row => row.importer_iso === 'USA')?.unit_value_flag, 'low_volume')
  assert.equal(result.factRows.find(row => row.importer_iso === 'ITA')?.unit_value_flag, 'missing_value')
  assert.equal(result.factRows.find(row => row.importer_iso === 'JPN')?.unit_value_flag, 'invalid_value')
  assert.equal(result.factRows.find(row => row.importer_iso === 'KOR')?.unit_value_flag, 'invalid_value')
  assert.equal(result.factRows.find(row => row.importer_iso === 'BEL')?.unit_value_flag, 'invalid_value')
})

test('buildCoffeeMirrorGapRows computes mirror gap and gap quality flags by market', () => {
  const exportRows: ExportMirrorRow[] = [
    {
      period_type: 'A',
      period_start: '2024-01-01',
      period_label: '2024',
      partner_country: 'Germany',
      partner_iso: 'DEU',
      export_value_usd: 40_000,
      export_quantity_ton: 20,
      export_unit_value_usd_per_ton: 2_000,
      unit_value_flag: 'ok',
      confidence_score: 0.9,
      hs6: '090111',
    },
    {
      period_type: 'A',
      period_start: '2024-01-01',
      period_label: '2024',
      partner_country: 'France',
      partner_iso: 'FRA',
      export_value_usd: 20_000,
      export_quantity_ton: 20,
      export_unit_value_usd_per_ton: null,
      unit_value_flag: 'missing_value',
      confidence_score: 0.45,
      hs6: '090111',
    },
    {
      period_type: 'A',
      period_start: '2024-01-01',
      period_label: '2024',
      partner_country: 'United States',
      partner_iso: 'USA',
      export_value_usd: 30_000,
      export_quantity_ton: 20,
      export_unit_value_usd_per_ton: 1_500,
      unit_value_flag: 'ok',
      confidence_score: 0.82,
      hs6: '090111',
    },
    {
      period_type: 'A',
      period_start: '2024-01-01',
      period_label: '2024',
      partner_country: 'Japan',
      partner_iso: 'JPN',
      export_value_usd: 10_000,
      export_quantity_ton: 5,
      export_unit_value_usd_per_ton: 2_000,
      unit_value_flag: 'ok',
      confidence_score: 0.82,
      hs6: '090111',
    },
    {
      period_type: 'A',
      period_start: '2024-01-01',
      period_label: '2024',
      partner_country: 'Belgium',
      partner_iso: 'BEL',
      export_value_usd: 20_000,
      export_quantity_ton: 20,
      export_unit_value_usd_per_ton: 1_000,
      unit_value_flag: 'ok',
      confidence_score: 0.82,
      hs6: '090111',
    },
    {
      period_type: 'A',
      period_start: '2024-01-01',
      period_label: '2024',
      partner_country: 'Spain',
      partner_iso: 'ESP',
      export_value_usd: 40_000,
      export_quantity_ton: 20,
      export_unit_value_usd_per_ton: 2_000,
      unit_value_flag: 'ok',
      confidence_score: 0.82,
      hs6: '090111',
    },
    {
      period_type: 'A',
      period_start: '2024-01-01',
      period_label: '2024',
      partner_country: 'World',
      partner_iso: 'W00',
      export_value_usd: 1_000_000,
      export_quantity_ton: 500,
      export_unit_value_usd_per_ton: 2_000,
      unit_value_flag: 'ok',
      confidence_score: 0.82,
      hs6: '090111',
    },
  ]

  const importRows = [
    importFactRow({ importer_country: 'Germany', importer_iso: 'DEU', import_quantity_ton: 20, import_value_usd: 50_000, import_unit_value_usd_per_ton: 2_500 }),
    importFactRow({ importer_country: 'Japan', importer_iso: 'JPN', import_quantity_ton: 5, import_value_usd: 11_000, import_unit_value_usd_per_ton: 2_200 }),
    importFactRow({ importer_country: 'Belgium', importer_iso: 'BEL', import_quantity_ton: 20, import_value_usd: 34_000, import_unit_value_usd_per_ton: 1_700 }),
    importFactRow({ importer_country: 'Spain', importer_iso: 'ESP', import_quantity_ton: 40, import_value_usd: 84_000, import_unit_value_usd_per_ton: 2_100 }),
  ]

  const gaps = buildCoffeeMirrorGapRows(exportRows, importRows)
  assert.equal(gaps.some(row => row.market_iso === 'W00'), false)

  const germany = gaps.find(row => row.market_iso === 'DEU')
  const france = gaps.find(row => row.market_iso === 'FRA')
  const usa = gaps.find(row => row.market_iso === 'USA')
  const japan = gaps.find(row => row.market_iso === 'JPN')
  const belgium = gaps.find(row => row.market_iso === 'BEL')
  const spain = gaps.find(row => row.market_iso === 'ESP')

  assert.equal(germany?.mirror_gap_pct, 25)
  assert.equal(germany?.mirror_gap_flag, 'ok')
  assert.equal(germany?.confidence_score, 0.82)
  assert.equal(france?.mirror_gap_flag, 'missing_export_unit_value')
  assert.equal(usa?.mirror_gap_flag, 'missing_import_unit_value')
  assert.equal(japan?.mirror_gap_flag, 'low_volume')
  assert.equal(belgium?.mirror_gap_flag, 'large_mirror_gap')
  assert.equal(spain?.mirror_gap_flag, 'large_quantity_gap')
})

test('monthly mirror gap review includes import-only rows without annual fallback', () => {
  const monthlyImportRow = importFactRow({
    period_type: 'M',
    period_start: '2026-05-01',
    period_label: '202605',
    importer_country: 'Germany',
    importer_iso: 'DEU',
    import_quantity_ton: 25,
    import_value_usd: 80_000,
    import_unit_value_usd_per_ton: 3_200,
  })

  assert.equal(buildCoffeeMirrorGapRows([], [monthlyImportRow]).length, 0)

  const reviewRows = buildCoffeeMirrorGapRows([], [monthlyImportRow], { includeImportOnlyRows: true })
  assert.equal(reviewRows.length, 1)
  assert.equal(reviewRows[0].period_type, 'M')
  assert.equal(reviewRows[0].period_label, '202605')
  assert.equal(reviewRows[0].market_iso, 'DEU')
  assert.equal(reviewRows[0].vietnam_export_unit_value_usd_per_ton, null)
  assert.equal(reviewRows[0].partner_import_unit_value_usd_per_ton, 3_200)
  assert.equal(reviewRows[0].mirror_gap_flag, 'missing_export_unit_value')
})

test('QC markdown includes duplicate, coverage, mirror-gap, and interpretation sections', () => {
  const prepared = transform([
    rawRow({ reporterISO: 'DEU', netWgt: 9_000, primaryValue: 20_000 }),
    rawRow({ reporterISO: 'DEU', netWgt: 9_000, primaryValue: 20_000 }),
    rawRow({ reporterISO: 'USA', netWgt: 20_000, primaryValue: 55_000 }),
  ])
  const exportRows: ExportMirrorRow[] = [
    {
      period_type: 'A',
      period_start: '2024-01-01',
      period_label: '2024',
      partner_country: 'Germany',
      partner_iso: 'DEU',
      export_value_usd: 18_000,
      export_quantity_ton: 9,
      export_unit_value_usd_per_ton: 2_000,
      unit_value_flag: 'ok',
      confidence_score: 0.82,
      hs6: '090111',
    },
  ]
  const gaps = buildCoffeeMirrorGapRows(exportRows, prepared.factRows)
  const report = buildCoffeeMirrorImportQcReport({
    prepared,
    mirrorGapRows: gaps,
  })
  const markdown = renderCoffeeMirrorImportQcMarkdown(report, {
    generatedAt: '2026-05-31T00:00:00.000Z',
  })

  assert.equal(markdown.includes('Duplicate raw grain rows collapsed'), true)
  assert.equal(markdown.includes('Mirror Gap Counters'), true)
  assert.equal(markdown.includes('Importer Coverage'), true)
  assert.equal(markdown.includes('Top 20 Highest Import Unit Values'), true)
  assert.equal(markdown.includes('Interpretation Guardrails'), true)
  assert.equal(markdown.includes('not transaction price'), true)
})

test('monthly QC markdown includes review warning, monthly coverage, skipped importers, and portal status', () => {
  const prepared = prepareCoffeeMirrorImportRows(
    [
      rawRow({ reporterISO: 'DEU', period: '202605', freqCode: 'M', refPeriodId: '202605', netWgt: 20_000, primaryValue: 60_000 }),
      rawRow({ reporterISO: 'USA', period: '202605', freqCode: 'M', refPeriodId: '202605', netWgt: 30_000, primaryValue: 120_000 }),
    ],
    {
      periodType: 'M',
      fetchedAt: '2026-06-01T00:00:00.000Z',
      sourceUrl: 'https://comtradeapi.un.org/mock',
      queryParams: { test: true },
    },
  )
  const gaps = buildCoffeeMirrorGapRows([], prepared.factRows, { includeImportOnlyRows: true })
  const importerResolution = resolveMirrorImporters({ periodType: 'M', importers: ['DEU', 'USA', 'XXX'] })
  const report = buildCoffeeMirrorImportQcReport({
    prepared,
    mirrorGapRows: gaps,
    importerResolution,
    monthlyReviewMode: true,
    partnerPortalVerificationStatus: {
      DEU: 'probe_only',
      USA: 'probe_only',
    },
  })
  const markdown = renderCoffeeMirrorImportQcMarkdown(report, {
    generatedAt: '2026-06-01T00:00:00.000Z',
  })

  assert.equal(markdown.includes('Monthly review mode: yes'), true)
  assert.equal(markdown.includes('## Monthly Coverage'), true)
  assert.equal(markdown.includes('202605|DEU'), true)
  assert.equal(markdown.includes('202605|USA'), true)
  assert.equal(markdown.includes('- XXX'), true)
  assert.equal(markdown.includes('DEU: probe_only'), true)
  assert.equal(markdown.includes('must not be mixed with annual export or import rows'), true)
})
