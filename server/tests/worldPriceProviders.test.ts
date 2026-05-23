import test from 'node:test'
import assert from 'node:assert/strict'
import {
  markPinkSheetMonthlyItems,
  parseAnrpcRubberDailyPrices,
  parseIcoCoffeeDailyPrices,
  parseIpcPepperDailyPrices,
  parseThaiRiceExportPrices,
  selectPreferredWorldPriceItems,
} from '../services/worldPriceProviders.js'

test('ICO parser marks coffee indicators as true daily observations', () => {
  const html = `
    <script>
      {"html":"<p><span> Robustas</span><span>166.40</span><span>2.22%</span></p>"}
      {"html":"<p><span> Brazilian Naturals</span><span>285.68</span><span>1.85%</span></p>"}
    </script>
    Served from: ico.org @ 2026-05-22 18:12:06
  `

  const items = parseIcoCoffeeDailyPrices(html, '2026-05-23T01:00:00.000Z')

  const robusta = items.find(item => item.id === 'coffee-robusta')
  assert.equal(robusta?.dataGranularity, 'daily')
  assert.equal(robusta?.temporalCoverage, 'calendar_day')
  assert.equal(robusta?.sourceId, 'ico_daily')
  assert.equal(robusta?.observedOn, '2026-05-22')
  assert.equal(robusta?.priceCurrent, 166.4)
  assert.equal(robusta?.changePct, 2.22)
})

test('IPC parser extracts Viet Nam black pepper without copying narrative text', () => {
  const html = `
    <h2>DAILY PRICES 13-06-2025</h2>
    <table>
      <tr><td>Viet Nam - Black Pepper 500 g/l</td><td>6,300</td><td>-</td><td>0.00%</td></tr>
    </table>
  `

  const [item] = parseIpcPepperDailyPrices(html, '2026-05-23T01:00:00.000Z')

  assert.equal(item.id, 'pepper-black')
  assert.equal(item.observedOn, '2025-06-13')
  assert.equal(item.dataGranularity, 'daily')
  assert.equal(item.priceCurrent, 6300)
  assert.equal(item.unit, 'USD/MT')
  assert.equal(item.sourceLicenseNote.includes('narrative'), true)
})

test('ANRPC parser extracts SICOM TSR20 settlement as daily futures benchmark', () => {
  const html = `
    <script id="wix-warmup-data">
      {"date1":"18/05/2026","date2":"19/05/2026","title_fld":"Futures Market "}
      {"date1":"2.21\\n","date2":"2.22\\n","title_fld":"SICOM (TSR20)"}
    </script>
  `

  const [item] = parseAnrpcRubberDailyPrices(html, '2026-05-23T01:00:00.000Z')

  assert.equal(item.id, 'rubber-tsr20')
  assert.equal(item.observedOn, '2026-05-19')
  assert.equal(item.dataGranularity, 'daily')
  assert.equal(item.temporalCoverage, 'exchange_session')
  assert.equal(item.benchmarkType, 'futures')
  assert.equal(item.priceCurrent, 2.22)
})

test('Thai rice parser keeps FOB benchmark as as_published, not daily', () => {
  const html = `
    <html><body>
      <h1>Price update 22/05/2026</h1>
      <table>
        <tr><td>White Rice 5%</td><td>FOB</td><td>430</td></tr>
        <tr><td>White Rice 25%</td><td>FOB</td><td>410</td></tr>
        <tr><td>A1 Super</td><td>FOB</td><td>360</td></tr>
      </table>
    </body></html>
  `

  const items = parseThaiRiceExportPrices(html, '2026-05-23T01:00:00.000Z')
  const rice5 = items.find(item => item.id === 'rice-5pct')

  assert.equal(rice5?.dataGranularity, 'as_published')
  assert.equal(rice5?.temporalCoverage, 'as_published')
  assert.equal(rice5?.changePct, 0)
  assert.equal(rice5?.priceCurrent, 430)
})

test('World Bank Pink Sheet rows are downgraded to monthly and never produce daily change', () => {
  const [item] = markPinkSheetMonthlyItems([
    {
      id: 'rice-5pct',
      name: 'Rice 5%',
      nameEn: 'Rice 5% broken',
      symbol: 'RICE5',
      category: 'Lúa gạo & Ngũ cốc',
      exchange: 'World Bank',
      unit: 'USD/MT',
      priceCurrent: 420,
      priceYesterday: 410,
      priceLastWeek: 405,
      priceLastMonth: 400,
      change: 10,
      changePct: 2.44,
      low52w: 390,
      high52w: 500,
      currency: 'USD',
      lastUpdate: '2026-05-23T00:00:00.000Z',
      sourcePeriod: '2026M04',
      sourceObservedOn: '2026-04-30',
    },
  ])

  assert.equal(item.dataGranularity, 'monthly')
  assert.equal(item.observedOn, '2026-04-30')
  assert.equal(item.change, 0)
  assert.equal(item.changePct, 0)
})

test('daily provider item wins over monthly fallback for the same commodity', () => {
  const monthly = markPinkSheetMonthlyItems([
    {
      id: 'coffee-robusta',
      name: 'Robusta',
      nameEn: 'Robusta',
      symbol: 'ROB',
      category: 'Cà phê & Ca cao',
      exchange: 'World Bank',
      unit: 'USD/kg',
      priceCurrent: 4,
      priceYesterday: 4,
      priceLastWeek: 4,
      priceLastMonth: 4,
      change: 0,
      changePct: 0,
      low52w: 4,
      high52w: 4,
      currency: 'USD',
      lastUpdate: '2026-05-23T00:00:00.000Z',
      sourceObservedOn: '2026-04-30',
    },
  ])[0]
  const daily = parseIcoCoffeeDailyPrices(
    '{"html":"<p><span> Robustas</span><span>166.40</span><span>2.22%</span></p>"}',
    '2026-05-23T01:00:00.000Z',
  )[0]

  const [selected] = selectPreferredWorldPriceItems([monthly, daily])

  assert.equal(selected.id, 'coffee-robusta')
  assert.equal(selected.dataGranularity, 'daily')
  assert.equal(selected.sourceId, 'ico_daily')
})
