import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildContentModules,
  buildContentTaxonomy,
  classifyNewsContentFamily,
  filterContentItems,
} from '../services/contentTaxonomy.js'
import { toCommodityContentFeedItem } from '../services/generatedCommodityPricePages/service.js'
import { toContentFeedItem } from '../services/generatedPricePages/service.js'
import type { ContentFeedItem, GeneratedCommodityPricePageSummary, GeneratedPricePageSummary } from '../services/generatedPricePages/types.js'

function makePricePageSummary(category: string): GeneratedPricePageSummary {
  return {
    id: 'page-1',
    slug: 'gia-gao-an-giang',
    path: '/gia-nong-san/gao-noi-dia/an-giang',
    commoditySlug: 'gao-noi-dia',
    locationSlug: 'an-giang',
    scopeType: 'province',
    scopeKey: 'AGI',
    provinceCode: 'AGI',
    regionLabel: null,
    locationLabel: 'An Giang',
    category,
    title: 'Giá gạo An Giang hôm nay',
    excerpt: 'Giá gạo An Giang hôm nay được cập nhật từ dữ liệu mới nhất.',
    answerSummary: 'Giá gạo An Giang hôm nay được cập nhật từ dữ liệu mới nhất.',
    topicTags: ['gao', 'thi-truong'],
    thumbnailUrl: '/images/commodities/gao-noi-dia/rice-01.jpg',
    thumbnailAlt: 'Gạo nội địa tại An Giang',
    primaryPriceType: 'farm_gate',
    latestPriceVnd: 12000,
    latestPriceUnit: 'đồng/kg',
    dayChangeVnd: 100,
    dayChangePct: 0.84,
    change7dVnd: 250,
    change7dPct: 2.1,
    minPrice7dVnd: 11750,
    maxPrice7dVnd: 12100,
    observationCount7d: 4,
    latestObservedOn: '2026-05-18',
    publishedAt: '2026-05-18T08:00:00.000Z',
    updatedAt: '2026-05-18T08:10:00.000Z',
    status: 'published',
  }
}

function makeCommodityPageSummary(category: string): GeneratedCommodityPricePageSummary {
  return {
    id: 'commodity-1',
    slug: 'heo-hoi',
    path: '/gia-nong-san/heo-hoi',
    commoditySlug: 'heo-hoi',
    category,
    title: 'Giá heo hơi hôm nay',
    excerpt: 'Giá heo hơi theo vùng hôm nay.',
    answerSummary: 'Giá heo hơi theo vùng hôm nay.',
    topicTags: ['heo-hoi', 'chan-nuoi'],
    thumbnailUrl: '/images/commodities/heo-hoi/adult-pig-farm-01.jpg',
    thumbnailAlt: 'Heo hơi trưởng thành tại trại',
    primaryPriceType: 'farm_gate',
    renderMode: 'regional_table',
    headlineLatestPriceVnd: 69000,
    headlineLatestPriceUnit: 'đồng/kg',
    dayChangeVnd: 500,
    dayChangePct: 0.73,
    change7dVnd: 1200,
    change7dPct: 1.77,
    lowestPriceVnd: 68000,
    highestPriceVnd: 71000,
    priceSpreadVnd: 3000,
    locationCount: 6,
    latestObservedOn: '2026-05-18',
    nationalScopeLabel: null,
    publishedAt: '2026-05-18T07:30:00.000Z',
    updatedAt: '2026-05-18T08:15:00.000Z',
    status: 'published',
  }
}

function makeNewsItem(): ContentFeedItem {
  return {
    kind: 'news',
    path: '/tin-tuc/xuat-khau-gao',
    title: 'Kim ngạch xuất khẩu gạo giữ nhịp tăng',
    excerpt: 'Doanh nghiệp gạo đang theo sát đơn hàng và logistics.',
    thumbnailUrl: null,
    thumbnailAlt: 'Kim ngạch xuất khẩu gạo giữ nhịp tăng',
    publishedAt: '2026-05-18T09:00:00.000Z',
    updatedAt: '2026-05-18T09:00:00.000Z',
    category: 'Xuất khẩu',
    topicTags: ['gao', 'xuat-khau'],
    badgeLabel: 'Xuất khẩu & DN',
    contentFamilySlug: 'xuat-khau-va-doanh-nghiep',
    contentFamilyLabel: 'Xuất khẩu & doanh nghiệp',
    contentFamilyOrder: 3,
    familyPath: '/tin-tuc/nhom/xuat-khau-va-doanh-nghiep',
    subcategoryPath: null,
    priceGroupSlug: null,
    priceGroupLabel: null,
    sourceLabel: 'Công Thương',
    sourceKey: 'congthuong',
  }
}

