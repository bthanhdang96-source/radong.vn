import test from 'node:test'
import assert from 'node:assert/strict'
import { isDomesticCoffeeLabel } from '../services/crawlers/banggianongsanCrawler.js'
import { matchRetailCommodity } from '../services/crawlers/retailCommodityMatcher.js'
import { parseRetailUnitPricing } from '../services/crawlers/retailUnitPricing.js'

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

test('matchRetailCommodity keeps new phase-1 commodities and excludes processed variants', () => {
  assert.equal(matchRetailCommodity('San tuoi huu co 1kg')?.slug, 'cassava')
  assert.equal(matchRetailCommodity('Tinh bot san 400g'), null)
  assert.equal(matchRetailCommodity('Tra Thai Nguyen 500g')?.slug, 'tea-avg')
  assert.equal(matchRetailCommodity('Tra sua tran chau vi tra xanh'), null)
  assert.equal(matchRetailCommodity('Thanh long ruot do 1kg')?.slug, 'thanh-long')
  assert.equal(matchRetailCommodity('Thanh long say deo 120g'), null)
  assert.equal(matchRetailCommodity('Dua tuoi 1 trai')?.slug, 'dua-tuoi')
  assert.equal(matchRetailCommodity('Keo dua Ben Tre 250g'), null)
})

test('parseRetailUnitPricing preserves coconut trai and chuc clusters', () => {
  const perFruit = parseRetailUnitPricing('dua-tuoi', 72000, 'Dua tuoi 3 trai')
  const perChuc = parseRetailUnitPricing('dua-tuoi', 185000, 'Dua xiem 1 chuc')
  const perKg = parseRetailUnitPricing('thanh-long', 48000, 'Thanh long ruot trang 2kg')

  assert.deepEqual(
    perFruit && {
      price: perFruit.price,
      unit: perFruit.unit,
      normalizedUnitKey: perFruit.normalizedUnitKey,
      unitQuantity: perFruit.unitQuantity,
    },
    {
      price: 24000,
      unit: 'VND/trai',
      normalizedUnitKey: 'trai',
      unitQuantity: 3,
    },
  )
  assert.deepEqual(
    perChuc && {
      price: perChuc.price,
      unit: perChuc.unit,
      normalizedUnitKey: perChuc.normalizedUnitKey,
      unitQuantity: perChuc.unitQuantity,
    },
    {
      price: 185000,
      unit: 'VND/chuc',
      normalizedUnitKey: 'chuc',
      unitQuantity: 1,
    },
  )
  assert.equal(perKg?.price, 24000)
  assert.equal(perKg?.unit, 'VND/kg')
})

test('isDomesticCoffeeLabel only keeps domestic VND per kg rows', () => {
  assert.equal(isDomesticCoffeeLabel('Cà phê Đắk Lắk (đ/kg)'), true)
  assert.equal(isDomesticCoffeeLabel('Cà phê Robusta London Tháng 5/2026 (USD/tấn)'), false)
  assert.equal(isDomesticCoffeeLabel('Cà phê Arabica New York Tháng 7/2026 (cent/lb)'), false)
})
