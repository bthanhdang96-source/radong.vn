import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVietnambizRiceArticle } from '../services/crawlers/vietnambizCrawler.js'
import { classifyNewsArticle } from '../services/news/articleClassification.js'
import { parseLooseDate } from '../services/news/common.js'
import { getNewsSchedulerConfig } from '../services/news/scheduler.js'
import { crawlNewsSource } from '../services/news/service.js'
import type { NewsSourceKey } from '../services/news/types.js'

function withEnv(values: Record<string, string | undefined>, callback: () => void) {
  const previous = new Map<string, string | undefined>()

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    callback()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test('parseLooseDate supports Vinacas and VASEP date formats', () => {
  const vinacasDate = new Date(parseLooseDate('Ngày đăng: 13-05-2026 14:44:00'))
  const shortDate = new Date(parseLooseDate('(09/5/2026)'))
  const vasepDate = new Date(parseLooseDate('15:12 02/04/2026'))

  assert.equal(vinacasDate.getUTCFullYear(), 2026)
  assert.equal(vinacasDate.getUTCMonth(), 4)
  assert.equal(shortDate.getUTCFullYear(), 2026)
  assert.equal(shortDate.getUTCMonth(), 4)
  assert.equal(vasepDate.getUTCFullYear(), 2026)
  assert.equal(vasepDate.getUTCMonth(), 3)
})

test('getNewsSchedulerConfig includes all active sources by default', () => {
  withEnv(
    {
      NEWS_ENABLED_SOURCES: undefined,
    },
    () => {
      const config = getNewsSchedulerConfig()

      for (const sourceKey of ['congthuong', 'kinhtenongthon', 'vinacas', 'coa'] as NewsSourceKey[]) {
        assert.ok(config.sourceKeys.includes(sourceKey))
      }

      assert.ok(!config.sourceKeys.includes('vasep'))
    },
  )
})

test('crawlNewsSource rejects disabled sources', async () => {
  await assert.rejects(() => crawlNewsSource('vasep'), /Source vasep is disabled/)
})

test('classifyNewsArticle hides Vietnambiz domestic rice price roundups from the news feed', () => {
  const classification = classifyNewsArticle({
    sourceKey: 'vietnambiz',
    title: 'Giá lúa gạo hôm nay 16/5: Gạo xuất khẩu của Việt Nam tăng thêm 5-10 USD/tấn',
    canonicalUrl:
      'https://vietnambiz.vn/gia-lua-gao-hom-nay-165-gao-xuat-khau-cua-viet-nam-tang-them-5-10-usdtan-20265161234567.htm',
    contentText: 'Bảng giá gạo hôm nay 16/5 tại khu vực Đồng bằng sông Cửu Long.',
  })

  assert.equal(classification.hideFromNewsFeed, true)
  assert.equal(classification.status, 'archived')
  assert.equal(classification.kind, 'price_roundup')
  assert.equal(classification.priceDataTarget, 'vn_domestic_rice')
})

test('classifyNewsArticle hides Vietnambiz coffee, pepper, and pork price roundups from the news feed', () => {
  const cases = [
    {
      title: 'Giá cà phê hôm nay 13/5: Hạ nhiệt sau chuỗi tăng liên tiếp',
      canonicalUrl: 'https://vietnambiz.vn/gia-ca-phe-hom-nay-135-ha-nhiet-sau-chuoi-tang-lien-tiep-202651372113500.htm',
      contentText: 'Giá thu mua cà phê tại Đắk Nông được điều chỉnh giảm nhẹ.',
      expectedTag: 'vietnambiz-coffee',
    },
    {
      title: 'Giá tiêu hôm nay 13/5: Vẫn trong xu hướng tăng, một số địa phương nhích thêm 500 đồng/kg',
      canonicalUrl: 'https://vietnambiz.vn/gia-tieu-hom-nay-135-van-trong-xu-huong-tang-mot-so-dia-phuong-nhich-them-500-dongkg-202651365835877.htm',
      contentText: 'Giá thu mua ngày 13/5 tại các vùng trồng tiêu trọng điểm tiếp tục tăng nhẹ.',
      expectedTag: 'vietnambiz-pepper',
    },
    {
      title: 'Giá heo hơi hôm nay 13/5: Sơn La và Thanh Hóa tăng nhẹ 1.000 đồng/kg',
      canonicalUrl: 'https://vietnambiz.vn/gia-heo-hoi-hom-nay-135-son-la-va-thanh-hoa-tang-nhe-1000-dongkg-202651371653645.htm',
      contentText: 'Thị trường heo hơi hôm nay tại miền Bắc tăng rải rác ở một vài địa phương.',
      expectedTag: 'vietnambiz-pork',
    },
  ]

  for (const input of cases) {
    const classification = classifyNewsArticle({
      sourceKey: 'vietnambiz',
      title: input.title,
      canonicalUrl: input.canonicalUrl,
      contentText: input.contentText,
    })

    assert.equal(classification.hideFromNewsFeed, true)
    assert.equal(classification.status, 'archived')
    assert.equal(classification.kind, 'price_roundup')
    assert.ok(classification.topicTags.includes(input.expectedTag))
  }
})

test('parseVietnambizRiceArticle extracts structured rice rows from the article table', () => {
  const articleHtml = `
    <html>
      <head>
        <meta property="og:title" content="Giá lúa gạo hôm nay 16/5: Gạo xuất khẩu của Việt Nam tăng thêm 5-10 USD/tấn" />
        <meta property="article:published_time" content="2026-05-16T07:00:00+07:00" />
      </head>
      <body>
        <div class="vnbiz-content">
          <table>
            <tr>
              <th>Giá lúa gạo</th>
              <th>DVT</th>
              <th>Giá tại chợ (đồng)</th>
              <th>Tăng (+), giảm (-) so với hôm trước</th>
            </tr>
            <tr>
              <td>- Nguyên liệu OM 5451</td>
              <td>kg</td>
              <td>9.500 – 9.600</td>
              <td>-</td>
            </tr>
            <tr>
              <td>- Nguyên liệu CL 555</td>
              <td>kg</td>
              <td>9.100 – 9.200</td>
              <td>-</td>
            </tr>
            <tr>
              <td>- Tấm 3,4</td>
              <td>kg</td>
              <td>7.500 – 7.600</td>
              <td>-</td>
            </tr>
            <tr>
              <td>- Cám</td>
              <td>kg</td>
              <td>7.300 – 7.500</td>
              <td>-</td>
            </tr>
            <tr>
              <td>- Lúa tươi OM 18</td>
              <td>kg</td>
              <td>6.100 – 6.300</td>
              <td>-</td>
            </tr>
            <tr>
              <td>- Lúa tươi Đài Thơm 8</td>
              <td>kg</td>
              <td>6.100 – 6.300</td>
              <td>-</td>
            </tr>
          </table>
        </div>
      </body>
    </html>
  `

  const parsed = parseVietnambizRiceArticle(articleHtml, '2026-05-16T00:00:00.000Z')

  assert.equal(parsed.articleTitle, 'Giá lúa gạo hôm nay 16/5: Gạo xuất khẩu của Việt Nam tăng thêm 5-10 USD/tấn')
  assert.equal(parsed.timestamp, '2026-05-16T00:00:00.000Z')
  assert.equal(parsed.items.length, 6)
  assert.deepEqual(
    parsed.items.map(item => ({
      region: item.region,
      price: item.price,
      priceType: item.priceType,
      articleTitle: item.articleTitle,
    })),
    [
      {
        region: 'Nguyên liệu OM 5451',
        price: 9550,
        priceType: 'wholesale',
        articleTitle: parsed.articleTitle,
      },
      {
        region: 'Nguyên liệu CL 555',
        price: 9150,
        priceType: 'wholesale',
        articleTitle: parsed.articleTitle,
      },
      {
        region: 'Tấm 3,4',
        price: 7550,
        priceType: 'wholesale',
        articleTitle: parsed.articleTitle,
      },
      {
        region: 'Cám',
        price: 7400,
        priceType: 'wholesale',
        articleTitle: parsed.articleTitle,
      },
      {
        region: 'Lúa tươi OM 18',
        price: 6200,
        priceType: 'farm_gate',
        articleTitle: parsed.articleTitle,
      },
      {
        region: 'Lúa tươi Đài Thơm 8',
        price: 6200,
        priceType: 'farm_gate',
        articleTitle: parsed.articleTitle,
      },
    ],
  )
})
