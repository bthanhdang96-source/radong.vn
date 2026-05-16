import { foldText } from '../crawlers/common.js'
import { normalizeDisplayRegion, PROVINCE_NAME_BY_CODE, VN_COMMODITY_META } from '../marketDataMappings.js'
import { getSupabaseAdminClient, getSupabaseReadClient, getSupabaseRuntimeStatus } from '../supabaseClient.js'
import type {
  ContentFeedItem,
  GeneratedPricePageDetail,
  GeneratedPricePageGenerateOptions,
  GeneratedPricePageGenerateResult,
  GeneratedPricePageSummary,
  PricePageFaqItem,
  PricePagePrimaryPriceType,
  PricePageScopeType,
  PricePageSeoMeta,
  PricePageStatus,
} from './types.js'

type CommodityRow = {
  slug: string
  name_vi: string
  category: string | null
}

type ProvinceRow = {
  code: string
  name_vi: string
}

type LatestObservationRow = {
  recorded_at: string
  commodity_slug: string
  province_code: string | null
  price_type: PricePagePrimaryPriceType | null
  variety: string | null
  market_name: string | null
  raw_payload: {
    region?: string | null
  } | null
}

type ObservationWindowRow = {
  recorded_at: string
  commodity_slug: string
  province_code: string | null
  price_type: PricePagePrimaryPriceType | null
  price_vnd: number | null
  confidence: number
  variety: string | null
  market_name: string | null
  raw_payload: {
    region?: string | null
  } | null
}

type RegionalPriceRow = {
  commodity_slug: string
  price_type: PricePagePrimaryPriceType
  province_code: string
  vs_national_avg_pct: number | null
}

type TrendRow = {
  commodity_slug: string
  price_type: PricePagePrimaryPriceType
  trend_7d_pct: number | null
  trend_30d_pct: number | null
  volatility_pct: number | null
}

type GeneratedPricePageRow = {
  id: string
  slug: string
  commodity_slug: string
  location_slug: string
  scope_type: PricePageScopeType
  scope_key: string
  province_code: string | null
  region_label: string | null
  category: string | null
  title: string
  excerpt: string
  answer_summary: string
  body_html: string
  body_text: string
  faq_json: unknown
  seo_json: unknown
  topic_tags: string[] | null
  thumbnail_url: string | null
  primary_price_type: PricePagePrimaryPriceType
  latest_price_vnd: number
  latest_price_unit: string
  day_change_vnd: number
  day_change_pct: number
  change_7d_vnd: number
  change_7d_pct: number
  min_price_7d_vnd: number
  max_price_7d_vnd: number
  observation_count_7d: number
  latest_observed_on: string
  metrics_json: {
    locationLabel?: string
  } | null
  published_at: string | null
  updated_at: string
  status: PricePageStatus
}

type ScopeInfo = {
  scopeType: PricePageScopeType
  scopeKey: string
  provinceCode: string | null
  regionLabel: string | null
  locationLabel: string
  locationSlug: string
}

type DailyBucket = {
  sum: number
  count: number
  min: number
  max: number
}

type CandidatePage = {
  commoditySlug: string
  commodityName: string
  category: string | null
  scope: ScopeInfo
  primaryPriceType: PricePagePrimaryPriceType
  latestDate: string
  latestPriceVnd: number
  dayChangeVnd: number
  dayChangePct: number
  change7dVnd: number
  change7dPct: number
  minPrice7dVnd: number
  maxPrice7dVnd: number
  observationCount7d: number
  vsNationalAvgPct: number | null
  trend7dPct: number | null
  trend30dPct: number | null
  volatilityPct: number | null
}

const PRICE_PAGE_PREFIX = '/gia-nong-san'
const PRICE_TYPE_PRIORITY: PricePagePrimaryPriceType[] = ['farm_gate', 'wholesale', 'retail', 'export']
const STALE_STATUS = 'stale' satisfies PricePageStatus
const DEFAULT_PRICE_PAGE_THUMBNAIL =
  'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80'