test('price page maps into Tin giá nông sản and subgroup from category', () => {
  const item = toContentFeedItem(makePricePageSummary('Lương thực'))

  assert.equal(item.kind, 'price_page')
  assert.equal(item.contentFamilySlug, 'tin-gia-nong-san')
  assert.equal(item.priceGroupSlug, 'luong-thuc')
  assert.equal(item.subcategoryPath, '/tin-tuc/nhom/tin-gia-nong-san/luong-thuc')
})

test('commodity price page maps into Tin giá nông sản and subgroup from category', () => {
  const item = toCommodityContentFeedItem(makeCommodityPageSummary('Chăn nuôi'))

  assert.equal(item.kind, 'commodity_price_page')
  assert.equal(item.contentFamilySlug, 'tin-gia-nong-san')
  assert.equal(item.priceGroupSlug, 'chan-nuoi')
  assert.equal(item.familyPath, '/tin-tuc/nhom/tin-gia-nong-san')
})

test('news classifier prioritizes chuyên môn & chính sách before export signals', () => {
  const family = classifyNewsContentFamily({
    sourceKey: 'congthuong',
    category: 'Tiêu chuẩn xuất khẩu',
    title: 'Kỹ thuật và tiêu chuẩn cho vùng trồng mới',
    excerpt: 'Doanh nghiệp vẫn theo sát đơn hàng xuất khẩu.',
    contentText: 'Bài viết tập trung vào kỹ thuật, tiêu chuẩn và chứng nhận.',
    topicTags: ['xuat-khau', 'ky-thuat'],
  })

  assert.equal(family, 'chuyen-mon-va-chinh-sach')
})

test('news classifier maps export signals into export family', () => {
  const family = classifyNewsContentFamily({
    sourceKey: 'vietnambiz',
    category: 'Thị trường',
    title: 'Kim ngạch xuất khẩu nông sản tăng',
    excerpt: 'Logistics và doanh nghiệp hưởng lợi.',
    contentText: 'Bài viết nói về kim ngạch xuất khẩu và doanh nghiệp.',
    topicTags: ['thi-truong', 'xuat-khau'],
  })

  assert.equal(family, 'xuat-khau-va-doanh-nghiep')
})

test('taxonomy and modules keep four families and six public price groups', () => {
  const items: ContentFeedItem[] = [
    makeNewsItem(),
    toContentFeedItem(makePricePageSummary('Lương thực')),
    toCommodityContentFeedItem(makeCommodityPageSummary('Chăn nuôi')),
  ]

  const taxonomy = buildContentTaxonomy(items)
  const modules = buildContentModules(items, {
    family: 'tin-gia-nong-san',
    priceGroup: 'chan-nuoi',
  })

  assert.equal(taxonomy.families.length, 4)
  assert.equal(taxonomy.priceGroups.length, 6)
  assert.equal(taxonomy.priceGroups.find(group => group.slug === 'luong-thuc')?.itemCount, 1)
  assert.equal(taxonomy.priceGroups.find(group => group.slug === 'chan-nuoi')?.itemCount, 1)
  assert.equal(modules.length, 4)
  assert.equal(modules[0]?.familySlug, 'tin-gia-nong-san')
  assert.equal(modules[0]?.subgroups?.length, 6)
  assert.equal(modules[0]?.subgroups?.find(group => group.slug === 'chan-nuoi')?.isCurrent, true)
})

test('content item filters keep price family and subgroup constraints', () => {
  const items: ContentFeedItem[] = [
    makeNewsItem(),
    toContentFeedItem(makePricePageSummary('Lương thực')),
    toCommodityContentFeedItem(makeCommodityPageSummary('Chăn nuôi')),
  ]

  const filtered = filterContentItems(items, {
    family: 'tin-gia-nong-san',
    priceGroup: 'chan-nuoi',
    q: 'heo hơi',
  })

  assert.equal(filtered.length, 1)
  assert.equal(filtered[0]?.kind, 'commodity_price_page')
})
