import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAgroinfoDurianExportText } from '../services/crawlers/agroinfoDurianExportCrawler.js'
import { parseChogiaDurianHtml } from '../services/crawlers/chogiaDurianCrawler.js'
import { parseDaklakSctDurianHtml } from '../services/crawlers/daklakSctDurianCrawler.js'
import { parseVietnambizDurianArticle } from '../services/crawlers/vietnambizDurianCrawler.js'
import { buildObservationDedupeKey } from '../services/ingestion/observationRules.js'

test('parseChogiaDurianHtml parses variety, grade, region, and midpoint correctly', () => {
  const html = `
    <html>
      <body>
        <h1>Gia sau rieng hom nay</h1>
        <table>
          <tr>
            <th>Loai</th>
            <th>Mien Tay Nam bo</th>
            <th>Mien Dong Nam bo</th>
            <th>Tay Nguyen</th>
          </tr>
          <tr>
            <td>Sau rieng Ri6 dep</td>
            <td>55.000 - 60.000</td>
            <td>55.000 - 60.000</td>
            <td>52.000 - 54.000</td>
          </tr>
          <tr>
            <td>Sau rieng Thai xo</td>
            <td>45.000 - 50.000</td>
            <td>40.000 - 50.000</td>
            <td>32.000 - 35.000</td>
          </tr>
        </table>
      </body>
    </html>
  `

  const parsed = parseChogiaDurianHtml(html, '2026-05-17T01:00:00.000Z')
  assert.equal(parsed.items.length, 6)

  const ri6TayNguyen = parsed.items.find(item => item.region === 'Tay Nguyen' && item.variety === 'ri6')
  assert.equal(ri6TayNguyen?.qualityGrade, 'loai-dep')
  assert.equal(ri6TayNguyen?.price, 53000)

  const thaiMienTay = parsed.items.find(item => item.region === 'Mien Tay Nam bo' && item.variety === 'thai-monthong')
  assert.equal(thaiMienTay?.qualityGrade, 'hang-xo')
  assert.equal(thaiMienTay?.price, 47500)
})

test('parseDaklakSctDurianHtml parses Dak Lak durian board rows correctly', () => {
  const html = `
    <html>
      <head>
        <meta property="article:published_time" content="2026-05-15T08:00:00+07:00" />
      </head>
      <body>
        <h1>Bang gia nong san ngay 15/5/2026</h1>
        <table>
          <tr>
            <th>Cac loai</th>
            <th>Gia (dong/kg)</th>
            <th>Thay doi</th>
          </tr>
          <tr>
            <td>Sau rieng Thai (VIP A)</td>
            <td>150.000 - 160.000</td>
            <td>-</td>
          </tr>
          <tr>
            <td>Sau rieng Ri6 (Loai B)</td>
            <td>65.000 - 71.000</td>
            <td>-</td>
          </tr>
        </table>
      </body>
    </html>
  `

  const parsed = parseDaklakSctDurianHtml(html, '2026-05-17T01:00:00.000Z')
  assert.equal(parsed.timestamp, '2026-05-15T01:00:00.000Z')
  assert.equal(parsed.items.length, 2)

  const thaiVip = parsed.items.find(item => item.variety === 'thai-monthong')
  assert.equal(thaiVip?.qualityGrade, 'loai-a')
  assert.equal(thaiVip?.price, 155000)

  const ri6 = parsed.items.find(item => item.variety === 'ri6')
  assert.equal(ri6?.qualityGrade, 'loai-b')
  assert.equal(ri6?.price, 68000)
})

test('parseVietnambizDurianArticle maps thu mua prose to farm_gate rows', () => {
  const html = `
    <html>
      <head>
        <meta property="og:title" content="Gia sau rieng hom nay 17/5" />
        <meta property="article:published_time" content="2026-05-17T08:30:00+07:00" />
      </head>
      <body>
        <div class="vnbiz-content">
          Tai Tay Nam Bo, gia thu mua sau rieng Ri6 loai 1 duy tri 55.000 - 60.000 dong/kg.
          O khu vuc Dong Nam Bo, gia thu mua sau rieng Thai loai tuyen o muc 75.000 - 85.000 dong/kg.
          Doi voi Tay Nguyen, gia thu mua sau rieng Dona loai 1 dat 90.000 - 95.000 dong/kg.
        </div>
      </body>
    </html>
  `

  const parsed = parseVietnambizDurianArticle(html, '2026-05-17T00:00:00.000Z')
  assert.equal(parsed.timestamp, '2026-05-17T01:30:00.000Z')
  assert.equal(parsed.items.length, 3)
  assert.deepEqual(
    parsed.items.map(item => ({
      region: item.region,
      variety: item.variety,
      priceType: item.priceType,
      price: item.price,
    })),
    [
      { region: 'Miền Tây Nam Bộ', variety: 'ri6', priceType: 'farm_gate', price: 57500 },
      { region: 'Miền Đông Nam Bộ', variety: 'thai-monthong', priceType: 'farm_gate', price: 80000 },
      { region: 'Tây Nguyên', variety: 'dona', priceType: 'farm_gate', price: 92500 },
    ],
  )
})

test('parseAgroinfoDurianExportText extracts Vietnam proxy value from ordered country sentence', () => {
  const text =
    'Gia nhap khau sau rieng binh quan tu Thai Lan va Viet Nam cung giam lan luot 10% va 7,5%, xuong con 5.529 USD/tan va 4.561 USD/tan.'

  assert.equal(parseAgroinfoDurianExportText(text), 4561)
})

test('buildObservationDedupeKey keeps durian varieties and grades separate', () => {
  const common = {
    sourceName: 'chogia',
    commoditySlug: 'sau-rieng',
    priceType: 'wholesale',
    provinceCode: null,
    regionLabel: 'Tay Nguyen',
    marketName: 'Cho Gia reference',
    articleTitle: 'Gia sau rieng hom nay',
    sourceUrl: 'https://chogia.vn/bang-gia-sau-rieng-hom-nay-47777/',
    countryCode: 'VNM',
    priceVnd: 53000,
    recordedAt: '2026-05-17T01:00:00.000Z',
    explicitKey: null,
    extra: null,
  } as const

  const ri6Key = buildObservationDedupeKey({
    ...common,
    variety: 'ri6',
    qualityGrade: 'loai-dep',
  })
  const thaiKey = buildObservationDedupeKey({
    ...common,
    variety: 'thai-monthong',
    qualityGrade: 'loai-dep',
  })

  assert.notEqual(ri6Key, thaiKey)
})