const COMMODITY_THUMBNAILS: Record<string, string> = {
  'ca-phe-robusta':
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=80',
  'ho-tieu':
    'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=1200&q=80',
  'heo-hoi':
    'https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=1200&q=80',
  'gao-noi-dia':
    'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=1200&q=80',
  cashew:
    'https://images.unsplash.com/photo-1502741338009-cac2772e18bc?auto=format&fit=crop&w=1200&q=80',
  cocoa:
    'https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=1200&q=80',
  'ca-tra':
    'https://images.unsplash.com/photo-1544943910-4c1dc44aab44?auto=format&fit=crop&w=1200&q=80',
  'cam-sanh':
    'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&w=1200&q=80',
  'buoi-nam-roi':
    'https://images.unsplash.com/photo-1577234286642-fc512a5f8f11?auto=format&fit=crop&w=1200&q=80',
  'ca-chua':
    'https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=1200&q=80',
  'hanh-tay':
    'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=1200&q=80',
  toi:
    'https://images.unsplash.com/photo-1615477550927-6ecbea4c983b?auto=format&fit=crop&w=1200&q=80',
  'khoai-tay':
    'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=1200&q=80',
  'bap-cai':
    'https://images.unsplash.com/photo-1615485925873-924ea8f8ec96?auto=format&fit=crop&w=1200&q=80',
  'rau-muong':
    'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=80',
  'cai-xanh':
    'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=1200&q=80',
  ot:
    'https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?auto=format&fit=crop&w=1200&q=80',
  'bi-do':
    'https://images.unsplash.com/photo-1502741338009-cac2772e18bc?auto=format&fit=crop&w=1200&q=80',
  'khoai-lang':
    'https://images.unsplash.com/photo-1596097635121-14b38c5d4d8b?auto=format&fit=crop&w=1200&q=80',
  xoai:
    'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=1200&q=80',
  chuoi:
    'https://images.unsplash.com/photo-1603833665858-e61d17a86224?auto=format&fit=crop&w=1200&q=80',
  mit:
    'https://images.unsplash.com/photo-1621961458348-f013d219b50c?auto=format&fit=crop&w=1200&q=80',
  'thit-heo':
    'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=1200&q=80',
  shrimp:
    'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=1200&q=80',
  pangasius:
    'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?auto=format&fit=crop&w=1200&q=80',
  corn:
    'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=1200&q=80',
  soybeans:
    'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=1200&q=80',
  'rubber-rss3':
    'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80',
  'rubber-tsr20':
    'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80',
}
const DISPLAY_LABEL_ALIASES: Record<string, string> = {
  'viet nam': 'Việt Nam',
  cam: 'Cám',
  'cl 555': 'CL 555',
  'ir 504': 'IR 504',
  'ir 50404': 'IR 50404',
  'om 18': 'OM 18',
  'om 34': 'OM 34',
  'om 380': 'OM 380',
  'om 5451': 'OM 5451',
  'soc thom': 'Sóc Thơm',
  'tam 3,4': 'Tấm 3,4',
  'tam 3 4': 'Tấm 3,4',
  'tam thom 504': 'Tấm Thơm 504',
}

function isRelationMissing(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return code === 'PGRST205' || code === 'PGRST204' || message.includes('relation') || message.includes('does not exist')
}

function isPriceType(value: string | null | undefined): value is PricePagePrimaryPriceType {
  return value === 'farm_gate' || value === 'wholesale' || value === 'retail' || value === 'export'
}

function roundNumber(value: number, digits = 2) {
  return Number(value.toFixed(digits))
}

function dateKeyFromIso(value: string) {
  return value.slice(0, 10)
}

