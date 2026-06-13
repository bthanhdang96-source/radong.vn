import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  selectExportRegistryMapSourceItems,
  type ExportRegistryLookupItem,
} from '../services/exportRegistry/service.js'

function makeLookupItem(id: string): ExportRegistryLookupItem {
  return {
    id,
    registryType: 'production_area',
    sourceUrl: 'https://example.test',
    sourcePage: 1,
    sourcePosition: Number(id),
    sourceRowNumber: Number(id),
    name: `Vung trong ${id}`,
    address: null,
    phone: null,
    phoneDisplay: null,
    market: null,
    province: null,
    district: null,
    commune: null,
    product: 'Khac',
    registryCode: null,
    approvalPeriods: [],
    harvestStatus: 'unknown',
    harvestStatusLabel: 'Chua ro mua vu',
    seasonProgressPct: null,
    latestCrawledAt: '2026-06-01T00:00:00.000Z',
    capacity: null,
    certifications: [],
  }
}

describe('export registry mapMode', () => {
  it('selects all, page, or no map source items', () => {
    const filteredItems = ['1', '2', '3', '4'].map(makeLookupItem)
    const pageItems = filteredItems.slice(0, 2)

    assert.deepEqual(
      selectExportRegistryMapSourceItems(filteredItems, pageItems, 'all').map(item => item.id),
      ['1', '2', '3', '4'],
    )
    assert.deepEqual(
      selectExportRegistryMapSourceItems(filteredItems, pageItems, 'page').map(item => item.id),
      ['1', '2'],
    )
    assert.deepEqual(selectExportRegistryMapSourceItems(filteredItems, pageItems, 'none'), [])
  })

  it('caps all map source items to avoid oversized public map payloads', () => {
    const filteredItems = Array.from({ length: 305 }, (_, index) => makeLookupItem(String(index + 1)))
    const selected = selectExportRegistryMapSourceItems(filteredItems, filteredItems.slice(0, 24), 'all')

    assert.equal(selected.length, 300)
    assert.equal(selected[0]?.id, '1')
    assert.equal(selected.at(-1)?.id, '300')
  })
})
