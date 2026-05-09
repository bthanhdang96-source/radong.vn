import { foldText } from '../crawlers/common.js'
import type { NewsArticleStatus, NewsSourceKey } from './types.js'

type ArticleLike = {
  sourceKey: NewsSourceKey
  title?: string | null
  category?: string | null
  canonicalUrl?: string | null
  excerpt?: string | null
  contentText?: string | null
}

type VietfoodArticleLike = Omit<ArticleLike, 'sourceKey'>

export type ArticleClassification = {
  status: NewsArticleStatus
  hideFromNewsFeed: boolean
  topicTags: string[]
  kind: 'news' | 'price_bulletin' | 'price_roundup' | 'weekly_bulletin'
  priceDataTarget: 'vn_domestic_rice' | 'rice_export_reference' | null
}

function createDefaultClassification(): ArticleClassification {
  return {
    status: 'published',
    hideFromNewsFeed: false,
    topicTags: [],
    kind: 'news',
    priceDataTarget: null,
  }
}

export function classifyVietfoodArticle(input: VietfoodArticleLike): ArticleClassification {
  const title = foldText(input.title ?? '')
  const category = foldText(input.category ?? '')
  const canonicalUrl = foldText(input.canonicalUrl ?? '')
  const isDomesticPriceBulletin =
    title.includes('gia lua gao noi dia ngay') ||
    canonicalUrl.includes('gia-lua-gao-noi-dia-ngay-') ||
    category.includes('gia noi dia')

  if (isDomesticPriceBulletin) {
    return {
      status: 'archived',
      hideFromNewsFeed: true,
      topicTags: ['price-bulletin', 'vietfood-price', 'vietfood-domestic-rice'],
      kind: 'price_bulletin',
      priceDataTarget: 'vn_domestic_rice',
    }
  }

  const isExportPriceBulletin =
    title.includes('gia gao xuat khau cua cac nuoc tren the gioi ngay') ||
    canonicalUrl.includes('gia-gao-xuat-khau-cua-cac-nuoc-tren-the-gioi-ngay-') ||
    category.includes('gia xuat khau')

  if (isExportPriceBulletin) {
    return {
      status: 'archived',
      hideFromNewsFeed: true,
      topicTags: ['price-bulletin', 'vietfood-price', 'vietfood-export-rice'],
      kind: 'price_bulletin',
      priceDataTarget: 'rice_export_reference',
    }
  }

  const isWeeklyBulletin = title.startsWith('ban tin so ') || category.includes('ban tin tuan')
  if (isWeeklyBulletin) {
    return {
      status: 'archived',
      hideFromNewsFeed: true,
      topicTags: ['weekly-bulletin', 'vietfood-bulletin'],
      kind: 'weekly_bulletin',
      priceDataTarget: null,
    }
  }

  const isDailyPriceRoundup =
    title.includes('gia lua gao hom nay') ||
    canonicalUrl.includes('gia-lua-gao-hom-nay-')

  if (isDailyPriceRoundup) {
    return {
      status: 'archived',
      hideFromNewsFeed: true,
      topicTags: ['price-roundup', 'vietfood-price'],
      kind: 'price_roundup',
      priceDataTarget: null,
    }
  }

  return createDefaultClassification()
}

export function classifyNewsArticle(input: ArticleLike): ArticleClassification {
  if (input.sourceKey === 'vietfood') {
    return classifyVietfoodArticle(input)
  }

  return createDefaultClassification()
}

export function isNewsFeedArticleVisible(input: ArticleLike) {
  return !classifyNewsArticle(input).hideFromNewsFeed
}
