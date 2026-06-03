import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COFFEE_HS_MAPPING_SEED,
  canAggregateCoffeeBuckets,
  getCoffeeHsScope,
  getMvpHsCodes,
  isComparableHs6,
  mapHsToCommodity,
  normalizeHsCode,
  shouldAggregate,
} from '../services/hsMapping.js'

test('normalizeHsCode keeps hs6 and hs8_or_more for 8-digit code', () => {
  const normalized = normalizeHsCode('09011130')

  assert.equal(normalized.hs2, '09')
  assert.equal(normalized.hs4, '0901')
  assert.equal(normalized.hs6, '090111')
  assert.equal(normalized.hs8OrMore, '09011130')
})

test('normalizeHsCode pads odd-digit input before splitting HS hierarchy', () => {
  const normalized = normalizeHsCode('9011130')

  assert.equal(normalized.hs6, '090111')
  assert.equal(normalized.hs8OrMore, '09011130')
})

test('normalizeHsCode strips non-digits and supports hs6-only inputs', () => {
  const hs6Only = normalizeHsCode('100630')
  const withDot = normalizeHsCode('100630.00')

  assert.equal(hs6Only.hs6, '100630')
  assert.equal(hs6Only.hs8OrMore, null)
  assert.equal(withDot.hs6, '100630')
  assert.equal(withDot.hs8OrMore, '10063000')
})

test('mapHsToCommodity resolves coffee core and instant buckets', () => {
  const raw = mapHsToCommodity('090111', { rows: COFFEE_HS_MAPPING_SEED })
  const instant = mapHsToCommodity('210111', { rows: COFFEE_HS_MAPPING_SEED })
  const preparation = mapHsToCommodity('210112', { rows: COFFEE_HS_MAPPING_SEED })

  assert.equal(raw?.analysisBucket, 'coffee_raw_core')
  assert.equal(instant?.analysisBucket, 'coffee_instant')
  assert.equal(preparation?.analysisBucket, 'coffee_preparation')
})

test('mapHsToCommodity resolves full official coffee HS6 taxonomy', () => {
  const expectations = new Map([
    ['090111', 'coffee_raw_core'],
    ['090112', 'coffee_decaf_raw'],
    ['090121', 'coffee_roasted'],
    ['090122', 'coffee_roasted_decaf'],
    ['090190', 'coffee_byproduct'],
    ['210111', 'coffee_instant'],
    ['210112', 'coffee_preparation'],
  ])

  for (const [hs6, bucket] of expectations.entries()) {
    const mapping = mapHsToCommodity(hs6, { rows: COFFEE_HS_MAPPING_SEED })
    assert.equal(mapping?.analysisBucket, bucket)
    assert.equal(mapping ? isComparableHs6(mapping) : false, true)
  }
})

test('mapHsToCommodity prefers country-specific mapping then falls back to INT', () => {
  const vietnam = mapHsToCommodity('09011130', {
    countryScope: 'VNM',
    rows: COFFEE_HS_MAPPING_SEED,
  })
  const japan = mapHsToCommodity('090111000', {
    countryScope: 'JPN',
    rows: COFFEE_HS_MAPPING_SEED,
  })
  const unknownCountry = mapHsToCommodity('090111', {
    countryScope: 'CAN',
    rows: COFFEE_HS_MAPPING_SEED,
  })

  assert.equal(vietnam?.nationalCode, '0901.11.30')
  assert.equal(vietnam?.parentHs6, '090111')
  assert.equal(vietnam?.speciesVariety, 'robusta')
  assert.equal(vietnam?.isInternationallyComparable, false)
  assert.equal(japan?.nationalCode, '0901.11.000')
  assert.equal(unknownCountry?.countryScope, 'INT')
})

test('getCoffeeHsScope returns decision-complete HS code groups', () => {
  const allHs6 = getCoffeeHsScope('all_hs6', COFFEE_HS_MAPPING_SEED)
  const greenOnly = getCoffeeHsScope('green_only', COFFEE_HS_MAPPING_SEED)
  const processed = getCoffeeHsScope('processed', COFFEE_HS_MAPPING_SEED)
  const nationalDetail = getCoffeeHsScope('national_detail', COFFEE_HS_MAPPING_SEED)

  assert.deepEqual(
    allHs6.map(row => row.hs6).sort(),
    ['090111', '090112', '090121', '090122', '090190', '210111', '210112'],
  )
  assert.deepEqual(
    greenOnly.map(row => row.hs6).sort(),
    ['090111', '090112'],
  )
  assert.deepEqual(
    processed.map(row => row.hs6).sort(),
    ['210111', '210112'],
  )
  assert.equal(nationalDetail.some(row => row.hs8Vn === '09011130'), true)
})

test('getMvpHsCodes only returns include_in_mvp rows for coffee', () => {
  const mvpRows = getMvpHsCodes('coffee', COFFEE_HS_MAPPING_SEED)

  assert.ok(mvpRows.length > 0)
  assert.equal(mvpRows.every(row => row.includeInMvp), true)
  assert.equal(mvpRows.every(row => row.commodityGroup === 'coffee'), true)
})

test('shouldAggregate blocks raw-vs-processed coffee mixing', () => {
  assert.equal(shouldAggregate('coffee_raw_core', 'coffee_instant'), false)
  assert.equal(canAggregateCoffeeBuckets('coffee_raw_core', 'coffee_preparation'), false)
  assert.equal(shouldAggregate('coffee_raw_core', 'coffee_roasted'), false)
  assert.equal(shouldAggregate('coffee_raw_core', 'coffee_byproduct'), false)
  assert.equal(shouldAggregate('coffee_raw_core', 'coffee_raw_core'), true)
})
