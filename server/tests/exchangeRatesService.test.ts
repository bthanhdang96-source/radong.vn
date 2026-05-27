import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildExchangeRateItems,
  buildObservationRowsFromPayload,
  parseExchangeRateBackfillDaysParam,
  parseExchangeRateCodesParam,
  parseExchangeRateDaysParam,
} from '../services/exchangeRatesService.js'

test('buildObservationRowsFromPayload converts VND-base payload into VND per unit rows', () => {
  const parsed = buildObservationRowsFromPayload({
    requestedDateToken: 'latest',
    payload: {
      date: '2026-05-27',
      vnd: {
        usd: 0.000038,
        eur: 0.000033,
        jpy: 0.00562,
      },
    },
    currencyCatalog: {
      usd: 'us dollar',
      eur: 'euro',
      jpy: 'japanese yen',
    },
    trackedCodes: ['USD', 'EUR', 'JPY', 'AUD'],
    sourceUrl: 'https://latest.currency-api.pages.dev/v1/currencies/vnd.min.json',
    crawledAt: '2026-05-27T03:10:00.000Z',
  })

  assert.equal(parsed.observedOn, '2026-05-27')
  assert.equal(parsed.rows.length, 3)
  assert.deepEqual(parsed.skippedCodes, ['AUD'])

  const usd = parsed.rows.find(row => row.currency_code === 'USD')
  assert.equal(usd?.currency_name, 'Us Dollar')
  assert.equal(usd?.vnd_per_unit, 26315.78947368)
})

test('buildExchangeRateItems computes daily and weekly percent changes', () => {
  const rows = [
    { observed_on: '2026-05-20', currency_code: 'USD', currency_name: 'US Dollar', vnd_per_unit: 26000, source_id: 's', source_url: 'u', source_license_note: 'l', crawl_recorded_at: '2026-05-20T00:00:00.000Z' },
    { observed_on: '2026-05-21', currency_code: 'USD', currency_name: 'US Dollar', vnd_per_unit: 26100, source_id: 's', source_url: 'u', source_license_note: 'l', crawl_recorded_at: '2026-05-21T00:00:00.000Z' },
    { observed_on: '2026-05-22', currency_code: 'USD', currency_name: 'US Dollar', vnd_per_unit: 26200, source_id: 's', source_url: 'u', source_license_note: 'l', crawl_recorded_at: '2026-05-22T00:00:00.000Z' },
    { observed_on: '2026-05-23', currency_code: 'USD', currency_name: 'US Dollar', vnd_per_unit: 26300, source_id: 's', source_url: 'u', source_license_note: 'l', crawl_recorded_at: '2026-05-23T00:00:00.000Z' },
    { observed_on: '2026-05-24', currency_code: 'USD', currency_name: 'US Dollar', vnd_per_unit: 26400, source_id: 's', source_url: 'u', source_license_note: 'l', crawl_recorded_at: '2026-05-24T00:00:00.000Z' },
    { observed_on: '2026-05-25', currency_code: 'USD', currency_name: 'US Dollar', vnd_per_unit: 26500, source_id: 's', source_url: 'u', source_license_note: 'l', crawl_recorded_at: '2026-05-25T00:00:00.000Z' },
    { observed_on: '2026-05-26', currency_code: 'USD', currency_name: 'US Dollar', vnd_per_unit: 26600, source_id: 's', source_url: 'u', source_license_note: 'l', crawl_recorded_at: '2026-05-26T00:00:00.000Z' },
    { observed_on: '2026-05-20', currency_code: 'EUR', currency_name: 'Euro', vnd_per_unit: 29500, source_id: 's', source_url: 'u', source_license_note: 'l', crawl_recorded_at: '2026-05-20T00:00:00.000Z' },
    { observed_on: '2026-05-26', currency_code: 'EUR', currency_name: 'Euro', vnd_per_unit: 29650, source_id: 's', source_url: 'u', source_license_note: 'l', crawl_recorded_at: '2026-05-26T00:00:00.000Z' },
  ]

  const items = buildExchangeRateItems(rows)
  assert.equal(items.length, 2)
  assert.equal(items[0].currencyCode, 'EUR')
  assert.equal(items[1].currencyCode, 'USD')

  const usd = items.find(item => item.currencyCode === 'USD')
  assert.equal(usd?.latestVndPerUnit, 26600)
  assert.equal(usd?.change1dPct, 0.3774)
  assert.equal(usd?.change7dPct, 2.3077)
})

test('parse query helpers clamp and normalize user input', () => {
  assert.deepEqual(parseExchangeRateCodesParam('usd,eur,abc,usd'), ['USD', 'EUR', 'ABC'])
  assert.equal(parseExchangeRateDaysParam('999'), 365)
  assert.equal(parseExchangeRateDaysParam('-5'), 365)
  assert.equal(parseExchangeRateBackfillDaysParam('-5'), 1)
})
