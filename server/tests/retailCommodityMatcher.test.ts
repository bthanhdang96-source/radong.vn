import test from 'node:test'
import assert from 'node:assert/strict'
import { isDomesticCoffeeLabel } from '../services/crawlers/banggianongsanCrawler.js'
import { matchRetailCommodity } from '../services/crawlers/retailCommodityMatcher.js'

test('matchRetailCommodity avoids substring false positives in retail crawlers', () => {
  assert.equal(matchRetailCommodity('Rau mồng tơi 400gr'), null)
  assert.equal(matchRetailCommodity('Cải ngọt túi 400g'), null)
  assert.equal(matchRetailCommodity('Cà rốt Co.op Select kg'), null)
  assert.equal(matchRetailCommodity('Táo bi đỏ kg'), null)
})

test('matchRetailCommodity excludes premium variants outside tracked commodity scope', () => {
  assert.equal(matchRetailCommodity('Ớt chuông baby 3 màu Co.op Select 250g'), null)
  assert.equal(matchRetailCommodity('Ớt ngọt Palermo Co.op Select 300g'), null)
  assert.equal(matchRetailCommodity('Bông cải xanh baby CoopSelect300g'), null)
  assert.equal(matchRetailCommodity('Cải bó xôi baby CoopSelect 300g'), null)
  assert.equal(matchRetailCommodity('Cải bó xôi kg'), null)
  assert.equal(matchRetailCommodity('Cà chua trái cây Ngọc Bích Co.op Select – 300g'), null)
  assert.equal(matchRetailCommodity('Cà chua bi đỏ Co.op Organic 250g – QL'), null)
})

test('matchRetailCommodity still keeps in-scope produce matches', () => {
  assert.equal(matchRetailCommodity('Củ tỏi Hải Dương kg')?.slug, 'toi')
  assert.equal(matchRetailCommodity('Bí đỏ tròn Co.op Select kg – TNX')?.slug, 'bi-do')
  assert.equal(matchRetailCommodity('Ớt hiểm xanh kg')?.slug, 'ot')
  assert.equal(matchRetailCommodity('Cải xanh Đà Lạt Co.op Select 300g – TNX')?.slug, 'cai-xanh')
})

test('matchRetailCommodity keeps fresh durian but excludes processed durian products', () => {
  assert.equal(matchRetailCommodity('Sầu riêng Ri6 tách múi 500g')?.slug, 'sau-rieng')
  assert.equal(matchRetailCommodity('Bánh pía sầu riêng 480g'), null)
  assert.equal(matchRetailCommodity('Kem sầu riêng hộp 450ml'), null)
  assert.equal(matchRetailCommodity('Sầu riêng sấy giòn 120g'), null)
})

test('isDomesticCoffeeLabel only keeps domestic VND per kg rows', () => {
  assert.equal(isDomesticCoffeeLabel('Cà phê Đắk Lắk (đ/kg)'), true)
  assert.equal(isDomesticCoffeeLabel('Cà phê Robusta London Tháng 5/2026 (USD/tấn)'), false)
  assert.equal(isDomesticCoffeeLabel('Cà phê Arabica New York Tháng 7/2026 (cent/lb)'), false)
})