function addDays(dateKey: string, offsetDays: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function formatFullDate(dateKey: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${dateKey}T00:00:00.000Z`))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString('vi-VN')} đồng/kg`
}

function formatSignedCurrency(value: number) {
  const prefix = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${prefix}${Math.abs(Math.round(value)).toLocaleString('vi-VN')} đồng/kg`
}

function formatSignedPercent(value: number) {
  const prefix = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${prefix}${Math.abs(roundNumber(value, 2)).toLocaleString('vi-VN')}%`
}

function slugify(value: string) {
  return foldText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeDisplayLabel(value: string) {
  const normalized = normalizeDisplayRegion(value.trim())
  return DISPLAY_LABEL_ALIASES[foldText(normalized)] ?? normalized
}

function getCommodityDisplayName(slug: string, fallbackName: string) {
  return VN_COMMODITY_META[slug]?.commodityName ?? normalizeDisplayLabel(fallbackName)
}

function getCommodityCategory(slug: string, fallbackCategory: string | null) {
  return VN_COMMODITY_META[slug]?.category ?? fallbackCategory
}

function getCommodityThumbnailUrl(slug: string) {
  return COMMODITY_THUMBNAILS[slug] ?? DEFAULT_PRICE_PAGE_THUMBNAIL
}

function buildScopeCacheKey(commoditySlug: string, scopeType: PricePageScopeType, scopeKey: string) {
  return `${commoditySlug}::${scopeType}::${scopeKey}`
}

function buildDailyBucketKey(pageKey: string, priceType: PricePagePrimaryPriceType, dateKey: string) {
  return `${pageKey}::${priceType}::${dateKey}`
}

export function buildGeneratedPricePagePath(commoditySlug: string, locationSlug: string) {
  return `${PRICE_PAGE_PREFIX}/${commoditySlug}/${locationSlug}`
}

function getPriceTypeLabel(value: PricePagePrimaryPriceType) {
  switch (value) {
  case 'farm_gate':
    return 'giá thu mua'
  case 'wholesale':
    return 'giá sỉ'
  case 'retail':
    return 'giá bán lẻ'
  case 'export':
    return 'giá xuất khẩu quy đổi'
  }
}

function getMovementLabel(value: number) {
  if (Math.abs(value) < 0.3) {
    return 'đi ngang'
  }

  return value > 0 ? 'tăng' : 'giảm'
}

function getMovementNarrative(value: number) {
  const label = getMovementLabel(value)
  if (label === 'đi ngang') {
    return 'đi ngang so với mốc đối chiếu'
  }

  return `${label} ${Math.abs(roundNumber(value, 2)).toLocaleString('vi-VN')}%`
}

function maybeTruncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`
}

function deriveScope(row: {
  province_code: string | null
  variety: string | null
  market_name: string | null
  raw_payload: { region?: string | null } | null
}, provinceLookup: Map<string, string>): ScopeInfo | null {
  if (row.province_code) {
    const locationLabel = normalizeDisplayLabel(
      PROVINCE_NAME_BY_CODE[row.province_code] ?? provinceLookup.get(row.province_code) ?? row.province_code,
    )
    return {
      scopeType: 'province',
      scopeKey: row.province_code,
      provinceCode: row.province_code,
      regionLabel: null,
      locationLabel,
      locationSlug: slugify(locationLabel),
    }
  }

  const rawRegion = row.raw_payload?.region ?? row.market_name ?? row.variety
  if (!rawRegion || rawRegion.trim().length === 0) {
    return null
  }

  const locationLabel = normalizeDisplayLabel(rawRegion.trim())
  return {
    scopeType: 'region_label',
    scopeKey: foldText(locationLabel),
    provinceCode: null,
    regionLabel: locationLabel,
    locationLabel,
    locationSlug: slugify(locationLabel),
  }
}

function summarizeDirection(dayChangePct: number, change7dPct: number) {
  if (getMovementLabel(dayChangePct) !== 'đi ngang' && getMovementLabel(change7dPct) !== 'đi ngang' && dayChangePct * change7dPct < 0) {
    return 'Biến động trong ngày đang đi ngược nhịp 7 ngày, cho thấy dấu hiệu đảo chiều ngắn hạn.'
  }

  return null
}

function parseFaqJson(input: unknown): PricePageFaqItem[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const question = 'question' in item && typeof item.question === 'string' ? item.question : null
      const answer = 'answer' in item && typeof item.answer === 'string' ? item.answer : null
      if (!question || !answer) {
        return null
      }

      return { question, answer }
    })
    .filter((item): item is PricePageFaqItem => Boolean(item))
}

function parseSeoJson(input: unknown, fallback: PricePageSeoMeta): PricePageSeoMeta {
  if (!input || typeof input !== 'object') {
    return fallback
  }

  return {
    title: typeof (input as Record<string, unknown>).title === 'string' ? ((input as Record<string, unknown>).title as string) : fallback.title,
    description:
      typeof (input as Record<string, unknown>).description === 'string'
        ? ((input as Record<string, unknown>).description as string)
        : fallback.description,
    canonicalPath:
      typeof (input as Record<string, unknown>).canonicalPath === 'string'
        ? ((input as Record<string, unknown>).canonicalPath as string)
        : fallback.canonicalPath,
    ogTitle:
      typeof (input as Record<string, unknown>).ogTitle === 'string'
        ? ((input as Record<string, unknown>).ogTitle as string)
        : fallback.ogTitle,
    ogDescription:
      typeof (input as Record<string, unknown>).ogDescription === 'string'
        ? ((input as Record<string, unknown>).ogDescription as string)
        : fallback.ogDescription,
    noindex:
      typeof (input as Record<string, unknown>).noindex === 'boolean'
        ? ((input as Record<string, unknown>).noindex as boolean)
        : fallback.noindex,
  }
}

function toSummary(row: GeneratedPricePageRow): GeneratedPricePageSummary {
  const locationLabel = row.metrics_json?.locationLabel ?? row.region_label ?? row.province_code ?? row.scope_key

  return {
    id: row.id,
    slug: row.slug,
    path: buildGeneratedPricePagePath(row.commodity_slug, row.location_slug),
    commoditySlug: row.commodity_slug,
    locationSlug: row.location_slug,
    scopeType: row.scope_type,
    scopeKey: row.scope_key,
    provinceCode: row.province_code,
    regionLabel: row.region_label,
    locationLabel,
    category: row.category,
    title: row.title,
    excerpt: row.excerpt,
    answerSummary: row.answer_summary,
    topicTags: row.topic_tags ?? [],
    thumbnailUrl: row.thumbnail_url,
    primaryPriceType: row.primary_price_type,
    latestPriceVnd: row.latest_price_vnd,
    latestPriceUnit: row.latest_price_unit,
    dayChangeVnd: row.day_change_vnd,
    dayChangePct: row.day_change_pct,
    change7dVnd: row.change_7d_vnd,
    change7dPct: row.change_7d_pct,
    minPrice7dVnd: row.min_price_7d_vnd,
    maxPrice7dVnd: row.max_price_7d_vnd,
    observationCount7d: row.observation_count_7d,
    latestObservedOn: row.latest_observed_on,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    status: row.status,
  }
}

function buildPageCopy(page: CandidatePage) {
  const path = buildGeneratedPricePagePath(page.commoditySlug, page.scope.locationSlug)
  const priceTypeLabel = getPriceTypeLabel(page.primaryPriceType)
  const latestDateLabel = formatFullDate(page.latestDate)
  const dayDirection = getMovementLabel(page.dayChangePct)
  const sevenDayDirection = getMovementLabel(page.change7dPct)
  const nationalComparison =
    typeof page.vsNationalAvgPct === 'number'
      ? page.vsNationalAvgPct > 0
        ? `cao hơn mức bình quân cùng loại khoảng ${Math.abs(roundNumber(page.vsNationalAvgPct, 1)).toLocaleString('vi-VN')}%.`
        : page.vsNationalAvgPct < 0
          ? `thấp hơn mức bình quân cùng loại khoảng ${Math.abs(roundNumber(page.vsNationalAvgPct, 1)).toLocaleString('vi-VN')}%.`
          : 'đang bám sát mặt bằng chung của cùng loại.'
      : 'hiện chưa đủ dữ liệu đối chiếu với mặt bằng chung của cùng loại.'
  const shortReversalNote = summarizeDirection(page.dayChangePct, page.change7dPct)

  const title = maybeTruncate(
    `Giá ${page.commodityName} ${page.scope.locationLabel} hôm nay: ${dayDirection} ${Math.abs(Math.round(page.dayChangeVnd)).toLocaleString('vi-VN')} đồng/kg`,
    150,
  )
  const answerSummary = `${priceTypeLabel.charAt(0).toUpperCase()}${priceTypeLabel.slice(1)} của ${page.commodityName} tại ${page.scope.locationLabel} ngày ${latestDateLabel} ở mức ${formatCurrency(page.latestPriceVnd)}, ${dayDirection} ${Math.abs(Math.round(page.dayChangeVnd)).toLocaleString('vi-VN')} đồng/kg so với hôm qua (${formatSignedPercent(page.dayChangePct)}). So với mức trung bình 7 ngày, giá hiện ${sevenDayDirection === 'đi ngang' ? 'gần như đi ngang' : `${sevenDayDirection} ${Math.abs(Math.round(page.change7dVnd)).toLocaleString('vi-VN')} đồng/kg`} (${formatSignedPercent(page.change7dPct)}).`
  const excerpt = maybeTruncate(
    `${answerSummary} Biên độ 7 ngày đang nằm trong khoảng ${formatCurrency(page.minPrice7dVnd)} đến ${formatCurrency(page.maxPrice7dVnd)}.`,
    180,
  )

  const paragraphs = [
    answerSummary,
    `Trong phiên cập nhật ${latestDateLabel}, ${priceTypeLabel} của ${page.commodityName} tại ${page.scope.locationLabel} ghi nhận ${formatCurrency(page.latestPriceVnd)}. So với phiên trước đó, mức giá hiện ${getMovementNarrative(page.dayChangePct)} với chênh lệch tuyệt đối ${formatSignedCurrency(page.dayChangeVnd)}.`,
    `Nhìn trong cửa sổ 7 ngày gần nhất, mức giá hiện ${getMovementNarrative(page.change7dPct)} so với trung bình 7 ngày và dao động trong vùng ${formatCurrency(page.minPrice7dVnd)} đến ${formatCurrency(page.maxPrice7dVnd)}. Tổng số điểm quan sát dùng cho phép tính là ${page.observationCount7d.toLocaleString('vi-VN')}.`,
    `Nếu so theo vị thế nội vùng, ${page.commodityName} tại ${page.scope.locationLabel} ${nationalComparison}`,
    shortReversalNote,
  ].filter((paragraph): paragraph is string => Boolean(paragraph))

  const faq: PricePageFaqItem[] = [
    {
      question: `Giá ${page.commodityName} ${page.scope.locationLabel} hôm nay là bao nhiêu?`,
      answer: `${priceTypeLabel.charAt(0).toUpperCase()}${priceTypeLabel.slice(1)} hiện ở mức ${formatCurrency(page.latestPriceVnd)} theo dữ liệu cập nhật ngày ${latestDateLabel}.`,
    },
    {
      question: `Giá ${page.commodityName} ${page.scope.locationLabel} tăng hay giảm so với hôm qua?`,
      answer:
        dayDirection === 'đi ngang'
          ? `Giá gần như đi ngang so với hôm qua, chênh lệch ${formatSignedCurrency(page.dayChangeVnd)} tương đương ${formatSignedPercent(page.dayChangePct)}.`
          : `Giá đang ${dayDirection} ${formatSignedCurrency(page.dayChangeVnd)} so với hôm qua, tương đương ${formatSignedPercent(page.dayChangePct)}.`,
    },
    {
      question: `Xu hướng 7 ngày của giá ${page.commodityName} tại ${page.scope.locationLabel} ra sao?`,
      answer:
        sevenDayDirection === 'đi ngang'
          ? `So với trung bình 7 ngày, giá hiện gần như đi ngang. Biên độ 7 ngày đang nằm trong khoảng ${formatCurrency(page.minPrice7dVnd)} đến ${formatCurrency(page.maxPrice7dVnd)}.`
          : `So với trung bình 7 ngày, giá hiện ${sevenDayDirection} ${formatSignedCurrency(page.change7dVnd)} (${formatSignedPercent(page.change7dPct)}). Biên độ 7 ngày là ${formatCurrency(page.minPrice7dVnd)} đến ${formatCurrency(page.maxPrice7dVnd)}.`,
    },
  ]

  const bodyHtml = [
    `<section><h2>Tóm tắt nhanh</h2><p>${answerSummary}</p></section>`,
    `<section><h2>So với hôm qua</h2><p>${paragraphs[1]}</p></section>`,
    `<section><h2>Xu hướng 7 ngày</h2><p>${paragraphs[2]}</p></section>`,
    `<section><h2>So với mặt bằng chung</h2><p>${paragraphs[3]}</p></section>`,
    shortReversalNote ? `<section><h2>Tín hiệu ngắn hạn</h2><p>${shortReversalNote}</p></section>` : '',
    `<section><h2>Câu hỏi thường gặp</h2>${faq
      .map(item => `<article><h3>${item.question}</h3><p>${item.answer}</p></article>`)
      .join('')}</section>`,
    `<section><h2>Theo dõi thêm</h2><p>Xem thêm bảng giá tổng hợp tại <a href="/bang-gia">/bang-gia</a> và chênh lệch các khâu tại <a href="/chuoi-gia">/chuoi-gia</a>.</p></section>`,
  ]
    .filter(Boolean)
    .join('')

  const bodyText = paragraphs.concat(
    faq.map(item => `${item.question} ${item.answer}`),
    ['Xem thêm bảng giá tổng hợp tại /bang-gia và chuỗi giá tại /chuoi-gia.'],
  ).join('\n\n')

  const seo: PricePageSeoMeta = {
    title,
    description: excerpt,
    canonicalPath: path,
    ogTitle: title,
    ogDescription: excerpt,
    noindex: false,
  }

  return {
    title,
    excerpt,
    answerSummary,
    bodyHtml,
    bodyText,
    faq,
    seo,
  }
}

async function loadGenerationInputs() {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const latestRowsPromise = client
    .from('latest_observation_details')
    .select('recorded_at, commodity_slug, province_code, price_type, variety, market_name, raw_payload')

  const observationsPromise = client
    .from('price_observations')
    .select('recorded_at, commodity_slug, province_code, price_type, price_vnd, confidence, variety, market_name, raw_payload')
    .gte('recorded_at', new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString())
    .gte('confidence', 0.5)

  const [latestRowsResponse, observationResponse, commodityResponse, provinceResponse, regionalPriceResponse, trendResponse] =
    await Promise.all([
      latestRowsPromise,
      observationsPromise,
      client.from('commodities').select('slug, name_vi, category'),
      client.from('provinces').select('code, name_vi'),
      client.from('regional_price_map').select('commodity_slug, price_type, province_code, vs_national_avg_pct'),
      client.from('commodity_trends').select('commodity_slug, price_type, trend_7d_pct, trend_30d_pct, volatility_pct'),
    ])

  if (latestRowsResponse.error) {
    throw latestRowsResponse.error
  }

  if (observationResponse.error) {
    throw observationResponse.error
  }

  if (commodityResponse.error) {
    throw commodityResponse.error
  }

  if (provinceResponse.error) {
    throw provinceResponse.error
  }

  if (regionalPriceResponse.error && !isRelationMissing(regionalPriceResponse.error)) {
    throw regionalPriceResponse.error
  }

  if (trendResponse.error && !isRelationMissing(trendResponse.error)) {
    throw trendResponse.error
  }

  return {
    latestRows: (latestRowsResponse.data ?? []) as LatestObservationRow[],
    observations: ((observationResponse.data ?? []) as ObservationWindowRow[]).filter(
      row => row.price_vnd !== null && Number.isFinite(row.price_vnd),
    ),
    commodities: (commodityResponse.data ?? []) as CommodityRow[],
    provinces: (provinceResponse.data ?? []) as ProvinceRow[],
    regionalPrices: (regionalPriceResponse.data ?? []) as RegionalPriceRow[],
    trends: (trendResponse.data ?? []) as TrendRow[],
  }
}

function buildCandidatePages(
  inputs: NonNullable<Awaited<ReturnType<typeof loadGenerationInputs>>>,
  options: GeneratedPricePageGenerateOptions,
) {
  if (inputs.latestRows.length === 0) {
    return []
  }

  const provinceLookup = new Map(inputs.provinces.map(province => [province.code, province.name_vi]))
  const commodityLookup = new Map(inputs.commodities.map(commodity => [commodity.slug, commodity]))
  const regionalPriceLookup = new Map(
    inputs.regionalPrices.map(row => [`${row.commodity_slug}::${row.price_type}::${row.province_code}`, row]),
  )
  const trendLookup = new Map(inputs.trends.map(row => [`${row.commodity_slug}::${row.price_type}`, row]))
  const latestDate = inputs.latestRows.reduce(
    (currentLatest, row) => (row.recorded_at > currentLatest ? row.recorded_at : currentLatest),
    inputs.latestRows[0]?.recorded_at ?? new Date().toISOString(),
  )
  const latestDateKey = dateKeyFromIso(latestDate)
  const yesterdayDateKey = addDays(latestDateKey, -1)
  const sevenDayStartKey = addDays(latestDateKey, -6)

  const candidatePageKeys = new Set<string>()
  const pageInfoLookup = new Map<string, { commoditySlug: string; scope: ScopeInfo }>()
  for (const row of inputs.latestRows.filter(item => dateKeyFromIso(item.recorded_at) === latestDateKey)) {
    if (!isPriceType(row.price_type)) {
      continue
    }

    const scope = deriveScope(row, provinceLookup)
    if (!scope) {
      continue
    }

    if (options.commoditySlug && row.commodity_slug !== options.commoditySlug) {
      continue
    }

    if (options.scopeType && scope.scopeType !== options.scopeType) {
      continue
    }

    if (options.scopeKey && scope.scopeKey !== options.scopeKey) {
      continue
    }

    const pageKey = buildScopeCacheKey(row.commodity_slug, scope.scopeType, scope.scopeKey)
    candidatePageKeys.add(pageKey)
    pageInfoLookup.set(pageKey, { commoditySlug: row.commodity_slug, scope })
  }

  const bucketLookup = new Map<string, DailyBucket>()
  const windowObservationCounts = new Map<string, number>()
  for (const row of inputs.observations) {
    if (!isPriceType(row.price_type) || row.price_vnd === null) {
      continue
    }

    const scope = deriveScope(row, provinceLookup)
    if (!scope) {
      continue
    }

    const pageKey = buildScopeCacheKey(row.commodity_slug, scope.scopeType, scope.scopeKey)
    if (!candidatePageKeys.has(pageKey)) {
      continue
    }

    const rowDateKey = dateKeyFromIso(row.recorded_at)
    if (rowDateKey < sevenDayStartKey || rowDateKey > latestDateKey) {
      continue
    }

    const bucketKey = buildDailyBucketKey(pageKey, row.price_type, rowDateKey)
    const existing = bucketLookup.get(bucketKey) ?? {
      sum: 0,
      count: 0,
      min: row.price_vnd,
      max: row.price_vnd,
    }
    existing.sum += row.price_vnd
    existing.count += 1
    existing.min = Math.min(existing.min, row.price_vnd)
    existing.max = Math.max(existing.max, row.price_vnd)
    bucketLookup.set(bucketKey, existing)

    const windowCountKey = `${pageKey}::${row.price_type}`
    windowObservationCounts.set(windowCountKey, (windowObservationCounts.get(windowCountKey) ?? 0) + 1)
  }

  const pages: CandidatePage[] = []
  for (const pageKey of candidatePageKeys) {
    const pageInfo = pageInfoLookup.get(pageKey)
    if (!pageInfo) {
      continue
    }

    const commodity = commodityLookup.get(pageInfo.commoditySlug)
    if (!commodity) {
      continue
    }

    const selectedPriceType = PRICE_TYPE_PRIORITY.find(priceType => {
      const latestBucket = bucketLookup.get(buildDailyBucketKey(pageKey, priceType, latestDateKey))
      const yesterdayBucket = bucketLookup.get(buildDailyBucketKey(pageKey, priceType, yesterdayDateKey))
      const windowCount = windowObservationCounts.get(`${pageKey}::${priceType}`) ?? 0
      return Boolean(latestBucket && yesterdayBucket && windowCount >= 3)
    })

    if (!selectedPriceType) {
      continue
    }

    const latestBucket = bucketLookup.get(buildDailyBucketKey(pageKey, selectedPriceType, latestDateKey))
    const yesterdayBucket = bucketLookup.get(buildDailyBucketKey(pageKey, selectedPriceType, yesterdayDateKey))
    if (!latestBucket || !yesterdayBucket) {
      continue
    }

    let sevenDaySum = 0
    let sevenDayCount = 0
    let minPrice7d = Number.POSITIVE_INFINITY
    let maxPrice7d = Number.NEGATIVE_INFINITY
    for (let offset = 0; offset < 7; offset += 1) {
      const dateKey = addDays(sevenDayStartKey, offset)
      const bucket = bucketLookup.get(buildDailyBucketKey(pageKey, selectedPriceType, dateKey))
      if (!bucket) {
        continue
      }

      sevenDaySum += bucket.sum
      sevenDayCount += bucket.count
      minPrice7d = Math.min(minPrice7d, bucket.min)
      maxPrice7d = Math.max(maxPrice7d, bucket.max)
    }

    if (sevenDayCount < 3 || !Number.isFinite(minPrice7d) || !Number.isFinite(maxPrice7d)) {
      continue
    }

    const latestAvg = latestBucket.sum / latestBucket.count
    const yesterdayAvg = yesterdayBucket.sum / yesterdayBucket.count
    const sevenDayAvg = sevenDaySum / sevenDayCount
    const dayChangeVnd = latestAvg - yesterdayAvg
    const dayChangePct = yesterdayAvg > 0 ? ((latestAvg - yesterdayAvg) / yesterdayAvg) * 100 : 0
    const change7dVnd = latestAvg - sevenDayAvg
    const change7dPct = sevenDayAvg > 0 ? ((latestAvg - sevenDayAvg) / sevenDayAvg) * 100 : 0
    const regionalPrice = pageInfo.scope.provinceCode
      ? regionalPriceLookup.get(`${pageInfo.commoditySlug}::${selectedPriceType}::${pageInfo.scope.provinceCode}`)
      : null
    const trend = trendLookup.get(`${pageInfo.commoditySlug}::${selectedPriceType}`)

    pages.push({
      commoditySlug: pageInfo.commoditySlug,
      commodityName: getCommodityDisplayName(pageInfo.commoditySlug, commodity.name_vi),
      category: getCommodityCategory(pageInfo.commoditySlug, commodity.category),
      scope: pageInfo.scope,
      primaryPriceType: selectedPriceType,
      latestDate: latestDateKey,
      latestPriceVnd: roundNumber(latestAvg),
      dayChangeVnd: roundNumber(dayChangeVnd),
      dayChangePct: roundNumber(dayChangePct),
      change7dVnd: roundNumber(change7dVnd),
      change7dPct: roundNumber(change7dPct),
      minPrice7dVnd: roundNumber(minPrice7d),
      maxPrice7dVnd: roundNumber(maxPrice7d),
      observationCount7d: sevenDayCount,
      vsNationalAvgPct: regionalPrice?.vs_national_avg_pct ?? null,
      trend7dPct: trend?.trend_7d_pct ?? null,
      trend30dPct: trend?.trend_30d_pct ?? null,
      volatilityPct: trend?.volatility_pct ?? null,
    })
  }

  return pages
}

async function startGenerationRun(options: GeneratedPricePageGenerateOptions) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('generated_price_generation_runs')
    .insert({
      scope_filters: options,
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return data?.id as string
}

async function finishGenerationRun(runId: string | null, result: GeneratedPricePageGenerateResult) {
  if (!runId) {
    return
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    return
  }

  const { error } = await client
    .from('generated_price_generation_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: result.status,
      created_count: result.createdCount,
      updated_count: result.updatedCount,
      stale_count: result.staleCount,
      skipped_count: result.skippedCount,
      error_count: result.errorCount,
      errors_json: result.errors,
    })
    .eq('id', runId)

  if (error) {
    throw error
  }
}

async function insertSnapshot(pageId: string, snapshotDate: string, status: PricePageStatus, payload: Record<string, unknown>) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return
  }

  const { error } = await client.from('generated_price_page_snapshots').upsert(
    {
      page_id: pageId,
      snapshot_date: snapshotDate,
      status: status === STALE_STATUS ? 'stale' : 'published',
      payload,
    },
    { onConflict: 'page_id,snapshot_date' },
  )

  if (error) {
    throw error
  }
}

export async function generatePricePages(
  options: GeneratedPricePageGenerateOptions = {},
): Promise<GeneratedPricePageGenerateResult> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasAdminConfig) {
    return {
      runId: null,
      status: 'failed',
      createdCount: 0,
      updatedCount: 0,
      staleCount: 0,
      skippedCount: 0,
      errorCount: 1,
      errors: ['Supabase service role is not configured'],
    }
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    return {
      runId: null,
      status: 'failed',
      createdCount: 0,
      updatedCount: 0,
      staleCount: 0,
      skippedCount: 0,
      errorCount: 1,
      errors: ['Supabase admin client is not available'],
    }
  }

  const runId = await startGenerationRun(options)
  const errors: string[] = []
  let createdCount = 0
  let updatedCount = 0
  let staleCount = 0
  let skippedCount = 0

  try {
    const inputs = await loadGenerationInputs()
    if (!inputs) {
      throw new Error('Supabase admin client is not available')
    }

    const candidates = buildCandidatePages(inputs, options)
    const { data: existingData, error: existingError } = await client
      .from('generated_price_pages')
      .select('*')
      .order('updated_at', { ascending: false })

    if (existingError) {
      throw existingError
    }

    const existingRows = (existingData ?? []) as GeneratedPricePageRow[]
    const existingByKey = new Map(existingRows.map(row => [buildScopeCacheKey(row.commodity_slug, row.scope_type, row.scope_key), row]))
    const touchedPageKeys = new Set<string>()

    for (const page of candidates) {
      const pageKey = buildScopeCacheKey(page.commoditySlug, page.scope.scopeType, page.scope.scopeKey)
      touchedPageKeys.add(pageKey)

      const copy = buildPageCopy(page)
      const existing = existingByKey.get(pageKey)
      const payload = {
        slug: `${page.commoditySlug}/${page.scope.locationSlug}`,
        commodity_slug: page.commoditySlug,
        location_slug: page.scope.locationSlug,
        scope_type: page.scope.scopeType,
        scope_key: page.scope.scopeKey,
        province_code: page.scope.provinceCode,
        region_label: page.scope.locationLabel,
        category: page.category,
        title: copy.title,
        excerpt: copy.excerpt,
        answer_summary: copy.answerSummary,
        body_html: copy.bodyHtml,
        body_text: copy.bodyText,
        faq_json: copy.faq,
        seo_json: copy.seo,
        topic_tags: [page.commoditySlug, page.scope.scopeType, page.category ?? 'gia-ca'],
        thumbnail_url: getCommodityThumbnailUrl(page.commoditySlug),
        primary_price_type: page.primaryPriceType,
        latest_price_vnd: page.latestPriceVnd,
        latest_price_unit: 'VND/kg',
        day_change_vnd: page.dayChangeVnd,
        day_change_pct: page.dayChangePct,
        change_7d_vnd: page.change7dVnd,
        change_7d_pct: page.change7dPct,
        min_price_7d_vnd: page.minPrice7dVnd,
        max_price_7d_vnd: page.maxPrice7dVnd,
        observation_count_7d: page.observationCount7d,
        latest_observed_on: page.latestDate,
        metrics_json: {
          locationLabel: page.scope.locationLabel,
          vsNationalAvgPct: page.vsNationalAvgPct,
          trend7dPct: page.trend7dPct,
          trend30dPct: page.trend30dPct,
          volatilityPct: page.volatilityPct,
          updatedAtLabel: formatDateTime(`${page.latestDate}T08:00:00.000Z`),
        },
        status: 'published',
        published_at: existing?.published_at ?? new Date().toISOString(),
      }

      const { data, error } = await client
        .from('generated_price_pages')
        .upsert(payload, { onConflict: 'commodity_slug,scope_type,scope_key' })
        .select('*')
        .single()

      if (error) {
        errors.push(`${page.commoditySlug}/${page.scope.locationSlug}: ${error.message}`)
        continue
      }

      if (existing) {
        updatedCount += 1
      } else {
        createdCount += 1
      }

      await insertSnapshot((data as GeneratedPricePageRow).id, page.latestDate, 'published', {
        title: copy.title,
        excerpt: copy.excerpt,
        latestPriceVnd: page.latestPriceVnd,
        dayChangePct: page.dayChangePct,
        change7dPct: page.change7dPct,
        locationLabel: page.scope.locationLabel,
        primaryPriceType: page.primaryPriceType,
      })
    }

    const staleTargets = existingRows.filter(row => {
      if (touchedPageKeys.has(buildScopeCacheKey(row.commodity_slug, row.scope_type, row.scope_key))) {
        return false
      }

      if (options.commoditySlug && row.commodity_slug !== options.commoditySlug) {
        return false
      }

      if (options.scopeType && row.scope_type !== options.scopeType) {
        return false
      }

      if (options.scopeKey && row.scope_key !== options.scopeKey) {
        return false
      }

      return row.status !== STALE_STATUS
    })

    for (const row of staleTargets) {
      const nextSeo = parseSeoJson(row.seo_json, {
        title: row.title,
        description: row.excerpt,
        canonicalPath: buildGeneratedPricePagePath(row.commodity_slug, row.location_slug),
        ogTitle: row.title,
        ogDescription: row.excerpt,
        noindex: true,
      })
      nextSeo.noindex = true

      const { error } = await client
        .from('generated_price_pages')
        .update({
          status: STALE_STATUS,
          seo_json: nextSeo,
        })
        .eq('id', row.id)

      if (error) {
        errors.push(`${row.slug}: ${error.message}`)
        continue
      }

      staleCount += 1
      await insertSnapshot(row.id, row.latest_observed_on, STALE_STATUS, {
        title: row.title,
        excerpt: row.excerpt,
        status: STALE_STATUS,
      })
    }

    skippedCount = Math.max(0, candidates.length - createdCount - updatedCount - errors.length)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown generation failure'
    errors.push(message)
  }

  const result: GeneratedPricePageGenerateResult = {
    runId,
    status: errors.length === 0 ? 'success' : createdCount + updatedCount + staleCount > 0 ? 'partial' : 'failed',
    createdCount,
    updatedCount,
    staleCount,
    skippedCount,
    errorCount: errors.length,
    errors,
  }

  await finishGenerationRun(runId, result)
  return result
}

type ListOptions = {
  commoditySlug?: string
  provinceCode?: string
  scopeType?: PricePageScopeType
  limit?: number
}

export async function listGeneratedPricePages(options: ListOptions = {}) {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return [] as GeneratedPricePageSummary[]
  }

  const client = getSupabaseReadClient()
  if (!client) {
    return []
  }

  try {
    let query = client
      .from('generated_price_pages')
      .select('*')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(Math.min(Math.max(options.limit ?? 24, 1), 5000))

    if (options.commoditySlug) {
      query = query.eq('commodity_slug', options.commoditySlug)
    }

    if (options.provinceCode) {
      query = query.eq('province_code', options.provinceCode)
    }

    if (options.scopeType) {
      query = query.eq('scope_type', options.scopeType)
    }

    const { data, error } = await query
    if (error) {
      throw error
    }

    return ((data ?? []) as GeneratedPricePageRow[]).map(toSummary)
  } catch (error) {
    if (!isRelationMissing(error)) {
      console.error('[Price Pages] Failed to list generated price pages:', error)
    }

    return []
  }
}

async function loadGeneratedPricePageRow(
  commoditySlug: string,
  locationSlug: string,
  allowStale: boolean,
) {
  const runtime = getSupabaseRuntimeStatus()
  const client = allowStale ? getSupabaseAdminClient() : getSupabaseReadClient()
  if (!(allowStale ? runtime.hasAdminConfig : runtime.hasReadConfig) || !client) {
    return null
  }

  let query = client
    .from('generated_price_pages')
    .select('*')
    .eq('commodity_slug', commoditySlug)
    .eq('location_slug', locationSlug)
    .limit(1)

  if (!allowStale) {
    query = query.eq('status', 'published')
  }

  const { data, error } = await query
  if (error) {
    throw error
  }

  return ((data ?? []) as GeneratedPricePageRow[])[0] ?? null
}

async function loadRelatedPages(row: GeneratedPricePageRow) {
  const publishedPages = await listGeneratedPricePages({ limit: 200, commoditySlug: row.commodity_slug })
  const relatedByCommodity = publishedPages.filter(page => page.id !== row.id).slice(0, 4)

  const sameLocationCandidates = row.province_code
    ? await listGeneratedPricePages({ limit: 200, provinceCode: row.province_code })
    : await listGeneratedPricePages({ limit: 200, scopeType: row.scope_type })

  const relatedByLocation = sameLocationCandidates
    .filter(page => page.id !== row.id && (row.province_code ? page.provinceCode === row.province_code : page.scopeKey === row.scope_key))
    .slice(0, 4)

  return {
    relatedByCommodity,
    relatedByLocation,
  }
}

export async function getGeneratedPricePageDetail(
  commoditySlug: string,
  locationSlug: string,
  options: { allowStale?: boolean } = {},
): Promise<GeneratedPricePageDetail | null> {
  try {
    const row = await loadGeneratedPricePageRow(commoditySlug, locationSlug, options.allowStale === true)
    if (!row) {
      return null
    }

    const summary = toSummary(row)
    const seoFallback: PricePageSeoMeta = {
      title: row.title,
      description: row.excerpt,
      canonicalPath: buildGeneratedPricePagePath(row.commodity_slug, row.location_slug),
      ogTitle: row.title,
      ogDescription: row.excerpt,
      noindex: row.status === STALE_STATUS,
    }
    const related = await loadRelatedPages(row)

    return {
      ...summary,
      bodyHtml: row.body_html,
      bodyText: row.body_text,
      faq: parseFaqJson(row.faq_json),
      seo: parseSeoJson(row.seo_json, seoFallback),
      relatedByCommodity: related.relatedByCommodity,
      relatedByLocation: related.relatedByLocation,
    }
  } catch (error) {
    if (!isRelationMissing(error)) {
      console.error('[Price Pages] Failed to load page detail:', error)
    }

    return null
  }
}

export function toContentFeedItem(page: GeneratedPricePageSummary): ContentFeedItem {
  return {
    kind: 'price_page',
    path: page.path,
    title: page.title,
    excerpt: page.excerpt,
    thumbnailUrl: page.thumbnailUrl,
    publishedAt: page.publishedAt ?? page.updatedAt,
    updatedAt: page.updatedAt,
    category: page.category,
    topicTags: page.topicTags,
    badgeLabel: 'Phân tích giá',
    commoditySlug: page.commoditySlug,
    locationLabel: page.locationLabel,
    primaryPriceType: page.primaryPriceType,
  }
}

export const __generatedPricePagesTestUtils = {
  buildPageCopy,
  deriveScope,
  buildCandidatePages,
  getCommodityDisplayName,
  getCommodityThumbnailUrl,
  normalizeDisplayLabel,
}
