import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseExportRegistryRows } from '../services/exportRegistry/crawler.js'
import { deriveExportRegistryProduct, filterExportRegistryItems, getHarvestState, sortExportRegistryItems } from '../services/exportRegistry/service.js'

const PRODUCTION_AREA_HTML = `
  <table class="rgMasterTable">
    <tbody>
      <tr class="rgRow">
        <td>1</td>
        <td class="ppd_table__td ppd_name">
          <div class="ppd_name">
            <p><strong>Vùng trồng Quế xã Phong Dụ, huyện Tiên Yên</strong></p>
            <p style="font-style: italic;"><strong>Địa chỉ:</strong> Thôn Văn Mây, Phong Dụ, Huyện Tiên Yên, Tỉnh Quảng Ninh</p>
          </div>
        </td>
        <td class="phone"><a href="tel:0829755528">0829755528</a></td>
        <td>CHINA</td>
        <td>
          <p><strong>Bắt đầu (đợt 1):</strong> 25/02/2030</p>
          <p><strong>Kết thúc (đợt 1):</strong> 02/05/2030</p>
        </td>
      </tr>
    </tbody>
  </table>
`

const PACKING_FACILITY_HTML = `
  <table class="rgMasterTable">
    <tbody>
      <tr class="rgAltRow">
        <td>2</td>
        <td class="ppd_table__td ppd_name">
          <div class="ppd_name">
            <p><strong>Chi nhánh Công ty TNHH Rồng Hoa Thái Đắk Lắk tại Tiền Giang</strong></p>
            <p style="font-style: italic;"><strong>Địa chỉ:</strong> ấp 12, Long Trung, Huyện Cái Bè, Tỉnh Tiền Giang</p>
          </div>
        </td>
        <td class="phone">988383843</td>
        <td>CHINA</td>
      </tr>
    </tbody>
  </table>
`

describe('parseExportRegistryRows', () => {
  it('parses production area rows with approval periods', () => {
    const rows = parseExportRegistryRows(
      PRODUCTION_AREA_HTML,
      'production_area',
      'https://sansangxuatkhau.ppd.gov.vn/thong-tin-vung-trong',
      1,
      '2026-05-20T00:00:00.000Z',
    )

    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, 'Vùng trồng Quế xã Phong Dụ, huyện Tiên Yên')
    assert.equal(rows[0].address, 'Thôn Văn Mây, Phong Dụ, Huyện Tiên Yên, Tỉnh Quảng Ninh')
    assert.equal(rows[0].province, 'Tỉnh Quảng Ninh')
    assert.equal(rows[0].district, 'Huyện Tiên Yên')
    assert.equal(rows[0].phone, '0829755528')
    assert.equal(rows[0].market, 'CHINA')
    assert.deepEqual(rows[0].approvalPeriods, [
      {
        round: 1,
        startsOn: '2030-02-25',
        endsOn: '2030-05-02',
        startRaw: '25/02/2030',
        endRaw: '02/05/2030',
      },
    ])
  })

  it('parses packing facility rows without periods', () => {
    const rows = parseExportRegistryRows(
      PACKING_FACILITY_HTML,
      'packing_facility',
      'https://sansangxuatkhau.ppd.gov.vn/thong-tin-co-so-dong-goi',
      1,
      '2026-05-20T00:00:00.000Z',
    )

    assert.equal(rows.length, 1)
    assert.equal(rows[0].registryType, 'packing_facility')
    assert.equal(rows[0].sourceRowNumber, 2)
    assert.equal(rows[0].name, 'Chi nhánh Công ty TNHH Rồng Hoa Thái Đắk Lắk tại Tiền Giang')
    assert.equal(rows[0].approvalPeriods.length, 0)
    assert.equal(rows[0].contentHash.length, 64)
  })
})

