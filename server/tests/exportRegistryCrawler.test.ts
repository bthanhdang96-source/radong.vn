import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseExportRegistryRows } from '../services/exportRegistry/crawler.js'

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
