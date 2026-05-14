import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSourceSnapshotIds, selectLatestObservationRows } from '../services/supabaseMarketDataService.js'

test('resolveSourceSnapshotIds includes customs in the default source snapshot query set', () => {
  const sourceIds = resolveSourceSnapshotIds()

  assert.ok(sourceIds.includes('customs'))
  assert.ok(sourceIds.includes('bhx'))
  assert.ok(sourceIds.includes('coop'))
})

test('selectLatestObservationRows keeps only the newest customs export row per commodity signature', () => {
  const rows = selectLatestObservationRows([
    {
      recorded_at: '2026-05-06T17:19:45.843Z',
      commodity_slug: 'cashew',
      province_code: null,
      variety: null,
      quality_grade: null,
      price_type: 'export',
      price_vnd: 186919.42,
      price_usd: 7.0889,
      source: 'customs',
      raw_payload: {},
    },
    {
      recorded_at: '2026-05-07T12:31:10.043Z',
      commodity_slug: 'cashew',
      province_code: null,
      variety: null,
      quality_grade: null,
      price_type: 'export',
      price_vnd: 187377.54,
      price_usd: 7.1062,
      source: 'customs',
      raw_payload: {},
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.recorded_at, '2026-05-07T12:31:10.043Z')
  assert.equal(rows[0]?.price_vnd, 187377.54)
})
