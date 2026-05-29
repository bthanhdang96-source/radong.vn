import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCoffeeExportUnitValueRows,
  renderCoffeeExportUnitValueQcMarkdown,
  type CoffeeExportByMarketFactRow,
} from '../services/coffeeExportUnitValue.js'

function row(overrides: Partial<CoffeeExportByMarketFactRow>): CoffeeExportByMarketFactRow {
  return {
    period_type: 'A',
    period_start: `${overrides.period_label ?? '2023'}-01-01`,
    period_label: overrides.period_label ?? '2023',
    reporter_country: 'Vietnam',
    reporter_iso: 'VNM',
    partner_country: 'Germany',
    partner_iso: 'DEU',
    flow: 'Export',
    commodity_group: 'coffee',
    analysis_bucket: 'coffee_raw_core',
    hs6: '090111',
    hs_description: 'Coffee; not roasted or decaffeinated',
    quantity_ton: 1,
    value_usd: 1_000,
    source_name: 'UN Comtrade',
    source_url: 'https://comtradeapi.un.org/mock',
    fetched_at: '2026-05-30T00:00:00.000Z',
    data_quality_flag: 'ok',
    confidence_score: 0.9,
    notes: 'test row',
    ...overrides,
  }
}

test('buildCoffeeExportUnitValueRows aggregates by SUM(value) / SUM(quantity) and excludes World', () => {
  const result = buildCoffeeExportUnitValueRows([
    row({ partner_country: 'World', partner_iso: 'W00', value_usd: 10_000, quantity_ton: 10 }),
    row({ partner_country: 'Germany', partner_iso: 'DEU', value_usd: 3_000, quantity_ton: 1 }),
    row({ partner_country: 'Germany', partner_iso: 'DEU', value_usd: 3_000, quantity_ton: 2 }),
    row({ partner_country: 'France', partner_iso: 'FRA', value_usd: 4_000, quantity_ton: 2 }),
  ])

  assert.equal(result.rows.length, 2)
  assert.equal(result.qc.aggregatePartnerRowsExcluded, 1)
  assert.equal(result.qc.duplicateInputGrainRows, 1)

  const germany = result.rows.find(item => item.partner_iso === 'DEU')
  assert.equal(germany?.export_value_usd, 6_000)
  assert.equal(germany?.export_quantity_ton, 3)
  assert.equal(germany?.export_unit_value_usd_per_ton, 2_000)
  assert.equal(germany?.unit_value_rank_by_period, 1)
  assert.equal(germany?.value_rank_by_period, 1)
  assert.equal(result.rows.some(item => item.partner_iso === 'W00'), false)
})

test('buildCoffeeExportUnitValueRows flags low-volume and invalid rows', () => {
  const result = buildCoffeeExportUnitValueRows([
    row({ partner_country: 'United States', partner_iso: 'USA', value_usd: 2_400, quantity_ton: 2 }),
    row({ partner_country: 'Canada', partner_iso: 'CAN', value_usd: null, quantity_ton: 12 }),
    row({ partner_country: 'Korea', partner_iso: 'KOR', value_usd: 500, quantity_ton: 0 }),
    row({ partner_country: 'Mexico', partner_iso: 'MEX', value_usd: -5, quantity_ton: 20 }),
  ])

  assert.equal(result.rows.find(item => item.partner_iso === 'USA')?.unit_value_flag, 'low_volume')
  assert.equal(result.rows.find(item => item.partner_iso === 'USA')?.confidence_score, 0.55)
  assert.equal(result.rows.find(item => item.partner_iso === 'CAN')?.unit_value_flag, 'missing_value')
  assert.equal(result.rows.find(item => item.partner_iso === 'CAN')?.confidence_score, 0.4)
  assert.equal(result.rows.find(item => item.partner_iso === 'KOR')?.unit_value_flag, 'zero_quantity')
  assert.equal(result.rows.find(item => item.partner_iso === 'MEX')?.unit_value_flag, 'invalid_unit_value')
})

test('buildCoffeeExportUnitValueRows calculates annual YoY and market shares', () => {
  const result = buildCoffeeExportUnitValueRows([
    row({ period_label: '2022', period_start: '2022-01-01', partner_country: 'United States', partner_iso: 'USA', value_usd: 1_000, quantity_ton: 1 }),
    row({ period_label: '2023', period_start: '2023-01-01', partner_country: 'United States', partner_iso: 'USA', value_usd: 2_400, quantity_ton: 2 }),
    row({ period_label: '2023', period_start: '2023-01-01', partner_country: 'France', partner_iso: 'FRA', value_usd: 3_600, quantity_ton: 3 }),
  ])

  const usa2022 = result.rows.find(item => item.period_label === '2022' && item.partner_iso === 'USA')
  const usa2023 = result.rows.find(item => item.period_label === '2023' && item.partner_iso === 'USA')
  const rows2023 = result.rows.filter(item => item.period_label === '2023')
  const shareTotal = rows2023.reduce((sum, item) => sum + (item.market_share_by_value_pct ?? 0), 0)

  assert.equal(usa2022?.export_value_usd_yoy_pct, null)
  assert.equal(usa2023?.export_value_usd_yoy_pct, 140)
  assert.equal(usa2023?.export_quantity_ton_yoy_pct, 100)
  assert.equal(usa2023?.export_unit_value_yoy_pct, 20)
  assert.equal(Math.round(shareTotal), 100)
})

test('renderCoffeeExportUnitValueQcMarkdown includes required QC sections and disclaimer', () => {
  const result = buildCoffeeExportUnitValueRows([
    row({ partner_country: 'World', partner_iso: 'W00', value_usd: 10_000, quantity_ton: 10 }),
    row({ partner_country: 'Germany', partner_iso: 'DEU', value_usd: 6_000, quantity_ton: 3 }),
    row({ partner_country: 'Germany', partner_iso: 'DEU', value_usd: 6_000, quantity_ton: 3 }),
    row({ partner_country: 'France', partner_iso: 'FRA', value_usd: 4_000, quantity_ton: 2 }),
  ])
  const markdown = renderCoffeeExportUnitValueQcMarkdown(result.qc, { generatedAt: '2026-05-30T00:00:00.000Z' })

  assert.equal(markdown.includes('Duplicate input grain rows: 1'), true)
  assert.equal(markdown.includes('Top 20 Highest Unit Values'), true)
  assert.equal(markdown.includes('Top Markets By Value'), true)
  assert.equal(markdown.includes('Premium Markets With Sufficient Volume'), true)
  assert.equal(markdown.includes('not a transaction, contract, FOB invoice, or exact selling price'), true)
})

