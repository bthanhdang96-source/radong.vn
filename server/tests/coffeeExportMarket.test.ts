import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCoffeeExportQcReport,
  normalizeQuantityToTon,
  prepareCoffeeExportRows,
  renderCoffeeExportQcMarkdown,
} from '../services/coffeeExportMarket.js'

test('normalizeQuantityToTon prioritizes net weight and supports kg/ton units', () => {
  const fromNet = normalizeQuantityToTon({
    qty: 999,
    qtyUnitAbbr: 'kg',
    netWeightKg: 2_500,
  })
  const fromKg = normalizeQuantityToTon({
    qty: 3_000,
    qtyUnitAbbr: 'kg',
    netWeightKg: null,
  })
  const fromTon = normalizeQuantityToTon({
    qty: 12.5,
    qtyUnitAbbr: 'ton',
    netWeightKg: null,
  })
  const unknown = normalizeQuantityToTon({
    qty: 4,
    qtyUnitAbbr: 'pack',
    netWeightKg: null,
  })

  assert.equal(fromNet.quantityTon, 2.5)
  assert.equal(fromNet.quantitySource, 'net_wgt_kg')
  assert.equal(fromKg.quantityTon, 3)
  assert.equal(fromKg.quantitySource, 'qty_kg')
  assert.equal(fromTon.quantityTon, 12.5)
  assert.equal(fromTon.quantitySource, 'qty_ton')
  assert.equal(unknown.quantityTon, null)
  assert.equal(unknown.quantitySource, 'unknown')
})

test('prepareCoffeeExportRows filters by mot/customs/partner2 and collapses duplicate grains', () => {
  const baseRow = {
    typeCode: 'C',
    freqCode: 'A',
    period: '2023',
    refPeriodId: 20230101,
    reporterCode: 704,
    reporterISO: 'VNM',
    reporterDesc: 'Viet Nam',
    flowCode: 'X',
    flowDesc: 'Export',
    classificationCode: 'H6',
    cmdCode: '090111',
    cmdDesc: 'Coffee; not roasted or decaffeinated',
    customsCode: 'C00',
    customsDesc: 'TOTAL CPC',
    mosCode: '0',
    partner2Code: 0,
    partner2ISO: 'W00',
    partner2Desc: 'World',
    qtyUnitCode: 8,
    qtyUnitAbbr: 'kg',
    grossWgt: 0,
    isOriginalClassification: true,
  }

  const prepared = prepareCoffeeExportRows(
    [
      {
        ...baseRow,
        partnerCode: 0,
        partnerISO: 'W00',
        partnerDesc: 'World',
        motCode: 0,
        motDesc: 'TOTAL MOT',
        qty: 1000,
        netWgt: 1000,
        primaryValue: 2000,
        isAggregate: true,
      },
      {
        ...baseRow,
        partnerCode: 156,
        partnerISO: 'CHN',
        partnerDesc: 'China',
        motCode: 0,
        motDesc: 'TOTAL MOT',
        qty: 2_000,
        netWgt: 2_000,
        primaryValue: 6_000,
        isAggregate: false,
      },
      {
        ...baseRow,
        partnerCode: 156,
        partnerISO: 'CHN',
        partnerDesc: 'China',
        motCode: 2100,
        motDesc: 'SEA',
        qty: 2_000,
        netWgt: 2_000,
        primaryValue: 4_000,
        isAggregate: false,
      },
      {
        ...baseRow,
        partnerCode: 840,
        partnerISO: 'USA',
        partnerDesc: 'United States',
        motCode: 0,
        motDesc: 'TOTAL MOT',
        qty: 0.02,
        netWgt: null,
        qtyUnitAbbr: 'ton',
        primaryValue: 100,
        isAggregate: false,
      },
      {
        ...baseRow,
        partnerCode: 840,
        partnerISO: 'USA',
        partnerDesc: 'United States',
        motCode: 0,
        motDesc: 'TOTAL MOT',
        qty: 0.03,
        netWgt: null,
        qtyUnitAbbr: 'ton',
        primaryValue: 120,
        isAggregate: false,
      },
      {
        ...baseRow,
        partnerCode: 826,
        partnerISO: 'GBR',
        partnerDesc: 'United Kingdom',
        motCode: 0,
        motDesc: 'TOTAL MOT',
        qty: 9,
        netWgt: null,
        qtyUnitAbbr: 'pack',
        primaryValue: 99,
        isAggregate: false,
      },
    ],
    {
      periodType: 'A',
      fetchedAt: '2026-05-27T10:00:00.000Z',
      sourceUrl: 'https://comtradeapi.un.org/public/v1/preview/C/A/HS?mock=1',
      queryParams: { mock: true },
    },
  )

  assert.equal(prepared.rawRowsFetched, 6)
  assert.equal(prepared.rawRowsPrepared, 4)
  assert.equal(prepared.excludedRows, 2)
  assert.equal(prepared.duplicateRowsCollapsed, 1)
  assert.equal(prepared.factRows.length, 4)

  const world = prepared.factRows.find(row => row.partner_iso === 'W00')
  const usa = prepared.factRows.find(row => row.partner_iso === 'USA')
  const gbr = prepared.factRows.find(row => row.partner_iso === 'GBR')

  assert.equal(world?.data_quality_flag, 'aggregate_partner_excluded_or_flagged')
  assert.equal(usa?.quantity_ton, 0.03)
  assert.equal(usa?.data_quality_flag, 'tiny_quantity_unit_price_unstable')
  assert.equal(gbr?.data_quality_flag, 'missing_or_unknown_quantity_unit')
  assert.equal(prepared.unitDistribution.kg, 2)
  assert.equal(prepared.unitDistribution.ton, 2)
  assert.equal(prepared.unitDistribution.pack, 1)
})

