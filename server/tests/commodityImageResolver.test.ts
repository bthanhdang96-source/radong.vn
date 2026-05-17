import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  IMPORTANT_EXACT_COMMODITY_SLUGS,
  getCommodityImageCatalog,
} from '../services/generatedPricePages/commodityImageCatalog.js'
import { resolveCommodityImage } from '../services/generatedPricePages/commodityImageResolver.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const publicRoot = resolve(repoRoot, 'public')

function toAssetPath(url: string) {
  return resolve(publicRoot, `.${url}`)
}

test('commodity page canonical image uses the first exact variant', () => {
  const image = resolveCommodityImage({
    commoditySlug: 'heo-hoi',
    commodityDisplayName: 'Heo hơi',
    category: 'Chăn nuôi',
    pageKind: 'commodity_price_page',
  })

  assert.equal(image.source, 'commodity')
  assert.equal(image.variantIndex, 0)
  assert.match(image.url, /^\/images\/commodities\/heo-hoi\//)
})

test('location pages keep a stable but diversified image choice by location', () => {
  const locations = [
    { locationSlug: 'dak-lak', locationLabel: 'Đắk Lắk' },
    { locationSlug: 'gia-lai', locationLabel: 'Gia Lai' },
    { locationSlug: 'binh-phuoc', locationLabel: 'Bình Phước' },
    { locationSlug: 'dong-nai', locationLabel: 'Đồng Nai' },
  ]
  const resolvedUrls = locations.map(location =>
    resolveCommodityImage({
      commoditySlug: 'ho-tieu',
      commodityDisplayName: 'Hồ tiêu',
      category: 'Cây công nghiệp',
      locationSlug: location.locationSlug,
      locationLabel: location.locationLabel,
      scopeType: 'province',
      pageKind: 'location_price_page',
    }).url,
  )
  const dakLakAgain = resolveCommodityImage({
    commoditySlug: 'ho-tieu',
    commodityDisplayName: 'Hồ tiêu',
    category: 'Cây công nghiệp',
    locationSlug: 'dak-lak',
    locationLabel: 'Đắk Lắk',
    scopeType: 'province',
    pageKind: 'location_price_page',
  })

  assert.equal(resolvedUrls[0], dakLakAgain.url)
  assert.ok(new Set(resolvedUrls).size > 1)
})

test('category fallback is used when a commodity slug has no exact catalog entry', () => {
  const image = resolveCommodityImage({
    commoditySlug: 'gao-st25',
    commodityDisplayName: 'Gạo ST25',
    category: 'Lương thực',
    pageKind: 'commodity_price_page',
  })

  assert.equal(image.source, 'category_fallback')
  assert.match(image.url, /^\/images\/commodities\/gao-noi-dia\//)
})

test('important exact commodity slugs map to local curated files', () => {
  const catalog = getCommodityImageCatalog()
  const requiredMultiVariantSlugs = new Set(['heo-hoi', 'ca-phe-robusta', 'gao-noi-dia', 'ho-tieu'])

  for (const slug of IMPORTANT_EXACT_COMMODITY_SLUGS) {
    const entry = catalog[slug]
    assert.ok(entry, `missing exact image catalog entry for ${slug}`)
    assert.ok(entry.variants.length > 0, `empty variants for ${slug}`)

    if (requiredMultiVariantSlugs.has(slug)) {
      assert.ok(entry.variants.length >= 3, `${slug} should have at least 3 curated variants`)
    }

    for (const variant of entry.variants) {
      assert.equal(variant.subject, 'exact')
      assert.doesNotMatch(variant.url, /^https?:\/\//i)
      assert.ok(existsSync(toAssetPath(variant.url)), `missing local asset for ${slug}: ${variant.url}`)
    }
  }
})
