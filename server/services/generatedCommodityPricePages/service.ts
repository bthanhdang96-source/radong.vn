import {
  buildGeneratedPricePagePath,
  deriveScope,
  getCommodityCategory,
  getCommodityDisplayName,
  normalizeDisplayLabel,
} from '../generatedPricePages/service.js'
import { listGeneratedPricePages } from '../generatedPricePages/service.js'
import { resolveCommodityImage } from '../generatedPricePages/commodityImageResolver.js'
import { getContentFamilyMeta, getPriceCommodityGroupMeta } from '../contentTaxonomy.js'
import {
  DURIAN_COMMODITY_SLUG,
  DURIAN_SUPPORTED_VARIETIES,
  getDurianVarietyLabel,
  isDurianHeadlineQualityGrade,
  isDurianSupportedVariety,
} from '../durianPricing.js'
import {
  getSupabaseAdminClient,
  getSupabaseReadClient,
  getSupabaseRuntimeStatus,
} from '../supabaseClient.js'
import type {
  CommodityPricePageRenderMode,
  ContentFeedItem,
  GeneratedCommodityPricePageDetail,
  GeneratedCommodityPricePageGenerateOptions,
  GeneratedCommodityPricePageGenerateResult,
  GeneratedCommodityPricePageSummary,
  GeneratedCommodityPriceChainCard,
  GeneratedCommodityPriceRegionRow,
  GeneratedCommodityPriceVarietyRow,
  GeneratedCommodityPriceVarietySection,
  PricePageFaqItem,
  PricePagePrimaryPriceType,
  PricePageScopeType,
  PricePageSeoMeta,
  PricePageStatus,
} from '../generatedPricePages/types.js'

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
  quality_grade: string | null
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
  quality_grade: string | null
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

type GenerationInputs = {
  latestRows: LatestObservationRow[]
  observations: ObservationWindowRow[]
  commodities: CommodityRow[]
  provinces: ProvinceRow[]
  regionalPrices: RegionalPriceRow[]
  trends: TrendRow[]
}

type ScopeMetric = {
  commoditySlug: string
  commodityName: string
  category: string | null
  scope: ScopeInfo
  priceType: PricePagePrimaryPriceType
  latestDate: string
  latestPriceVnd: number
  latestPriceUnit: string
  dayChangeVnd: number
  dayChangePct: number
  change7dVnd: number
  change7dPct: number
  minPrice7dVnd: number
  maxPrice7dVnd: number
  observationCount7d: number
  latestBucketSum: number
  latestBucketCount: number
  yesterdayBucketSum: number
  yesterdayBucketCount: number
  sevenDaySum: number
  sevenDayCount: number
  vsNationalAvgPct: number | null
  trend7dPct: number | null
  trend30dPct: number | null
  volatilityPct: number | null
}

type GeneratedCommodityPricePageRow = {
  id: string
  slug: string
  commodity_slug: string
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
  render_mode: CommodityPricePageRenderMode
  headline_latest_price_vnd: number
  headline_latest_price_unit: string
  day_change_vnd: number
  day_change_pct: number
  change_7d_vnd: number
  change_7d_pct: number
  lowest_price_vnd: number
  highest_price_vnd: number
  price_spread_vnd: number
  location_count: number
  province_count: number
  region_label_count: number
  latest_observed_on: string
  national_scope_label: string | null
  region_rows_json: unknown
  variety_sections_json: unknown
  metrics_json: Record<string, unknown> | null
  published_at: string | null
  updated_at: string
  status: PricePageStatus
}

type CommodityCandidatePage = {
  commoditySlug: string
  commodityName: string
  category: string | null
  primaryPriceType: PricePagePrimaryPriceType
  renderMode: CommodityPricePageRenderMode
  latestDate: string
  headlineLatestPriceVnd: number
  headlineLatestPriceUnit: string
  dayChangeVnd: number
  dayChangePct: number
  change7dVnd: number
  change7dPct: number
  lowestPriceVnd: number
  highestPriceVnd: number
  priceSpreadVnd: number
  locationCount: number
  provinceCount: number
  regionLabelCount: number
  nationalScopeLabel: string | null
  regionRows: GeneratedCommodityPriceRegionRow[]
  varietySections: GeneratedCommodityPriceVarietySection[]
  metricsJson: Record<string, unknown>
}

const PRICE_PAGE_PREFIX = '/gia-nong-san'
const PRICE_TYPE_PRIORITY: PricePagePrimaryPriceType[] = ['farm_gate', 'wholesale', 'retail', 'export']
const STALE_STATUS = 'stale' satisfies PricePageStatus

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

function maybeTruncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`
}

function buildScopeCacheKey(commoditySlug: string, scopeType: PricePageScopeType, scopeKey: string) {
  return `${commoditySlug}::${scopeType}::${scopeKey}`
}

function buildDailyBucketKey(pageKey: string, priceType: PricePagePrimaryPriceType, dateKey: string) {
  return `${pageKey}::${priceType}::${dateKey}`
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

function isStableMovement(value: number) {
  return Math.abs(value) < 0.3
}

function getMovementLabel(value: number) {
  if (isStableMovement(value)) {
    return 'ổn định'
  }

  return value > 0 ? 'tăng' : 'giảm'
}

function getMovementNarrative(value: number) {
  const label = getMovementLabel(value)
  if (label === 'ổn định') {
    return 'gần như không thay đổi so với trước đó'
  }

  return `${label} ${Math.abs(roundNumber(value, 2)).toLocaleString('vi-VN')}%`
}

function isNationalScope(scope: ScopeInfo) {
  return scope.scopeType === 'region_label' && scope.provinceCode === null && scope.scopeKey === 'viet nam'
}

export function buildGeneratedCommodityPricePagePath(commoditySlug: string) {
  return `${PRICE_PAGE_PREFIX}/${commoditySlug}`
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

function parseRegionRowsJson(input: unknown): GeneratedCommodityPriceRegionRow[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const row = item as Record<string, unknown>
      if (
        typeof row.scopeType !== 'string' ||
        typeof row.scopeKey !== 'string' ||
        typeof row.locationLabel !== 'string' ||
        typeof row.locationSlug !== 'string' ||
        typeof row.path !== 'string' ||
        typeof row.priceType !== 'string' ||
        typeof row.latestPriceVnd !== 'number' ||
        typeof row.latestPriceUnit !== 'string' ||
        typeof row.dayChangeVnd !== 'number' ||
        typeof row.dayChangePct !== 'number' ||
        typeof row.change7dVnd !== 'number' ||
        typeof row.change7dPct !== 'number' ||
        typeof row.minPrice7dVnd !== 'number' ||
        typeof row.maxPrice7dVnd !== 'number' ||
        typeof row.observationCount7d !== 'number' ||
        typeof row.latestObservedOn !== 'string' ||
        typeof row.sortRank !== 'number'
      ) {
        return null
      }

      return {
        scopeType: row.scopeType as PricePageScopeType,
        scopeKey: row.scopeKey,
        provinceCode: typeof row.provinceCode === 'string' ? row.provinceCode : null,
        regionLabel: typeof row.regionLabel === 'string' ? row.regionLabel : null,
        locationLabel: row.locationLabel,
        locationSlug: row.locationSlug,
        path: row.path,
        priceType: row.priceType as PricePagePrimaryPriceType,
        latestPriceVnd: row.latestPriceVnd,
        latestPriceUnit: row.latestPriceUnit,
        dayChangeVnd: row.dayChangeVnd,
        dayChangePct: row.dayChangePct,
        change7dVnd: row.change7dVnd,
        change7dPct: row.change7dPct,
        vsNationalAvgPct: typeof row.vsNationalAvgPct === 'number' ? row.vsNationalAvgPct : null,
        minPrice7dVnd: row.minPrice7dVnd,
        maxPrice7dVnd: row.maxPrice7dVnd,
        observationCount7d: row.observationCount7d,
        latestObservedOn: row.latestObservedOn,
        sortRank: row.sortRank,
      } satisfies GeneratedCommodityPriceRegionRow
    })
    .filter((row): row is GeneratedCommodityPriceRegionRow => Boolean(row))
}

function parseVarietySectionsJson(input: unknown): GeneratedCommodityPriceVarietySection[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const section = item as Record<string, unknown>
      if (
        typeof section.variety !== 'string' ||
        typeof section.varietyLabel !== 'string' ||
        typeof section.headlineLatestPriceVnd !== 'number' ||
        typeof section.lowestPriceVnd !== 'number' ||
        typeof section.highestPriceVnd !== 'number' ||
        typeof section.change7dPct !== 'number' ||
        !Array.isArray(section.rows)
      ) {
        return null
      }

      const rows = section.rows
        .map(rowItem => {
          if (!rowItem || typeof rowItem !== 'object') {
            return null
          }

          const row = rowItem as Record<string, unknown>
          if (
            typeof row.scopeType !== 'string' ||
            typeof row.scopeKey !== 'string' ||
            typeof row.locationLabel !== 'string' ||
            typeof row.locationSlug !== 'string' ||
            typeof row.priceType !== 'string' ||
            typeof row.latestPriceVnd !== 'number' ||
            typeof row.latestPriceUnit !== 'string' ||
            typeof row.dayChangeVnd !== 'number' ||
            typeof row.dayChangePct !== 'number' ||
            typeof row.change7dVnd !== 'number' ||
            typeof row.change7dPct !== 'number' ||
            typeof row.latestObservedOn !== 'string' ||
            typeof row.sortRank !== 'number'
          ) {
            return null
          }

          return {
            scopeType: row.scopeType as PricePageScopeType,
            scopeKey: row.scopeKey,
            provinceCode: typeof row.provinceCode === 'string' ? row.provinceCode : null,
            regionLabel: typeof row.regionLabel === 'string' ? row.regionLabel : null,
            locationLabel: row.locationLabel,
            locationSlug: row.locationSlug,
            priceType: row.priceType as PricePagePrimaryPriceType,
            qualityGrade: typeof row.qualityGrade === 'string' ? row.qualityGrade : null,
            latestPriceVnd: row.latestPriceVnd,
            latestPriceUnit: row.latestPriceUnit,
            dayChangeVnd: row.dayChangeVnd,
            dayChangePct: row.dayChangePct,
            change7dVnd: row.change7dVnd,
            change7dPct: row.change7dPct,
            latestObservedOn: row.latestObservedOn,
            sortRank: row.sortRank,
          } satisfies GeneratedCommodityPriceVarietyRow
        })
        .filter((row): row is GeneratedCommodityPriceVarietyRow => Boolean(row))

      return {
        variety: section.variety,
        varietyLabel: section.varietyLabel,
        headlineLatestPriceVnd: section.headlineLatestPriceVnd,
        lowestPriceVnd: section.lowestPriceVnd,
        highestPriceVnd: section.highestPriceVnd,
        change7dPct: section.change7dPct,
        rows,
      } satisfies GeneratedCommodityPriceVarietySection
    })
    .filter((section): section is GeneratedCommodityPriceVarietySection => Boolean(section))
}

function parseChainCardsFromMetricsJson(input: Record<string, unknown> | null | undefined): GeneratedCommodityPriceChainCard[] {
  const chainCards = input?.chainCards
  if (!Array.isArray(chainCards)) {
    return []
  }

  return chainCards
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const card = item as Record<string, unknown>
      if (
        typeof card.priceType !== 'string' ||
        typeof card.label !== 'string' ||
        typeof card.latestPriceUnit !== 'string'
      ) {
        return null
      }

      return {
        priceType: card.priceType as PricePagePrimaryPriceType,
        label: card.label,
        latestPriceVnd: typeof card.latestPriceVnd === 'number' ? card.latestPriceVnd : null,
        latestPriceUnit: card.latestPriceUnit,
        latestObservedOn: typeof card.latestObservedOn === 'string' ? card.latestObservedOn : null,
      } satisfies GeneratedCommodityPriceChainCard
    })
    .filter((card): card is GeneratedCommodityPriceChainCard => Boolean(card))
}

async function loadGenerationInputs() {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const latestRowsPromise = client
    .from('latest_observation_details')
    .select('recorded_at, commodity_slug, province_code, price_type, variety, quality_grade, market_name, raw_payload')

  const observationsPromise = client
    .from('price_observations')
    .select('recorded_at, commodity_slug, province_code, price_type, price_vnd, confidence, variety, quality_grade, market_name, raw_payload')
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
  } satisfies GenerationInputs
}

function filterDurianHeadlineRows<T extends { commodity_slug: string; price_type: PricePagePrimaryPriceType | null; quality_grade: string | null }>(
  rows: T[],
) {
  const premiumByPriceType = new Set<string>()
  for (const row of rows) {
    if (
      row.commodity_slug === DURIAN_COMMODITY_SLUG &&
      row.price_type &&
      isDurianHeadlineQualityGrade(row.quality_grade)
    ) {
      premiumByPriceType.add(row.price_type)
    }
  }

  if (premiumByPriceType.size === 0) {
    return rows
  }

  return rows.filter(row => {
    if (row.commodity_slug !== DURIAN_COMMODITY_SLUG || !row.price_type) {
      return true
    }

    if (!premiumByPriceType.has(row.price_type)) {
      return true
    }

    return isDurianHeadlineQualityGrade(row.quality_grade)
  })
}

function buildCommodityChainCards(commoditySlug: string, inputs: GenerationInputs): GeneratedCommodityPriceChainCard[] {
  return PRICE_TYPE_PRIORITY.map(priceType => {
    const rows = inputs.observations.filter(
      row => row.commodity_slug === commoditySlug && row.price_type === priceType && row.price_vnd !== null,
    )
    const filteredRows = commoditySlug === DURIAN_COMMODITY_SLUG ? filterDurianHeadlineRows(rows) : rows
    if (filteredRows.length === 0) {
      return {
        priceType,
        label: getPriceTypeLabel(priceType),
        latestPriceVnd: null,
        latestPriceUnit: 'VND/kg',
        latestObservedOn: null,
      } satisfies GeneratedCommodityPriceChainCard
    }

    const latestObservedOn = filteredRows.reduce(
      (latest, row) => (row.recorded_at > latest ? row.recorded_at : latest),
      filteredRows[0]?.recorded_at ?? null,
    )
    const latestDateKey = latestObservedOn ? dateKeyFromIso(latestObservedOn) : null
    const latestRows = latestDateKey
      ? filteredRows.filter(row => dateKeyFromIso(row.recorded_at) === latestDateKey)
      : filteredRows

    return {
      priceType,
      label: getPriceTypeLabel(priceType),
      latestPriceVnd: roundNumber(latestRows.reduce((sum, row) => sum + (row.price_vnd ?? 0), 0) / latestRows.length),
      latestPriceUnit: 'VND/kg',
      latestObservedOn: latestDateKey,
    } satisfies GeneratedCommodityPriceChainCard
  })
}

function buildDurianVarietySections(
  commoditySlug: string,
  primaryPriceType: PricePagePrimaryPriceType,
  inputs: GenerationInputs,
  latestDateKey: string,
): GeneratedCommodityPriceVarietySection[] {
  if (commoditySlug !== DURIAN_COMMODITY_SLUG) {
    return []
  }

  const provinceLookup = new Map(inputs.provinces.map(province => [province.code, province.name_vi]))
  const sevenDayStartKey = addDays(latestDateKey, -6)
  const bucketLookup = new Map<
    string,
    Map<string, { sum: number; count: number }>
  >()
  const scopeLookup = new Map<
    string,
    {
      variety: string
      qualityGrade: string | null
      scopeType: PricePageScopeType
      scopeKey: string
      provinceCode: string | null
      regionLabel: string | null
      locationLabel: string
      locationSlug: string
    }
  >()

  for (const row of inputs.observations) {
    if (
      row.commodity_slug !== DURIAN_COMMODITY_SLUG ||
      row.price_type !== primaryPriceType ||
      row.price_vnd === null ||
      !isDurianSupportedVariety(row.variety)
    ) {
      continue
    }

    const scope = deriveScope(row, provinceLookup)
    if (!scope || isNationalScope(scope)) {
      continue
    }

    const rowDateKey = dateKeyFromIso(row.recorded_at)
    if (rowDateKey < sevenDayStartKey || rowDateKey > latestDateKey) {
      continue
    }

    const key = [row.variety, scope.scopeType, scope.scopeKey, row.quality_grade ?? 'na'].join('::')
    scopeLookup.set(key, {
      variety: row.variety,
      qualityGrade: row.quality_grade ?? null,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      provinceCode: scope.provinceCode,
      regionLabel: scope.regionLabel,
      locationLabel: scope.locationLabel,
      locationSlug: scope.locationSlug,
    })

    const byDate = bucketLookup.get(key) ?? new Map<string, { sum: number; count: number }>()
    const bucket = byDate.get(rowDateKey) ?? { sum: 0, count: 0 }
    bucket.sum += row.price_vnd
    bucket.count += 1
    byDate.set(rowDateKey, bucket)
    bucketLookup.set(key, byDate)
  }

  const rowsByVariety = new Map<string, GeneratedCommodityPriceVarietyRow[]>()
  for (const [key, byDate] of bucketLookup.entries()) {
    const scope = scopeLookup.get(key)
    const latestBucket = byDate.get(latestDateKey)
    if (!scope || !latestBucket || latestBucket.count === 0) {
      continue
    }

    let sevenDaySum = 0
    let sevenDayCount = 0
    for (const bucket of byDate.values()) {
      sevenDaySum += bucket.sum
      sevenDayCount += bucket.count
    }

    const latestPriceVnd = latestBucket.sum / latestBucket.count
    const yesterdayBucket = byDate.get(addDays(latestDateKey, -1))
    const yesterdayAvg = yesterdayBucket && yesterdayBucket.count > 0 ? yesterdayBucket.sum / yesterdayBucket.count : latestPriceVnd
    const sevenDayAvg = sevenDayCount > 0 ? sevenDaySum / sevenDayCount : latestPriceVnd
    const dayChangeVnd = latestPriceVnd - yesterdayAvg
    const change7dVnd = latestPriceVnd - sevenDayAvg

    const row: GeneratedCommodityPriceVarietyRow = {
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      provinceCode: scope.provinceCode,
      regionLabel: scope.regionLabel,
      locationLabel: scope.locationLabel,
      locationSlug: scope.locationSlug,
      priceType: primaryPriceType,
      qualityGrade: scope.qualityGrade,
      latestPriceVnd: roundNumber(latestPriceVnd),
      latestPriceUnit: 'VND/kg',
      dayChangeVnd: roundNumber(dayChangeVnd),
      dayChangePct: roundNumber(yesterdayAvg > 0 ? (dayChangeVnd / yesterdayAvg) * 100 : 0),
      change7dVnd: roundNumber(change7dVnd),
      change7dPct: roundNumber(sevenDayAvg > 0 ? (change7dVnd / sevenDayAvg) * 100 : 0),
      latestObservedOn: latestDateKey,
      sortRank: 0,
    }

    const existing = rowsByVariety.get(scope.variety) ?? []
    existing.push(row)
    rowsByVariety.set(scope.variety, existing)
  }

  const sections = [...DURIAN_SUPPORTED_VARIETIES].map<GeneratedCommodityPriceVarietySection | null>(variety => {
      const rows = (rowsByVariety.get(variety) ?? [])
        .sort((left, right) => {
          if (right.latestPriceVnd !== left.latestPriceVnd) {
            return right.latestPriceVnd - left.latestPriceVnd
          }

          return left.locationLabel.localeCompare(right.locationLabel, 'vi')
        })
        .map((row, index) => ({
          ...row,
          sortRank: index + 1,
        }))

      if (rows.length === 0) {
        return null
      }

      const headlineRows = rows.filter(row => isDurianHeadlineQualityGrade(row.qualityGrade))
      const baselineRows = headlineRows.length > 0 ? headlineRows : rows
      const headlineLatestPriceVnd =
        baselineRows.reduce((sum, row) => sum + row.latestPriceVnd, 0) / baselineRows.length

      return {
        variety,
        varietyLabel: getDurianVarietyLabel(variety),
        headlineLatestPriceVnd: roundNumber(headlineLatestPriceVnd),
        lowestPriceVnd: Math.min(...rows.map(row => row.latestPriceVnd)),
        highestPriceVnd: Math.max(...rows.map(row => row.latestPriceVnd)),
        change7dPct: roundNumber(
          baselineRows.reduce((sum, row) => sum + row.change7dPct, 0) / baselineRows.length,
        ),
        rows,
      } satisfies GeneratedCommodityPriceVarietySection
    })

  return sections.filter((section): section is GeneratedCommodityPriceVarietySection => section !== null)
}

export function buildScopeMetricsForCommodity(inputs: GenerationInputs, commoditySlug?: string) {
  if (inputs.latestRows.length === 0) {
    return [] as ScopeMetric[]
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

  const filteredLatestRows = filterDurianHeadlineRows(inputs.latestRows)
  const filteredObservations = filterDurianHeadlineRows(inputs.observations)
  const candidatePageKeys = new Set<string>()
  const pageInfoLookup = new Map<string, { commoditySlug: string; scope: ScopeInfo }>()
  for (const row of filteredLatestRows.filter(item => dateKeyFromIso(item.recorded_at) === latestDateKey)) {
    if (!isPriceType(row.price_type)) {
      continue
    }

    if (commoditySlug && row.commodity_slug !== commoditySlug) {
      continue
    }

    const scope = deriveScope(row, provinceLookup)
    if (!scope) {
      continue
    }

    const pageKey = buildScopeCacheKey(row.commodity_slug, scope.scopeType, scope.scopeKey)
    candidatePageKeys.add(pageKey)
    pageInfoLookup.set(pageKey, { commoditySlug: row.commodity_slug, scope })
  }

  const bucketLookup = new Map<string, DailyBucket>()
  const windowObservationCounts = new Map<string, number>()
  for (const row of filteredObservations) {
    if (!isPriceType(row.price_type) || row.price_vnd === null) {
      continue
    }

    if (commoditySlug && row.commodity_slug !== commoditySlug) {
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

  const metrics: ScopeMetric[] = []
  for (const pageKey of candidatePageKeys) {
    const pageInfo = pageInfoLookup.get(pageKey)
    if (!pageInfo) {
      continue
    }

    const commodity = commodityLookup.get(pageInfo.commoditySlug)
    if (!commodity) {
      continue
    }

    for (const priceType of PRICE_TYPE_PRIORITY) {
      const latestBucket = bucketLookup.get(buildDailyBucketKey(pageKey, priceType, latestDateKey))
      const yesterdayBucket = bucketLookup.get(buildDailyBucketKey(pageKey, priceType, yesterdayDateKey))
      const windowCount = windowObservationCounts.get(`${pageKey}::${priceType}`) ?? 0
      if (!latestBucket || !yesterdayBucket || windowCount < 3) {
        continue
      }

      let sevenDaySum = 0
      let sevenDayCount = 0
      let minPrice7d = Number.POSITIVE_INFINITY
      let maxPrice7d = Number.NEGATIVE_INFINITY
      for (let offset = 0; offset < 7; offset += 1) {
        const dateKey = addDays(sevenDayStartKey, offset)
        const bucket = bucketLookup.get(buildDailyBucketKey(pageKey, priceType, dateKey))
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
      const regionalPrice = pageInfo.scope.provinceCode
        ? regionalPriceLookup.get(`${pageInfo.commoditySlug}::${priceType}::${pageInfo.scope.provinceCode}`)
        : null
      const trend = trendLookup.get(`${pageInfo.commoditySlug}::${priceType}`)

      metrics.push({
        commoditySlug: pageInfo.commoditySlug,
        commodityName: getCommodityDisplayName(pageInfo.commoditySlug, commodity.name_vi),
        category: getCommodityCategory(pageInfo.commoditySlug, commodity.category),
        scope: pageInfo.scope,
        priceType,
        latestDate: latestDateKey,
        latestPriceVnd: roundNumber(latestAvg),
        latestPriceUnit: 'VND/kg',
        dayChangeVnd: roundNumber(latestAvg - yesterdayAvg),
        dayChangePct: roundNumber(yesterdayAvg > 0 ? ((latestAvg - yesterdayAvg) / yesterdayAvg) * 100 : 0),
        change7dVnd: roundNumber(latestAvg - sevenDayAvg),
        change7dPct: roundNumber(sevenDayAvg > 0 ? ((latestAvg - sevenDayAvg) / sevenDayAvg) * 100 : 0),
        minPrice7dVnd: roundNumber(minPrice7d),
        maxPrice7dVnd: roundNumber(maxPrice7d),
        observationCount7d: sevenDayCount,
        latestBucketSum: latestBucket.sum,
        latestBucketCount: latestBucket.count,
        yesterdayBucketSum: yesterdayBucket.sum,
        yesterdayBucketCount: yesterdayBucket.count,
        sevenDaySum,
        sevenDayCount,
        vsNationalAvgPct: regionalPrice?.vs_national_avg_pct ?? null,
        trend7dPct: trend?.trend_7d_pct ?? null,
        trend30dPct: trend?.trend_30d_pct ?? null,
        volatilityPct: trend?.volatility_pct ?? null,
      })
    }
  }

  return metrics
}

function buildRegionalTableCopy(page: CommodityCandidatePage, commodityName: string) {
  const latestDateLabel = formatFullDate(page.latestDate)
  const priceTypeLabel = getPriceTypeLabel(page.primaryPriceType)
  const dayDirection = getMovementLabel(page.dayChangePct)
  const sevenDayDirection = getMovementLabel(page.change7dPct)
  const topLocationLabel = typeof page.metricsJson.topLocationLabel === 'string' ? page.metricsJson.topLocationLabel : 'vùng cao nhất'
  const bottomLocationLabel = typeof page.metricsJson.bottomLocationLabel === 'string' ? page.metricsJson.bottomLocationLabel : 'vùng thấp nhất'
  const title = maybeTruncate(`Giá ${commodityName} hôm nay`, 120)
  const daySummaryPhrase =
    dayDirection === 'ổn định'
      ? 'gần như không thay đổi so với hôm qua'
      : `${dayDirection} ${Math.abs(Math.round(page.dayChangeVnd)).toLocaleString('vi-VN')} đồng/kg so với hôm qua`
  const answerSummary = `${priceTypeLabel.charAt(0).toUpperCase()}${priceTypeLabel.slice(1)} của ${commodityName} ngày ${latestDateLabel} hiện ở mức ${formatCurrency(page.headlineLatestPriceVnd)}, ${daySummaryPhrase} (${formatSignedPercent(page.dayChangePct)}). Dữ liệu từ các nơi đang có cho thấy mức cao nhất tại ${topLocationLabel} và thấp nhất tại ${bottomLocationLabel}.`
  const excerpt = maybeTruncate(
    `${answerSummary} Bảng giá theo vùng được tổng hợp từ ${page.locationCount.toLocaleString('vi-VN')} nơi có đủ dữ liệu cùng loại giá.`,
    180,
  )

  const faq: PricePageFaqItem[] = [
    {
      question: `Giá ${commodityName} hôm nay là bao nhiêu?`,
      answer: `${priceTypeLabel.charAt(0).toUpperCase()}${priceTypeLabel.slice(1)} hiện ở mức ${formatCurrency(page.headlineLatestPriceVnd)} theo dữ liệu cập nhật ngày ${latestDateLabel}.`,
    },
    {
      question: `Giá ${commodityName} hôm nay khác nhau giữa các vùng ra sao?`,
      answer: `Mức giá cao nhất đang ở ${topLocationLabel} và thấp nhất ở ${bottomLocationLabel}, tạo khoảng cách ${formatCurrency(page.priceSpreadVnd)} giữa các vùng có đủ dữ liệu.`,
    },
    {
      question: `Xem bảng giá ${commodityName} theo vùng ở đâu?`,
      answer: `Ngay trong bài có bảng giá theo vùng với liên kết sang từng trang chi tiết để xem giá cụ thể và mức tăng giảm.`,
    },
  ]

  const bodyHtml = [
    `<section><h2>Tóm tắt nhanh</h2><p>${answerSummary}</p></section>`,
    `<section><h2>Bảng giá theo vùng hôm nay</h2><p>Bảng bên dưới tổng hợp ${page.locationCount.toLocaleString('vi-VN')} nơi có đủ dữ liệu với ${priceTypeLabel} của ${commodityName}. Các hàng được sắp theo mức giá hiện tại giảm dần để người đọc dễ nhìn ra nơi giá cao hơn và nơi giá thấp hơn.</p></section>`,
    `<section><h2>Khu vực nổi bật</h2><p>${topLocationLabel} hiện là nơi có mức giá cao nhất ở ${formatCurrency(page.highestPriceVnd)}, trong khi ${bottomLocationLabel} đang ở ${formatCurrency(page.lowestPriceVnd)}. Mức cách nhau giữa nơi cao nhất và thấp nhất hiện là ${formatCurrency(page.priceSpreadVnd)}.</p></section>`,
    `<section><h2>So với hôm qua</h2><p>${priceTypeLabel.charAt(0).toUpperCase()}${priceTypeLabel.slice(1)} của ${commodityName} hiện ${dayDirection === 'ổn định' ? `ít thay đổi so với hôm qua, với mức lệch ${formatSignedCurrency(page.dayChangeVnd)}` : `${getMovementNarrative(page.dayChangePct)} so với hôm qua, tương ứng mức thay đổi ${formatSignedCurrency(page.dayChangeVnd)}` }.</p></section>`,
    `<section><h2>Giá trong 7 ngày gần đây</h2><p>So với trung bình 7 ngày, giá hiện ${sevenDayDirection === 'ổn định' ? 'giữ mức khá ổn định' : `${getMovementNarrative(page.change7dPct)} với mức thay đổi ${formatSignedCurrency(page.change7dVnd)}`}. Nhờ vậy người đọc dễ thấy giá đang thay đổi ở nhiều nơi hay chỉ ở một vài nơi.</p></section>`,
    `<section><h2>Giá giữa các vùng khác nhau ra sao</h2><p>Khoảng giá hiện nằm từ ${formatCurrency(page.lowestPriceVnd)} đến ${formatCurrency(page.highestPriceVnd)}. Người đọc có thể dùng bảng vùng để nhận diện nơi có giá thấp hơn hoặc nơi đang giữ mức giá cao.</p></section>`,
    `<section><h2>Theo dõi thêm</h2><p>Xem thêm bảng giá tổng hợp tại <a href="/bang-gia">/bang-gia</a> và chuỗi giá tại <a href="/chuoi-gia">/chuoi-gia</a>.</p></section>`,
  ].join('')

  const bodyText = [
    answerSummary,
    `Bảng giá theo vùng hiện có ${page.locationCount.toLocaleString('vi-VN')} nơi đủ dữ liệu.`,
    `Khu vực giá cao nhất: ${topLocationLabel}. Khu vực giá thấp nhất: ${bottomLocationLabel}.`,
    ...faq.map(item => `${item.question} ${item.answer}`),
  ].join('\n\n')

  const seo: PricePageSeoMeta = {
    title,
    description: excerpt,
    canonicalPath: buildGeneratedCommodityPricePagePath(page.commoditySlug),
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

function buildNationalArticleCopy(page: CommodityCandidatePage, commodityName: string) {
  const latestDateLabel = formatFullDate(page.latestDate)
  const priceTypeLabel = getPriceTypeLabel(page.primaryPriceType)
  const dayDirection = getMovementLabel(page.dayChangePct)
  const sevenDayDirection = getMovementLabel(page.change7dPct)
  const nationalLabel = page.nationalScopeLabel ?? 'Việt Nam'
  const title = maybeTruncate(`Giá ${commodityName} hôm nay`, 120)
  const daySummaryPhrase =
    dayDirection === 'ổn định'
      ? 'gần như không thay đổi so với hôm qua'
      : `${dayDirection} ${Math.abs(Math.round(page.dayChangeVnd)).toLocaleString('vi-VN')} đồng/kg so với hôm qua`
  const answerSummary = `${priceTypeLabel.charAt(0).toUpperCase()}${priceTypeLabel.slice(1)} của ${commodityName} theo dữ liệu toàn quốc hiện có ngày ${latestDateLabel} đang ở mức ${formatCurrency(page.headlineLatestPriceVnd)}, ${daySummaryPhrase} (${formatSignedPercent(page.dayChangePct)}). Dữ liệu hiện phản ánh mức giá chung của ${nationalLabel}, chưa đủ vùng để dựng bảng so sánh chi tiết.`
  const excerpt = maybeTruncate(
    `${answerSummary} Bài viết được cập nhật tự động theo dữ liệu cấp quốc gia hiện có để phục vụ nhu cầu tra cứu nhanh.`,
    180,
  )

  const faq: PricePageFaqItem[] = [
    {
      question: `Giá ${commodityName} hôm nay là bao nhiêu?`,
      answer: `${priceTypeLabel.charAt(0).toUpperCase()}${priceTypeLabel.slice(1)} hiện ở mức ${formatCurrency(page.headlineLatestPriceVnd)} theo dữ liệu cấp ${nationalLabel} cập nhật ngày ${latestDateLabel}.`,
    },
    {
      question: `Vì sao bài giá ${commodityName} hôm nay chưa có bảng theo vùng?`,
      answer: `Hiện hệ thống mới có dữ liệu đủ dùng ở cấp ${nationalLabel}, nên bài được xuất bản như tin giá tổng quan thay vì bảng so sánh vùng.`,
    },
    {
      question: `Giá ${commodityName} trong 7 ngày gần đây thay đổi ra sao?`,
      answer: `So với trung bình 7 ngày, giá hiện ${getMovementNarrative(page.change7dPct)} với mức thay đổi ${formatSignedCurrency(page.change7dVnd)} theo dữ liệu toàn quốc hiện có.`,
    },
  ]

  const bodyHtml = [
    `<section><h2>Tóm tắt nhanh</h2><p>${answerSummary}</p></section>`,
    `<section><h2>So với hôm qua</h2><p>${priceTypeLabel.charAt(0).toUpperCase()}${priceTypeLabel.slice(1)} của ${commodityName} tại ${nationalLabel} hiện ${dayDirection === 'ổn định' ? `ít thay đổi so với hôm qua, tương ứng mức lệch ${formatSignedCurrency(page.dayChangeVnd)}` : `${getMovementNarrative(page.dayChangePct)} so với hôm qua, tương ứng mức thay đổi ${formatSignedCurrency(page.dayChangeVnd)}` }.</p></section>`,
    `<section><h2>So với 7 ngày gần đây</h2><p>So với trung bình 7 ngày, mức giá hiện ${sevenDayDirection === 'ổn định' ? 'giữ mức khá ổn định' : `${getMovementNarrative(page.change7dPct)} với mức thay đổi ${formatSignedCurrency(page.change7dVnd)}`}. Khoảng giá ghi nhận nằm từ ${formatCurrency(page.lowestPriceVnd)} đến ${formatCurrency(page.highestPriceVnd)}.</p></section>`,
    `<section><h2>Dữ liệu hiện có</h2><p>Hiện hệ thống mới có dữ liệu đủ dùng ở cấp ${nationalLabel}. Vì vậy trang này được hiển thị như một bài tin giá tự động để người đọc vẫn có thể theo dõi mức giá chung của ${commodityName} hôm nay.</p></section>`,
    `<section><h2>Theo dõi thêm</h2><p>Khi có thêm dữ liệu địa bàn, trang này sẽ tự động có thêm bảng giá theo vùng. Trong lúc chờ đợi, người đọc có thể xem thêm tại <a href="/bang-gia">/bang-gia</a> và <a href="/chuoi-gia">/chuoi-gia</a>.</p></section>`,
  ].join('')

  const bodyText = [
    answerSummary,
    `Dữ liệu hiện phản ánh mức giá chung của ${nationalLabel}, chưa đủ vùng để dựng bảng.`,
    ...faq.map(item => `${item.question} ${item.answer}`),
  ].join('\n\n')

  const seo: PricePageSeoMeta = {
    title,
    description: excerpt,
    canonicalPath: buildGeneratedCommodityPricePagePath(page.commoditySlug),
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

function selectPrimaryPriceType(metrics: ScopeMetric[]) {
  const counts = PRICE_TYPE_PRIORITY.map(priceType => ({
    priceType,
    count: new Set(
      metrics
        .filter(metric => metric.priceType === priceType)
        .map(metric => `${metric.scope.scopeType}::${metric.scope.scopeKey}`),
    ).size,
  }))
  const best = counts.reduce(
    (current, candidate) => (candidate.count > current.count ? candidate : current),
    counts[0] ?? { priceType: 'farm_gate' as const, count: 0 },
  )
  return {
    counts,
    best,
  }
}

function buildCommodityCandidatePages(inputs: GenerationInputs, options: GeneratedCommodityPricePageGenerateOptions) {
  const metrics = buildScopeMetricsForCommodity(inputs, options.commoditySlug)
  const metricsByCommodity = new Map<string, ScopeMetric[]>()
  for (const metric of metrics) {
    const existing = metricsByCommodity.get(metric.commoditySlug) ?? []
    existing.push(metric)
    metricsByCommodity.set(metric.commoditySlug, existing)
  }

  const pages: CommodityCandidatePage[] = []
  for (const [commoditySlug, commodityMetrics] of metricsByCommodity.entries()) {
    const commodityName = commodityMetrics[0]?.commodityName ?? normalizeDisplayLabel(commoditySlug)
    const category = commodityMetrics[0]?.category ?? null
    const localMetrics = commodityMetrics.filter(metric => !isNationalScope(metric.scope))
    const nationalMetrics = commodityMetrics.filter(metric => isNationalScope(metric.scope))
    const localPrimary = selectPrimaryPriceType(localMetrics)
    const coverageByPriceType = Object.fromEntries(localPrimary.counts.map(item => [item.priceType, item.count]))

    if (localPrimary.best.count >= 2) {
      const selectedMetrics = localMetrics
        .filter(metric => metric.priceType === localPrimary.best.priceType)
        .sort((left, right) => {
          if (right.latestPriceVnd !== left.latestPriceVnd) {
            return right.latestPriceVnd - left.latestPriceVnd
          }

          if (left.scope.scopeType !== right.scope.scopeType) {
            return left.scope.scopeType === 'province' ? -1 : 1
          }

          return left.scope.locationLabel.localeCompare(right.scope.locationLabel, 'vi')
        })

      const latestBucketSum = selectedMetrics.reduce((sum, metric) => sum + metric.latestBucketSum, 0)
      const latestBucketCount = selectedMetrics.reduce((sum, metric) => sum + metric.latestBucketCount, 0)
      const yesterdayBucketSum = selectedMetrics.reduce((sum, metric) => sum + metric.yesterdayBucketSum, 0)
      const yesterdayBucketCount = selectedMetrics.reduce((sum, metric) => sum + metric.yesterdayBucketCount, 0)
      const sevenDaySum = selectedMetrics.reduce((sum, metric) => sum + metric.sevenDaySum, 0)
      const sevenDayCount = selectedMetrics.reduce((sum, metric) => sum + metric.sevenDayCount, 0)
      const lowestPriceVnd = selectedMetrics.reduce((current, metric) => Math.min(current, metric.latestPriceVnd), Number.POSITIVE_INFINITY)
      const highestPriceVnd = selectedMetrics.reduce((current, metric) => Math.max(current, metric.latestPriceVnd), Number.NEGATIVE_INFINITY)
      const topMetric = selectedMetrics[0]
      const bottomMetric = selectedMetrics[selectedMetrics.length - 1]
      const regionRows = selectedMetrics.map((metric, index) => ({
        scopeType: metric.scope.scopeType,
        scopeKey: metric.scope.scopeKey,
        provinceCode: metric.scope.provinceCode,
        regionLabel: metric.scope.regionLabel,
        locationLabel: metric.scope.locationLabel,
        locationSlug: metric.scope.locationSlug,
        path: buildGeneratedPricePagePath(metric.commoditySlug, metric.scope.locationSlug),
        priceType: metric.priceType,
        latestPriceVnd: metric.latestPriceVnd,
        latestPriceUnit: metric.latestPriceUnit,
        dayChangeVnd: metric.dayChangeVnd,
        dayChangePct: metric.dayChangePct,
        change7dVnd: metric.change7dVnd,
        change7dPct: metric.change7dPct,
        vsNationalAvgPct: metric.vsNationalAvgPct,
        minPrice7dVnd: metric.minPrice7dVnd,
        maxPrice7dVnd: metric.maxPrice7dVnd,
        observationCount7d: metric.observationCount7d,
        latestObservedOn: metric.latestDate,
        sortRank: index + 1,
      }))
      const headlineLatestPriceVnd = latestBucketCount > 0 ? latestBucketSum / latestBucketCount : 0
      const yesterdayAvg = yesterdayBucketCount > 0 ? yesterdayBucketSum / yesterdayBucketCount : 0
      const sevenDayAvg = sevenDayCount > 0 ? sevenDaySum / sevenDayCount : 0
      const dayChangeVnd = headlineLatestPriceVnd - yesterdayAvg
      const change7dVnd = headlineLatestPriceVnd - sevenDayAvg
      const varietySections = buildDurianVarietySections(
        commoditySlug,
        localPrimary.best.priceType,
        inputs,
        topMetric?.latestDate ?? new Date().toISOString().slice(0, 10),
      )
      const chainCards = buildCommodityChainCards(commoditySlug, inputs)

      pages.push({
        commoditySlug,
        commodityName,
        category,
        primaryPriceType: localPrimary.best.priceType,
        renderMode: 'regional_table',
        latestDate: topMetric?.latestDate ?? new Date().toISOString().slice(0, 10),
        headlineLatestPriceVnd: roundNumber(headlineLatestPriceVnd),
        headlineLatestPriceUnit: 'VND/kg',
        dayChangeVnd: roundNumber(dayChangeVnd),
        dayChangePct: roundNumber(yesterdayAvg > 0 ? (dayChangeVnd / yesterdayAvg) * 100 : 0),
        change7dVnd: roundNumber(change7dVnd),
        change7dPct: roundNumber(sevenDayAvg > 0 ? (change7dVnd / sevenDayAvg) * 100 : 0),
        lowestPriceVnd: roundNumber(lowestPriceVnd),
        highestPriceVnd: roundNumber(highestPriceVnd),
        priceSpreadVnd: roundNumber(highestPriceVnd - lowestPriceVnd),
        locationCount: selectedMetrics.length,
        provinceCount: selectedMetrics.filter(metric => metric.scope.scopeType === 'province').length,
        regionLabelCount: selectedMetrics.filter(metric => metric.scope.scopeType === 'region_label').length,
        nationalScopeLabel: null,
        regionRows,
        varietySections,
        metricsJson: {
          topLocationLabel: topMetric?.scope.locationLabel ?? null,
          bottomLocationLabel: bottomMetric?.scope.locationLabel ?? null,
          topLocationPriceVnd: topMetric?.latestPriceVnd ?? null,
          bottomLocationPriceVnd: bottomMetric?.latestPriceVnd ?? null,
          isNationalOnly: false,
          nationalOnlyReason: null,
          varietySectionCount: varietySections.length,
          chainCards,
          coverageByPriceType,
          updatedAtLabel: formatDateTime(`${topMetric?.latestDate ?? new Date().toISOString().slice(0, 10)}T08:00:00.000Z`),
        },
      })
      continue
    }

    const uniqueScopeKeys = new Set(commodityMetrics.map(metric => `${metric.scope.scopeType}::${metric.scope.scopeKey}`))
    if (uniqueScopeKeys.size === 1 && nationalMetrics.length > 0 && commodityMetrics.every(metric => isNationalScope(metric.scope))) {
      const nationalPrimary = selectPrimaryPriceType(nationalMetrics)
      const selectedMetric =
        nationalMetrics.find(metric => metric.priceType === nationalPrimary.best.priceType) ??
        nationalMetrics.find(metric => metric.priceType === PRICE_TYPE_PRIORITY[0]) ??
        nationalMetrics[0]

      if (!selectedMetric) {
        continue
      }

      pages.push({
        commoditySlug,
        commodityName,
        category,
        primaryPriceType: selectedMetric.priceType,
        renderMode: 'national_article',
        latestDate: selectedMetric.latestDate,
        headlineLatestPriceVnd: selectedMetric.latestPriceVnd,
        headlineLatestPriceUnit: selectedMetric.latestPriceUnit,
        dayChangeVnd: selectedMetric.dayChangeVnd,
        dayChangePct: selectedMetric.dayChangePct,
        change7dVnd: selectedMetric.change7dVnd,
        change7dPct: selectedMetric.change7dPct,
        lowestPriceVnd: selectedMetric.minPrice7dVnd,
        highestPriceVnd: selectedMetric.maxPrice7dVnd,
        priceSpreadVnd: roundNumber(selectedMetric.maxPrice7dVnd - selectedMetric.minPrice7dVnd),
        locationCount: 1,
        provinceCount: 0,
        regionLabelCount: 1,
        nationalScopeLabel: selectedMetric.scope.locationLabel,
        regionRows: [],
        varietySections: [],
        metricsJson: {
          topLocationLabel: selectedMetric.scope.locationLabel,
          bottomLocationLabel: selectedMetric.scope.locationLabel,
          topLocationPriceVnd: selectedMetric.latestPriceVnd,
          bottomLocationPriceVnd: selectedMetric.latestPriceVnd,
          isNationalOnly: true,
          nationalOnlyReason: 'single_national_scope',
          chainCards: buildCommodityChainCards(commoditySlug, inputs),
          coverageByPriceType: Object.fromEntries(nationalPrimary.counts.map(item => [item.priceType, item.count])),
          updatedAtLabel: formatDateTime(`${selectedMetric.latestDate}T08:00:00.000Z`),
        },
      })
    }
  }

  return pages
}

function toSummary(row: GeneratedCommodityPricePageRow): GeneratedCommodityPricePageSummary {
  const resolvedImage = resolveCommodityImage({
    commoditySlug: row.commodity_slug,
    commodityDisplayName: getCommodityDisplayName(row.commodity_slug, row.commodity_slug),
    category: row.category,
    pageKind: 'commodity_price_page',
  })

  return {
    id: row.id,
    slug: row.slug,
    path: buildGeneratedCommodityPricePagePath(row.commodity_slug),
    commoditySlug: row.commodity_slug,
    category: row.category,
    title: row.title,
    excerpt: row.excerpt,
    answerSummary: row.answer_summary,
    topicTags: row.topic_tags ?? [],
    thumbnailUrl: row.thumbnail_url ?? resolvedImage.url,
    thumbnailAlt: resolvedImage.alt,
    primaryPriceType: row.primary_price_type,
    renderMode: row.render_mode,
    headlineLatestPriceVnd: row.headline_latest_price_vnd,
    headlineLatestPriceUnit: row.headline_latest_price_unit,
    dayChangeVnd: row.day_change_vnd,
    dayChangePct: row.day_change_pct,
    change7dVnd: row.change_7d_vnd,
    change7dPct: row.change_7d_pct,
    lowestPriceVnd: row.lowest_price_vnd,
    highestPriceVnd: row.highest_price_vnd,
    priceSpreadVnd: row.price_spread_vnd,
    locationCount: row.location_count,
    latestObservedOn: row.latest_observed_on,
    nationalScopeLabel: row.national_scope_label,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    status: row.status,
  }
}

async function startGenerationRun(options: GeneratedCommodityPricePageGenerateOptions) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('generated_commodity_price_generation_runs')
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

async function finishGenerationRun(runId: string | null, result: GeneratedCommodityPricePageGenerateResult) {
  if (!runId) {
    return
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    return
  }

  const { error } = await client
    .from('generated_commodity_price_generation_runs')
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

  const { error } = await client.from('generated_commodity_price_page_snapshots').upsert(
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

function countCandidateCommodities(candidates: CommodityCandidatePage[]) {
  return new Set(candidates.map(candidate => candidate.commoditySlug)).size
}

export async function generateCommodityPricePages(
  options: GeneratedCommodityPricePageGenerateOptions = {},
): Promise<GeneratedCommodityPricePageGenerateResult> {
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

    const candidates = buildCommodityCandidatePages(inputs, options)
    const { data: existingData, error: existingError } = await client
      .from('generated_commodity_price_pages')
      .select('*')
      .order('updated_at', { ascending: false })

    if (existingError) {
      throw existingError
    }

    const existingRows = (existingData ?? []) as GeneratedCommodityPricePageRow[]
    const existingByCommodity = new Map(existingRows.map(row => [row.commodity_slug, row]))
    const touchedCommoditySlugs = new Set<string>()

    for (const page of candidates) {
      touchedCommoditySlugs.add(page.commoditySlug)
      const existing = existingByCommodity.get(page.commoditySlug)
      const copy =
        page.renderMode === 'national_article'
          ? buildNationalArticleCopy(page, page.commodityName)
          : buildRegionalTableCopy(page, page.commodityName)
      const resolvedImage = resolveCommodityImage({
        commoditySlug: page.commoditySlug,
        commodityDisplayName: page.commodityName,
        category: page.category,
        pageKind: 'commodity_price_page',
      })

      const payload = {
        slug: page.commoditySlug,
        commodity_slug: page.commoditySlug,
        category: page.category,
        title: copy.title,
        excerpt: copy.excerpt,
        answer_summary: copy.answerSummary,
        body_html: copy.bodyHtml,
        body_text: copy.bodyText,
        faq_json: copy.faq,
        seo_json: copy.seo,
        topic_tags: [page.commoditySlug, page.renderMode, page.category ?? 'gia-ca'],
        thumbnail_url: resolvedImage.url,
        primary_price_type: page.primaryPriceType,
        render_mode: page.renderMode,
        headline_latest_price_vnd: page.headlineLatestPriceVnd,
        headline_latest_price_unit: page.headlineLatestPriceUnit,
        day_change_vnd: page.dayChangeVnd,
        day_change_pct: page.dayChangePct,
        change_7d_vnd: page.change7dVnd,
        change_7d_pct: page.change7dPct,
        lowest_price_vnd: page.lowestPriceVnd,
        highest_price_vnd: page.highestPriceVnd,
        price_spread_vnd: page.priceSpreadVnd,
        location_count: page.locationCount,
        province_count: page.provinceCount,
        region_label_count: page.regionLabelCount,
        latest_observed_on: page.latestDate,
        national_scope_label: page.nationalScopeLabel,
        region_rows_json: page.regionRows,
        variety_sections_json: page.varietySections,
        metrics_json: page.metricsJson,
        status: 'published',
        published_at: existing?.published_at ?? new Date().toISOString(),
      }

      const { data, error } = await client
        .from('generated_commodity_price_pages')
        .upsert(payload, { onConflict: 'commodity_slug' })
        .select('*')
        .single()

      if (error) {
        errors.push(`${page.commoditySlug}: ${error.message}`)
        continue
      }

      if (existing) {
        updatedCount += 1
      } else {
        createdCount += 1
      }

      await insertSnapshot((data as GeneratedCommodityPricePageRow).id, page.latestDate, 'published', {
        title: copy.title,
        excerpt: copy.excerpt,
        renderMode: page.renderMode,
        headlineLatestPriceVnd: page.headlineLatestPriceVnd,
        locationCount: page.locationCount,
      })
    }

    const staleTargets = existingRows.filter(row => {
      if (touchedCommoditySlugs.has(row.commodity_slug)) {
        return false
      }

      if (options.commoditySlug && row.commodity_slug !== options.commoditySlug) {
        return false
      }

      return row.status !== STALE_STATUS
    })

    for (const row of staleTargets) {
      const nextSeo = parseSeoJson(row.seo_json, {
        title: row.title,
        description: row.excerpt,
        canonicalPath: buildGeneratedCommodityPricePagePath(row.commodity_slug),
        ogTitle: row.title,
        ogDescription: row.excerpt,
        noindex: true,
      })
      nextSeo.noindex = true

      const { error } = await client
        .from('generated_commodity_price_pages')
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

    skippedCount = Math.max(0, countCandidateCommodities(candidates) - createdCount - updatedCount - errors.length)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown generation failure'
    errors.push(message)
  }

  const result: GeneratedCommodityPricePageGenerateResult = {
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
  limit?: number
}

export async function listGeneratedCommodityPricePages(options: ListOptions = {}) {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return [] as GeneratedCommodityPricePageSummary[]
  }

  const client = getSupabaseReadClient()
  if (!client) {
    return []
  }

  try {
    let query = client
      .from('generated_commodity_price_pages')
      .select('*')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(Math.min(Math.max(options.limit ?? 24, 1), 5000))

    if (options.commoditySlug) {
      query = query.eq('commodity_slug', options.commoditySlug)
    }

    const { data, error } = await query
    if (error) {
      throw error
    }

    return ((data ?? []) as GeneratedCommodityPricePageRow[]).map(toSummary)
  } catch (error) {
    if (!isRelationMissing(error)) {
      console.error('[Commodity Price Pages] Failed to list generated commodity price pages:', error)
    }

    return []
  }
}

async function loadGeneratedCommodityPricePageRow(commoditySlug: string, allowStale: boolean) {
  const runtime = getSupabaseRuntimeStatus()
  const client = allowStale ? getSupabaseAdminClient() : getSupabaseReadClient()
  if (!(allowStale ? runtime.hasAdminConfig : runtime.hasReadConfig) || !client) {
    return null
  }

  let query = client
    .from('generated_commodity_price_pages')
    .select('*')
    .eq('commodity_slug', commoditySlug)
    .limit(1)

  if (!allowStale) {
    query = query.eq('status', 'published')
  }

  const { data, error } = await query
  if (error) {
    throw error
  }

  return ((data ?? []) as GeneratedCommodityPricePageRow[])[0] ?? null
}

async function loadRelatedCommodityPages(row: GeneratedCommodityPricePageRow) {
  const pages = await listGeneratedCommodityPricePages({ limit: 200 })
  return pages.filter(page => page.id !== row.id && page.category === row.category).slice(0, 4)
}

async function loadRelatedLocationPages(row: GeneratedCommodityPricePageRow) {
  return (await listGeneratedPricePages({ commoditySlug: row.commodity_slug, limit: 200 })).slice(0, 6)
}

export async function getGeneratedCommodityPricePageDetail(
  commoditySlug: string,
  options: { allowStale?: boolean } = {},
): Promise<GeneratedCommodityPricePageDetail | null> {
  try {
    const row = await loadGeneratedCommodityPricePageRow(commoditySlug, options.allowStale === true)
    if (!row) {
      return null
    }

    const summary = toSummary(row)
    const seoFallback: PricePageSeoMeta = {
      title: row.title,
      description: row.excerpt,
      canonicalPath: buildGeneratedCommodityPricePagePath(row.commodity_slug),
      ogTitle: row.title,
      ogDescription: row.excerpt,
      noindex: row.status === STALE_STATUS,
    }
    const [relatedCommodityPages, relatedLocationPages] = await Promise.all([
      loadRelatedCommodityPages(row),
      loadRelatedLocationPages(row),
    ])

    return {
      ...summary,
      bodyHtml: row.body_html,
      bodyText: row.body_text,
      faq: parseFaqJson(row.faq_json),
      seo: parseSeoJson(row.seo_json, seoFallback),
      regionRows: parseRegionRowsJson(row.region_rows_json),
      varietySections: parseVarietySectionsJson(row.variety_sections_json),
      chainCards: parseChainCardsFromMetricsJson(row.metrics_json),
      relatedCommodityPages,
      relatedLocationPages,
    }
  } catch (error) {
    if (!isRelationMissing(error)) {
      console.error('[Commodity Price Pages] Failed to load commodity page detail:', error)
    }

    return null
  }
}

export function toCommodityContentFeedItem(page: GeneratedCommodityPricePageSummary): ContentFeedItem {
  const familyMeta = getContentFamilyMeta('tin-gia-nong-san')
  const priceGroupMeta = getPriceCommodityGroupMeta(page.category)

  return {
    kind: 'commodity_price_page',
    path: page.path,
    title: page.title,
    excerpt: page.excerpt,
    thumbnailUrl: page.thumbnailUrl,
    thumbnailAlt: page.thumbnailAlt,
    publishedAt: page.publishedAt ?? page.updatedAt,
    updatedAt: page.updatedAt,
    category: page.category,
    topicTags: page.topicTags,
    badgeLabel: page.renderMode === 'national_article' ? 'Tin giá hôm nay' : 'Tổng hợp theo vùng',
    contentFamilySlug: familyMeta.contentFamilySlug,
    contentFamilyLabel: familyMeta.contentFamilyLabel,
    contentFamilyOrder: familyMeta.contentFamilyOrder,
    familyPath: familyMeta.familyPath,
    subcategoryPath: priceGroupMeta.subcategoryPath,
    priceGroupSlug: priceGroupMeta.priceGroupSlug,
    priceGroupLabel: priceGroupMeta.priceGroupLabel,
    commoditySlug: page.commoditySlug,
    primaryPriceType: page.primaryPriceType,
    locationCount: page.locationCount,
    renderMode: page.renderMode,
  }
}

export const __generatedCommodityPricePagesTestUtils = {
  buildScopeMetricsForCommodity,
  buildCommodityCandidatePages,
  buildGeneratedCommodityPricePagePath,
  buildRegionalTableCopy,
  buildNationalArticleCopy,
}