test('buildCoffeeExportQcReport summarizes quality counters and markdown output', () => {
  const prepared = prepareCoffeeExportRows(
    [
      {
        typeCode: 'C',
        freqCode: 'A',
        period: '2024',
        refPeriodId: 20240101,
        reporterCode: 704,
        reporterISO: 'VNM',
        reporterDesc: 'Viet Nam',
        flowCode: 'X',
        flowDesc: 'Export',
        partnerCode: 0,
        partnerISO: 'W00',
        partnerDesc: 'World',
        partner2Code: 0,
        classificationCode: 'H6',
        cmdCode: '090111',
        cmdDesc: 'Coffee; not roasted or decaffeinated',
        customsCode: 'C00',
        mosCode: '0',
        motCode: 0,
        qtyUnitAbbr: 'kg',
        qty: 1_000,
        netWgt: 1_000,
        primaryValue: 3_000,
      },
      {
        typeCode: 'C',
        freqCode: 'A',
        period: '2024',
        refPeriodId: 20240101,
        reporterCode: 704,
        reporterISO: 'VNM',
        reporterDesc: 'Viet Nam',
        flowCode: 'X',
        flowDesc: 'Export',
        partnerCode: 124,
        partnerISO: 'CAN',
        partnerDesc: 'Canada',
        partner2Code: 0,
        classificationCode: 'H6',
        cmdCode: '090111',
        cmdDesc: 'Coffee; not roasted or decaffeinated',
        customsCode: 'C00',
        mosCode: '0',
        motCode: 0,
        qtyUnitAbbr: 'kg',
        qty: 100,
        netWgt: 100,
        primaryValue: 5,
      },
    ],
    {
      periodType: 'A',
      fetchedAt: '2026-05-27T10:00:00.000Z',
      sourceUrl: 'https://comtradeapi.un.org/public/v1/preview/C/A/HS?mock=1',
      queryParams: { mock: true },
    },
  )

  const report = buildCoffeeExportQcReport(prepared.factRows)
  const markdown = renderCoffeeExportQcMarkdown(report, {
    generatedAt: '2026-05-27T10:00:00.000Z',
    periodType: 'A',
  })

  assert.equal(report.totalRows, 2)
  assert.equal(report.worldAggregateRows, 1)
  assert.equal(report.suspiciousUnitPriceRows, 1)
  assert.equal(report.duplicateGrainRows, 0)
  assert.equal(report.latestPeriodLabel, '2024')
  assert.equal(markdown.includes('QC Report - Vietnam Coffee Exports by Market'), true)
  assert.equal(markdown.includes('Suspicious QC unit price rows'), true)
})