describe('export registry lookup helpers', () => {
  it('derives known products from registry names', () => {
    assert.equal(deriveExportRegistryProduct({ name: 'Vùng trồng Quế xã Phong Dụ', raw_payload: null }), 'Quế')
    assert.equal(deriveExportRegistryProduct({ name: 'Vùng trồng Công ty TNHH Sầu riêng ABC', raw_payload: null }), 'Sầu riêng')
    assert.equal(deriveExportRegistryProduct({ name: 'Chi nhánh Công ty TNHH Rồng Hoa', raw_payload: null }), 'Khác')
    assert.equal(deriveExportRegistryProduct({ name: 'Vùng trồng chưa rõ loại', raw_payload: null }), 'Khác')
  })

  it('computes harvesting state and progress from approval periods', () => {
    const state = getHarvestState([
      {
        round: 1,
        startsOn: '2026-05-01',
        endsOn: '2026-05-31',
        startRaw: '01/05/2026',
        endRaw: '31/05/2026',
      },
    ], new Date('2026-05-16T00:00:00.000Z'))

    assert.equal(state.status, 'harvesting')
    assert.equal(state.progressPct, 50)
  })

  it('filters lookup items by search, province, product, market, and harvesting status', () => {
    const items = [
      {
        id: '1',
        registryType: 'production_area' as const,
        sourceUrl: 'https://example.test',
        sourcePage: 1,
        sourcePosition: 1,
        sourceRowNumber: 1,
        name: 'Vùng trồng Quế Phong Dụ',
        address: 'Phong Dụ, Huyện Tiên Yên, Tỉnh Quảng Ninh',
        phone: '0829755528',
        phoneDisplay: '0829***528',
        market: 'CHINA',
        province: 'Tỉnh Quảng Ninh',
        district: 'Huyện Tiên Yên',
        commune: null,
        product: 'Quế',
        registryCode: 'QN-001',
        approvalPeriods: [],
        harvestStatus: 'harvesting' as const,
        harvestStatusLabel: 'Đang thu hoạch đợt 1',
        seasonProgressPct: 40,
        latestCrawledAt: '2026-05-20T00:00:00.000Z',
        capacity: null,
        certifications: [],
      },
      {
        id: '2',
        registryType: 'production_area' as const,
        sourceUrl: 'https://example.test',
        sourcePage: 1,
        sourcePosition: 2,
        sourceRowNumber: 2,
        name: 'Vùng trồng Thanh long',
        address: 'Huyện Cái Bè, Tỉnh Tiền Giang',
        phone: '0909186179',
        phoneDisplay: '0909***179',
        market: 'US',
        province: 'Tỉnh Tiền Giang',
        district: 'Huyện Cái Bè',
        commune: null,
        product: 'Thanh long',
        registryCode: 'TG-001',
        approvalPeriods: [],
        harvestStatus: 'soon' as const,
        harvestStatusLabel: 'Sắp thu hoạch đợt 1',
        seasonProgressPct: 0,
        latestCrawledAt: '2026-05-20T00:00:00.000Z',
        capacity: null,
        certifications: [],
      },
    ]

    const filtered = filterExportRegistryItems(items, {
      q: 'QN-001',
      province: 'Tỉnh Quảng Ninh',
      market: 'CHINA',
      product: 'Quế',
      status: 'harvesting',
    })

    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].id, '1')
  })

  it('sorts lookup items by name, latest update, and province', () => {
    const items = [
      {
        id: '1',
        registryType: 'production_area' as const,
        sourceUrl: 'https://example.test',
        sourcePage: 2,
        sourcePosition: 2,
        sourceRowNumber: 2,
        name: 'Vung trong Xoai',
        address: null,
        phone: null,
        phoneDisplay: null,
        market: null,
        province: 'Tinh Tien Giang',
        district: null,
        commune: null,
        product: 'Xoai',
        registryCode: null,
        approvalPeriods: [],
        harvestStatus: 'unknown' as const,
        harvestStatusLabel: 'Chua ro mua vu',
        seasonProgressPct: null,
        latestCrawledAt: '2026-05-20T00:00:00.000Z',
        capacity: null,
        certifications: [],
      },
      {
        id: '2',
        registryType: 'production_area' as const,
        sourceUrl: 'https://example.test',
        sourcePage: 1,
        sourcePosition: 1,
        sourceRowNumber: 1,
        name: 'Vung trong Buoi',
        address: null,
        phone: null,
        phoneDisplay: null,
        market: null,
        province: 'Tinh Ben Tre',
        district: null,
        commune: null,
        product: 'Buoi',
        registryCode: null,
        approvalPeriods: [],
        harvestStatus: 'unknown' as const,
        harvestStatusLabel: 'Chua ro mua vu',
        seasonProgressPct: null,
        latestCrawledAt: '2026-05-21T00:00:00.000Z',
        capacity: null,
        certifications: [],
      },
      {
        id: '3',
        registryType: 'production_area' as const,
        sourceUrl: 'https://example.test',
        sourcePage: 1,
        sourcePosition: 3,
        sourceRowNumber: 3,
        name: 'Vung trong Cam',
        address: null,
        phone: null,
        phoneDisplay: null,
        market: null,
        province: 'Tinh An Giang',
        district: null,
        commune: null,
        product: 'Cam',
        registryCode: null,
        approvalPeriods: [],
        harvestStatus: 'unknown' as const,
        harvestStatusLabel: 'Chua ro mua vu',
        seasonProgressPct: null,
        latestCrawledAt: '2026-05-19T00:00:00.000Z',
        capacity: null,
        certifications: [],
      },
    ]

    assert.deepEqual(sortExportRegistryItems(items, 'name_asc').map(item => item.id), ['2', '3', '1'])
    assert.deepEqual(sortExportRegistryItems(items, 'updated_desc').map(item => item.id), ['2', '1', '3'])
    assert.deepEqual(sortExportRegistryItems(items, 'province_asc').map(item => item.id), ['3', '2', '1'])
  })
})
