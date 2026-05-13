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

function createHiddenClassification(topicTags: string[]): ArticleClassification {
  return {
    status: 'archived',
    hideFromNewsFeed: true,
    topicTags,
    kind: 'news',
    priceDataTarget: null,
  }
}

function hasAnyFragment(value: string, fragments: string[]) {
  return fragments.some(fragment => value.includes(fragment))
}

function startsWithCompanyName(value: string) {
  return (
    value.startsWith('cong ty ') ||
    value.startsWith('cty ') ||
    value.startsWith('doanh nghiep tu nhan ') ||
    value.startsWith('company ')
  )
}

function classifyVietnamBizArticle(input: Omit<ArticleLike, 'sourceKey'>): ArticleClassification {
  const title = foldText(input.title ?? '')
  const excerpt = foldText(input.excerpt ?? '')
  const canonicalUrl = foldText(input.canonicalUrl ?? '')
  const contentText = foldText(input.contentText ?? '')

  const isTopicHub =
    excerpt.includes('chu de:') ||
    excerpt.includes('tong hop bai viet') ||
    title.startsWith('chu de ') ||
    contentText.includes('trach nhiem ve thong tin') ||
    contentText.includes('tong hop bai viet') ||
    (!/-\d{6,}\.htm$/.test(canonicalUrl) && canonicalUrl.endsWith('.htm'))

  if (isTopicHub) {
    return createHiddenClassification(['vietnambiz-topic-hub'])
  }

  return createDefaultClassification()
}

function classifyVpsaSpiceArticle(input: Omit<ArticleLike, 'sourceKey'>): ArticleClassification {
  const title = foldText(input.title ?? '')
  const excerpt = foldText(input.excerpt ?? '')
  const canonicalUrl = foldText(input.canonicalUrl ?? '')
  const contentText = foldText(input.contentText ?? '')

  const isLoginOrMemberPage =
    canonicalUrl.includes('/log-in') ||
    canonicalUrl.includes('membership-registration') ||
    title.startsWith('log-in ') ||
    excerpt.includes('please enter your username and password') ||
    contentText.includes('please enter your username and password') ||
    contentText.includes("don't have a membership") ||
    contentText.includes('membership registration')

  if (isLoginOrMemberPage) {
    return createHiddenClassification(['vpsa-login-required'])
  }

  return createDefaultClassification()
}

export function classifyVietfoodArticle(input: VietfoodArticleLike): ArticleClassification {
  const title = foldText(input.title ?? '')
  const category = foldText(input.category ?? '')
  const canonicalUrl = foldText(input.canonicalUrl ?? '')
  const excerpt = foldText(input.excerpt ?? '')
  const contentText = foldText(input.contentText ?? '')
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

  const hasMemberCategory = hasAnyFragment(category, ['hoi vien', 'danh sach hoi vien'])
  const hasMemberDirectoryUrl = hasAnyFragment(canonicalUrl, [
    'danh-sach-hoi-vien',
    '/hoi-vien/',
    '/member/',
  ])
  const hasCompanyTitle =
    startsWithCompanyName(title) ||
    title.includes(' company limited') ||
    title.includes(' - hiep hoi luong thuc viet nam')
  const hasCompanyProfileSignals =
    hasAnyFragment(title, ['tnhh', 'co phan', 'cp ', 'xnk', 'hang hai', 'panoramas', 'vienduong', 'tnm']) ||
    hasAnyFragment(excerpt, ['dia chi', 'company limited']) ||
    hasAnyFragment(contentText, ['dia chi:', 'danh sach hoi vien', 'hoi vien noi bat'])

  const isMemberOrCompanyProfile =
    hasMemberCategory ||
    hasMemberDirectoryUrl ||
    (hasCompanyTitle && hasCompanyProfileSignals)

  if (isMemberOrCompanyProfile) {
    return createHiddenClassification(['vietfood-member-directory'])
  }

  return createDefaultClassification()
}

export function classifyNewsArticle(input: ArticleLike): ArticleClassification {
  if (input.sourceKey === 'vietnambiz') {
    return classifyVietnamBizArticle(input)
  }

  if (input.sourceKey === 'vpsaspice') {
    return classifyVpsaSpiceArticle(input)
  }

  if (input.sourceKey === 'vietfood') {
    return classifyVietfoodArticle(input)
  }

  return createDefaultClassification()
}

export function isNewsFeedArticleVisible(input: ArticleLike) {
  return !classifyNewsArticle(input).hideFromNewsFeed
}
