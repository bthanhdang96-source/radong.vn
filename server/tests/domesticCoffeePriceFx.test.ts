import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDomesticCoffeePriceUsdRows,
  getPreferredLatestDomesticCoffeeRows,
  normalizeCrawledDomesticCoffeePrices,
  parseVietcombankUsdVndXml,
  renderDomesticCoffeePriceFxQcMarkdown,
  type RawDomesticCoffeePriceRow,
  type RawFxUsdVndRow,
} from '../services/domesticCoffeePriceFx.js'
import type { CrawlerResult } from '../services/crawlers/types.js'

function priceRow(overrides: Partial<RawDomesticCoffeePriceRow> = {}): RawDomesticCoffeePriceRow {
  return {
    dedupe_key: 'vietnambiz|2026-05-29|DLK|na|domestic_farmgate_or_local',
    source_name: 'vietnambiz',
    source_url: 'https://vietnambiz.vn/mock',
    fetched_at: '2026-05-29T07:00:00.000Z',
    price_date: '2026-05-29',
    commodity_group: 'coffee',
    commodity_slug: 'ca-phe-robusta',
    location_name: 'Đắk Lắk',
    province: 'Dak Lak',
    province_code: 'DLK',
    district: null,
    price_type: 'domestic_farmgate_or_local',
    price_raw: '115000',
    price_value: 115_000,
    currency: 'VND',
    unit: 'kg',
    change_raw: '1000',
    change_value: 1_000,
    confidence_score: 0.74,
    raw_payload: {},
    notes: 'test price',
    ...overrides,
  }
}

function fxRow(overrides: Partial<RawFxUsdVndRow> = {}): RawFxUsdVndRow {
  return {
    source_name: 'Vietcombank',
    source_url: 'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10',
    fetched_at: '2026-05-29T07:00:00.000Z',
    rate_date: '2026-05-29',
    currency_pair: 'USD/VND',
    rate_type: 'transfer_buy',
    rate_value: 26_100,
    raw_payload: {},
    notes: 'test fx',
    ...overrides,
  }
}

test('buildDomesticCoffeePriceUsdRows converts VND/kg to USD/ton with exact-date FX', () => {
  const result = buildDomesticCoffeePriceUsdRows([priceRow()], [fxRow()])
  const row = result.rows[0]

  assert.equal(row.price_vnd_per_ton, 115_000_000)
  assert.equal(row.domestic_price_usd_per_ton, 4406.130268)
  assert.equal(row.usd_vnd_rate, 26_100)
  assert.equal(row.fx_rate_type, 'transfer_buy')
  assert.equal(row.data_quality_flag, 'ok')
})

test('buildDomesticCoffeePriceUsdRows fills previous FX within 3 days and never uses future FX', () => {
  const previous = buildDomesticCoffeePriceUsdRows(
    [priceRow({ price_date: '2026-05-30' })],
    [fxRow({ rate_date: '2026-05-28', rate_value: 26_000 })],
  ).rows[0]
  assert.equal(previous.data_quality_flag, 'fx_filled_previous_available')
  assert.equal(previous.fx_rate_date, '2026-05-28')

  const future = buildDomesticCoffeePriceUsdRows(
    [priceRow({ price_date: '2026-05-30' })],
    [fxRow({ rate_date: '2026-05-31', rate_value: 26_000 })],
  ).rows[0]
  assert.equal(future.data_quality_flag, 'missing_fx_rate')
  assert.equal(future.usd_vnd_rate, null)
})

test('buildDomesticCoffeePriceUsdRows flags missing, invalid, suspicious price and invalid FX', () => {
  const result = buildDomesticCoffeePriceUsdRows(
    [
      priceRow({ province_code: 'DLK', price_value: null }),
      priceRow({ province_code: 'LDO', price_value: -1 }),
      priceRow({ province_code: 'GLA', price_value: 115 }),
      priceRow({ province_code: 'DNO', price_value: 115_000 }),
    ],
    [fxRow({ rate_value: 0 })],
  )

  assert.equal(result.rows.find(row => row.province_code === 'DLK')?.data_quality_flag, 'missing_domestic_price')
  assert.equal(result.rows.find(row => row.province_code === 'LDO')?.data_quality_flag, 'invalid_domestic_price')
  assert.equal(result.rows.find(row => row.province_code === 'GLA')?.data_quality_flag, 'suspicious_price_unit')
  assert.equal(result.rows.find(row => row.province_code === 'DNO')?.data_quality_flag, 'invalid_fx_rate')
})

