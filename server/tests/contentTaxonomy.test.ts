import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildContentModules,
  buildContentTaxonomy,
  classifyNewsContentFamily,
  filterContentItems,
} from '../services/contentTaxonomy.js'
import { InvalidContentFeedCursorError, __contentFeedTestUtils } from '../services/contentFeed.js'
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

function makeBlogItem(): ContentFeedItem {
  return {
    kind: 'ai_article',
    path: '/tin-tuc/blog-nong-nghiep-farmer-lua-he-thu',
    title: 'Lich xuong giong lua he thu can luu y gi',
    excerpt: 'Checklist ngan cho nha nong.',
    thumbnailUrl: null,
    thumbnailAlt: 'Lich xuong giong lua he thu can luu y gi',
    publishedAt: '2026-05-18T10:00:00.000Z',
    updatedAt: '2026-05-18T10:00:00.000Z',
    category: 'Blog nha nong',
    topicTags: ['blog-nong-nghiep', 'lua'],
    badgeLabel: 'Blog',
    contentFamilySlug: 'blog-nong-nghiep',
    contentFamilyLabel: 'Blog nong nghiep',
    contentFamilyOrder: 6,
    familyPath: '/tin-tuc/nhom/blog-nong-nghiep',
    subcategoryPath: null,
    priceGroupSlug: null,
    priceGroupLabel: null,
    sourceLabel: 'NongSanVN AI',
    sourceKey: 'nongsanvn_ai',
    articleType: 'agri_blog',
    dataGranularity: 'mixed',
    sortAt: '2026-05-18T10:00:00.000Z',
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

test('taxonomy and modules keep six families and six public price groups', () => {
  const items: ContentFeedItem[] = [
    makeNewsItem(),
    makeBlogItem(),
    toContentFeedItem(makePricePageSummary('Lương thực')),
    toCommodityContentFeedItem(makeCommodityPageSummary('Chăn nuôi')),
  ]

  const taxonomy = buildContentTaxonomy(items)
  const modules = buildContentModules(items, {
    family: 'tin-gia-nong-san',
    priceGroup: 'chan-nuoi',
  })

  assert.equal(taxonomy.families.length, 6)
  assert.equal(taxonomy.priceGroups.length, 6)
  assert.equal(taxonomy.families.find(family => family.slug === 'blog-nong-nghiep')?.itemCount, 1)
  assert.equal(taxonomy.priceGroups.find(group => group.slug === 'luong-thuc')?.itemCount, 1)
  assert.equal(taxonomy.priceGroups.find(group => group.slug === 'chan-nuoi')?.itemCount, 1)
  assert.equal(modules.length, 6)
  assert.equal(modules[0]?.familySlug, 'tin-gia-nong-san')
  assert.equal(modules[0]?.subgroups?.length, 6)
  assert.equal(modules[1]?.familySlug, 'gia-nong-san-the-gioi')
  assert.equal(modules[1]?.subgroups, undefined)
  assert.equal(modules.find(module => module.familySlug === 'blog-nong-nghiep')?.leadItem?.kind, 'ai_article')
  assert.equal(modules[0]?.subgroups?.find(group => group.slug === 'chan-nuoi')?.isCurrent, true)
})

test('content item filters accept blog-nong-nghiep family', () => {
  const filtered = filterContentItems([makeNewsItem(), makeBlogItem()], {
    family: 'blog-nong-nghiep',
    priceGroup: null,
    q: 'lua',
  })

  assert.equal(filtered.length, 1)
  assert.equal(filtered[0]?.kind, 'ai_article')
  assert.equal(filtered[0]?.contentFamilySlug, 'blog-nong-nghiep')
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

test('content feed pagination returns limit, cursor, and non-overlapping next page', () => {
  const first = makeNewsItem()
  const second = {
    ...makeNewsItem(),
    path: '/tin-tuc/second',
    title: 'Second item',
    publishedAt: '2026-05-18T08:00:00.000Z',
    updatedAt: '2026-05-18T08:00:00.000Z',
  }
  const third = {
    ...makeNewsItem(),
    path: '/tin-tuc/third',
    title: 'Third item',
    publishedAt: '2026-05-18T07:00:00.000Z',
    updatedAt: '2026-05-18T07:00:00.000Z',
  }
  const sortedItems = __contentFeedTestUtils.sortContentFeedItems([third, first, second])

  const firstPage = __contentFeedTestUtils.paginateContentFeedItems(sortedItems, 2, undefined)
  const secondPage = __contentFeedTestUtils.paginateContentFeedItems(sortedItems, 2, firstPage.nextCursor ?? undefined)

  assert.equal(firstPage.items.length, 2)
  assert.equal(firstPage.hasMore, true)
  assert.ok(firstPage.nextCursor)
  assert.deepEqual(firstPage.items.map(item => item.path), ['/tin-tuc/xuat-khau-gao', '/tin-tuc/second'])
  assert.deepEqual(secondPage.items.map(item => item.path), ['/tin-tuc/third'])
  assert.equal(secondPage.hasMore, false)
  assert.equal(secondPage.nextCursor, null)
})

test('content feed cursor tie-breaks items with the same timestamp', () => {
  const news = makeNewsItem()
  const pricePage = {
    ...toContentFeedItem(makePricePageSummary('Lương thực')),
    updatedAt: news.publishedAt,
    publishedAt: news.publishedAt,
  }
  const commodityPage = {
    ...toCommodityContentFeedItem(makeCommodityPageSummary('Chăn nuôi')),
    updatedAt: news.publishedAt,
    publishedAt: news.publishedAt,
  }
  const sortedItems = __contentFeedTestUtils.sortContentFeedItems([news, pricePage, commodityPage])
  const firstPage = __contentFeedTestUtils.paginateContentFeedItems(sortedItems, 1, undefined)
  const secondPage = __contentFeedTestUtils.paginateContentFeedItems(sortedItems, 2, firstPage.nextCursor ?? undefined)

  assert.deepEqual(sortedItems.map(item => item.kind), ['commodity_price_page', 'news', 'price_page'])
  assert.deepEqual(secondPage.items.map(item => item.kind), ['news', 'price_page'])
})

test('content feed pagination applies filters before cursor paging', () => {
  const items: ContentFeedItem[] = [
    makeNewsItem(),
    toContentFeedItem(makePricePageSummary('Lương thực')),
    toCommodityContentFeedItem(makeCommodityPageSummary('Chăn nuôi')),
  ]
  const filtered = filterContentItems(__contentFeedTestUtils.sortContentFeedItems(items), {
    family: 'tin-gia-nong-san',
    priceGroup: 'chan-nuoi',
    q: 'heo hơi',
  })
  const page = __contentFeedTestUtils.paginateContentFeedItems(filtered, 1, undefined)

  assert.equal(page.items.length, 1)
  assert.equal(page.items[0]?.kind, 'commodity_price_page')
  assert.equal(page.hasMore, false)
})

test('content feed rejects malformed cursors', () => {
  assert.throws(
    () => __contentFeedTestUtils.decodeContentFeedCursor('not-a-cursor'),
    InvalidContentFeedCursorError,
  )
})
