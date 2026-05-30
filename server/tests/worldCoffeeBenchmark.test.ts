import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import {
  buildWorldCoffeeBenchmarkRows,
  normalizeToUsdPerTon,
  parseWorldBankCoffeeBenchmarkWorkbook,
  renderWorldCoffeeBenchmarkQcMarkdown,
  type RawWorldCoffeeBenchmarkRow,
} from '../services/worldCoffeeBenchmark.js'
import { parseIcoCoffeeDailyPrices } from '../services/worldPriceProviders.js'

function rawRow(overrides: Partial<RawWorldCoffeeBenchmarkRow> = {}): RawWorldCoffeeBenchmarkRow {
  return {
    price_date: '2026-05-29',
    commodity_group: 'coffee',
    benchmark_name: 'ICO Robustas Indicator',
    benchmark_type: 'indicator_price',
    contract_code: 'ICO_ROBUSTAS',
    contract_month: null,
    price_value: 167.55,
    currency: 'USD',
    unit: 'usc/lb',
    source_name: 'ICO Public Market Information',
    source_url: 'https://ico.org/resources/public-market-information/',
    fetched_at: '2026-05-30T00:00:00.000Z',
    source_confidence_score: 0.8,
    notes: 'test row',
    raw_payload: {},
    ...overrides,
  }
}

test('normalizeToUsdPerTon converts supported benchmark units', () => {
  assert.deepEqual(normalizeToUsdPerTon(3300, 'USD', 'USD/ton'), { priceUsdPerTon: 3300, flag: 'ok' })
  assert.deepEqual(normalizeToUsdPerTon(4.2, 'USD', 'USD/kg'), { priceUsdPerTon: 4200, flag: 'ok' })
  assert.deepEqual(normalizeToUsdPerTon(1.5, 'USD', 'USD/lb'), { priceUsdPerTon: 3306.93, flag: 'ok' })
  assert.deepEqual(normalizeToUsdPerTon(167.55, 'USD', 'usc/lb'), { priceUsdPerTon: 3693.84081, flag: 'ok' })
})

test('normalizeToUsdPerTon flags missing fields, unsupported units, and missing FX', () => {
  assert.equal(normalizeToUsdPerTon(null, 'USD', 'USD/kg').flag, 'missing_price')
  assert.equal(normalizeToUsdPerTon(4, null, 'USD/kg').flag, 'missing_currency')
  assert.equal(normalizeToUsdPerTon(4, 'USD', null).flag, 'missing_unit')
  assert.equal(normalizeToUsdPerTon(4, 'USD', 'bag').flag, 'unsupported_unit')
  assert.equal(normalizeToUsdPerTon(4, 'VND', 'kg').flag, 'missing_fx_conversion')
})

test('buildWorldCoffeeBenchmarkRows applies suspicious flags and confidence cap', () => {
  const result = buildWorldCoffeeBenchmarkRows([
    rawRow(),
    rawRow({ benchmark_name: 'Low', price_value: 0.01, unit: 'USD/kg' }),
    rawRow({ benchmark_name: 'High', price_value: 20, unit: 'USD/kg' }),
    rawRow({ benchmark_name: 'Bad Unit', unit: 'bag', source_confidence_score: 0.9 }),
  ])

  assert.equal(result.rows.find(row => row.benchmark_name === 'ICO Robustas Indicator')?.data_quality_flag, 'ok')
  assert.equal(result.rows.find(row => row.benchmark_name === 'Low')?.data_quality_flag, 'suspicious_price_low')
  assert.equal(result.rows.find(row => row.benchmark_name === 'High')?.data_quality_flag, 'suspicious_price_high')
  const badUnit = result.rows.find(row => row.benchmark_name === 'Bad Unit')
  assert.equal(badUnit?.data_quality_flag, 'unsupported_unit')
  assert.equal(badUnit?.confidence_score, 0.55)
})

test('ICO parser can provide Robustas daily source row input', () => {
  const html = `
    {"html":"<p><span> Robustas</span><span>167.55</span><span>1.56%</span></p>"}
    Served from: ico.org @ 2026-05-29 22:16:18
  `

  const items = parseIcoCoffeeDailyPrices(html, '2026-05-30T00:00:00.000Z')
  const robusta = items.find(item => item.id === 'coffee-robusta')

  assert.equal(robusta?.observedOn, '2026-05-29')
  assert.equal(robusta?.unit, 'usc/lb')
  assert.equal(robusta?.priceCurrent, 167.55)
})

test('parseWorldBankCoffeeBenchmarkWorkbook extracts monthly Robusta and Arabica rows', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Monthly Prices')
  sheet.getCell('A5').value = 'Date'
  sheet.getCell('B5').value = 'Coffee, Robusta'
  sheet.getCell('C5').value = 'Coffee, Arabica'
  sheet.getCell('A7').value = '2026M04'
  sheet.getCell('B7').value = 4.2
  sheet.getCell('C7').value = 6.1
  const buffer = await workbook.xlsx.writeBuffer()

  const rows = await parseWorldBankCoffeeBenchmarkWorkbook(buffer, {
    fetchedAt: '2026-05-30T00:00:00.000Z',
    sourceUrl: 'https://example.com/pink-sheet.xlsx',
  })

  assert.equal(rows.length, 2)
  const robusta = rows.find(row => row.benchmark_name === 'World Bank Coffee Robusta')
  assert.equal(robusta?.price_date, '2026-04-30')
  assert.equal(robusta?.price_value, 4.2)
  assert.equal(robusta?.unit, 'USD/kg')
  assert.equal(robusta?.benchmark_type, 'monthly_commodity_price')
})

test('QC report includes required sections and licensing warning', () => {
  const result = buildWorldCoffeeBenchmarkRows([rawRow(), rawRow({ benchmark_name: 'Bad Unit', unit: 'bag' })])
  const markdown = renderWorldCoffeeBenchmarkQcMarkdown(result.qc, { generatedAt: '2026-05-30T00:00:00.000Z' })

  assert.equal(markdown.includes('Source Coverage'), true)
  assert.equal(markdown.includes('Data Quality Flags'), true)
  assert.equal(markdown.includes('Top 20 Highest USD/Ton Rows'), true)
  assert.equal(markdown.includes('Needs licensing review'), true)
  assert.equal(markdown.includes('directional only'), true)
})