test('normalizeCrawledDomesticCoffeePrices keeps only Central Highlands coffee provinces', () => {
  const result: CrawlerResult = {
    items: [
      {
        commodity: 'ca-phe-robusta',
        commodityName: 'Ca phe Robusta',
        category: 'Cay cong nghiep',
        region: 'Đắk Lắk',
        price: 89_100,
        unit: 'VND/kg',
        change: 1_000,
        changePct: 1.1,
        timestamp: '2026-05-29T07:00:00.000Z',
        source: 'vietnambiz',
      },
      {
        commodity: 'ca-phe-robusta',
        commodityName: 'Ca phe Robusta',
        category: 'Cay cong nghiep',
        region: 'Dak Nong (Lam Dong Moi)',
        price: 88_000,
        unit: 'VND/kg',
        change: 1_000,
        changePct: 1.1,
        timestamp: '2026-05-29T07:00:00.000Z',
        source: 'vietnambiz',
      },
      {
        commodity: 'ho-tieu',
        commodityName: 'Ho tieu',
        category: 'Cay cong nghiep',
        region: 'Đắk Lắk',
        price: 150_000,
        unit: 'VND/kg',
        change: 1_000,
        changePct: 1.1,
        timestamp: '2026-05-29T07:00:00.000Z',
        source: 'vietnambiz',
      },
    ],
    sources: [
      {
        id: 'vietnambiz',
        label: 'vietnambiz',
        url: 'https://vietnambiz.vn/list',
        fetchedAt: '2026-05-29T07:00:00.000Z',
        success: true,
        itemCount: 1,
        priority: 80,
        coverage: ['ca-phe-robusta'],
        latestArticleUrl: 'https://vietnambiz.vn/article',
      },
    ],
  }

  const rows = normalizeCrawledDomesticCoffeePrices([result], '2026-05-29T07:00:00.000Z')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].province_code, 'DLK')
  assert.equal(rows[1].province_code, 'DNO')
  assert.equal(rows[0].source_url, 'https://vietnambiz.vn/article')
})

test('getPreferredLatestDomesticCoffeeRows ranks preferred sources by province', () => {
  const rows = buildDomesticCoffeePriceUsdRows(
    [
      priceRow({ source_name: 'vietnambiz', province_code: 'DLK', price_value: 88_000 }),
      priceRow({ source_name: 'congthuong', province_code: 'DLK', price_value: 89_000 }),
      priceRow({ source_name: 'nongnghiep', province_code: 'LDO', price_value: 87_000 }),
    ],
    [fxRow()],
  ).rows

  const preferred = getPreferredLatestDomesticCoffeeRows(rows)
  assert.equal(preferred.length, 2)
  assert.equal(preferred.find(row => row.province_code === 'DLK')?.source_name, 'congthuong')
})

test('parseVietcombankUsdVndXml extracts USD cash, transfer, and sell rates', () => {
  const rows = parseVietcombankUsdVndXml(
    `<ExrateList><DateTime>5/30/2026 2:27:20 AM</DateTime><Exrate CurrencyCode="USD" Buy="25,980.00" Transfer="26,100.00" Sell="26,400.00" /></ExrateList>`,
    { fetchedAt: '2026-05-30T00:00:00.000Z', sourceUrl: 'https://example.com/fx.xml' },
  )

  assert.equal(rows.length, 3)
  assert.equal(rows.find(row => row.rate_type === 'cash_buy')?.rate_value, 25_980)
  assert.equal(rows.find(row => row.rate_type === 'transfer_buy')?.rate_value, 26_100)
  assert.equal(rows.find(row => row.rate_type === 'sell')?.rate_value, 26_400)
  assert.equal(rows[0].rate_date, '2026-05-30')
})

test('renderDomesticCoffeePriceFxQcMarkdown includes required QC sections and warning', () => {
  const result = buildDomesticCoffeePriceUsdRows(
    [
      priceRow({ price_date: '2026-05-28', price_value: 100_000 }),
      priceRow({ price_date: '2026-05-29', price_value: 115_000 }),
    ],
    [fxRow({ rate_date: '2026-05-29' }), fxRow({ rate_date: '2026-05-28' })],
  )
  const markdown = renderDomesticCoffeePriceFxQcMarkdown(result.qc, { generatedAt: '2026-05-30T00:00:00.000Z' })

  assert.equal(markdown.includes('Source Coverage'), true)
  assert.equal(markdown.includes('Province Coverage'), true)
  assert.equal(markdown.includes('Suspicious FX Values'), true)
  assert.equal(markdown.includes('Daily Jumps Above 10%'), true)
  assert.equal(markdown.includes('not FOB, CIF, transaction export price, margin, or profit'), true)
})
