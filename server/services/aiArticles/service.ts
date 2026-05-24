import { createHash } from 'node:crypto'
import { foldText } from '../crawlers/common.js'
import { getContentFamilyMeta, getPriceCommodityGroupMeta } from '../contentTaxonomy.js'
import { getCommodityCategory, getCommodityDisplayName } from '../generatedPricePages/service.js'
import type { ContentFamilySlug, ContentFeedItem, PriceCommodityGroupSlug } from '../generatedPricePages/types.js'
import { getSupabaseAdminClient, getSupabaseReadClient, getSupabaseRuntimeStatus } from '../supabaseClient.js'

export type AiArticleType = 'export_period_report' | 'export_monthly_report' | 'world_daily_price_update'
export type AiArticleStatus = 'draft' | 'published' | 'archived' | 'failed'
export type AiArticleGranularity = 'daily' | 'period' | 'monthly' | 'as_published' | 'mixed' | 'unknown'

type CustomsExportObservationRow = {
  crawled_at: string
  commodity_slug: string
  report_title: string | null
  report_url: string | null
  unit_value_vnd_per_kg: number | null
  unit_value_usd_per_kg: number | null
  unit_value_usd_per_ton: number | null
  quantity_ton: number | null
  value_usd: number | null
  cumulative_quantity_ton: number | null
  cumulative_value_usd: number | null
  data_granularity: string
  temporal_coverage: string
  period_type: string | null
  period_code: string | null
  period_label: string | null
  period_year: number | null
  period_month: number | null
  period_number: number | null
  period_start_date: string | null
  period_end_date: string | null
  aggregation_method: string | null
  geographic_scope: string | null
  source_detail: string | null
  raw_payload: Record<string, unknown> | null
}

type WorldPriceRow = {
  recorded_at: string
  observed_on: string | null
  crawl_recorded_at: string | null
  commodity_slug: string
  exchange: string
  price_usd: number
  price_unit: string
  price_vnd_kg: number | null
  change_1d: number | null
  change_1d_pct: number | null
  change_1w_pct: number | null
  data_granularity: string | null
  temporal_coverage: string | null
  benchmark_type: string | null
  source_id: string | null
  source_license_note: string | null
  quality_grade: string | null
  contract_symbol: string | null
  source_observation_label: string | null
  source_url: string | null
  raw_payload: Record<string, unknown> | null
}

type AiArticleRow = {
  id: string
  article_type: AiArticleType
  article_scope_key: string
  slug: string
  title: string
  excerpt: string | null
  answer_summary: string | null
  content_html: string | null
  content_text: string | null
  status: AiArticleStatus
  content_family_slug: ContentFamilySlug
  category: string | null
  topic_tags: string[] | null
  thumbnail_url: string | null
  source_label: string
  source_key: string
  source_facts_json: Record<string, unknown>
  data_cutoff: string | null
  data_granularity: AiArticleGranularity
  primary_period_code: string | null
  primary_observed_on: string | null
  seo_json: Record<string, unknown>
  quality_json: Record<string, unknown>
  model_name: string | null
  prompt_version: string
  published_at: string | null
  created_at: string
  updated_at: string
}

type ExportCommodityFact = {
  commoditySlug: string
  commodityName: string
  category: string | null
  quantityTon: number | null
  valueUsd: number | null
  unitValueUsdPerTon: number | null
  unitValueUsdPerKg: number | null
  unitValueVndPerKg: number | null
  periodCode: string | null
}

type WorldCommodityFact = {
  commoditySlug: string
  commodityName: string
  category: string | null
  exchange: string
  priceUsd: number
  priceUnit: string
  priceVndKg: number | null
  change1d: number | null
  change1dPct: number | null
  dataGranularity: string | null
  benchmarkType: string | null
  sourceId: string | null
  sourceUrl: string | null
  observedOn: string | null
  sourceObservationLabel: string | null
}

export type AiArticleContext =
  | {
      articleType: 'export_period_report'
      articleScopeKey: string
      titleHint: string
      contentFamilySlug: ContentFamilySlug
      category: string
      topicTags: string[]
      dataGranularity: AiArticleGranularity
      primaryPeriodCode: string
      primaryObservedOn: string | null
      dataCutoff: string
      period: {
        code: string
        label: string
        type: string
        year: number
        month: number
        number: number
        startDate: string
        endDate: string
      }
      totals: {
        quantityTon: number | null
        valueUsd: number | null
      }
      commodities: ExportCommodityFact[]
      sourceNotes: string[]
    }
  | {
      articleType: 'export_monthly_report'
      articleScopeKey: string
      titleHint: string
      contentFamilySlug: ContentFamilySlug
      category: string
      topicTags: string[]
      dataGranularity: AiArticleGranularity
      primaryPeriodCode: string
      primaryObservedOn: string | null
      dataCutoff: string
      month: {
        year: number
        month: number
        label: string
        periodCodes: string[]
        periodCount: number
      }
      totals: {
        quantityTon: number | null
        valueUsd: number | null
      }
      commodities: ExportCommodityFact[]
      sourceNotes: string[]
    }
  | {
      articleType: 'world_daily_price_update'
      articleScopeKey: string
      titleHint: string
      contentFamilySlug: ContentFamilySlug
      category: string
      topicTags: string[]
      dataGranularity: AiArticleGranularity
      primaryPeriodCode: null
      primaryObservedOn: string
      dataCutoff: string
      observedOn: string
      dailySignals: WorldCommodityFact[]
      referenceBenchmarks: WorldCommodityFact[]
      sourceNotes: string[]
    }

type AiDraft = {
  title: string
  excerpt: string
  answerSummary?: string
  bodyMarkdown: string
  seo?: {
    title?: string
    description?: string
    canonicalPath?: string
    faq?: Array<{ question: string; answer: string }>
  }
  topicTags?: string[]
}

export type AiArticleSummary = {
  id: string
  slug: string
  path: string
  articleType: AiArticleType
  title: string
  excerpt: string | null
  thumbnailUrl: string | null
  sourceKey: string
  sourceLabel: string
  publishedAt: string
  updatedAt: string
  sortAt: string
  category: string | null
  topicTags: string[]
  contentFamilySlug: ContentFamilySlug
  contentFamilyLabel: string
  familyPath: string
  badgeLabel: string
  dataGranularity: AiArticleGranularity
  primaryPeriodCode: string | null
  primaryObservedOn: string | null
  status: AiArticleStatus
}

export type AiArticleDetail = AiArticleSummary & {
  contentHtml: string | null
  contentText: string | null
  author: string | null
  canonicalUrl: string
  fetchedAt: string
  sourceFacts: Record<string, unknown>
  seo: Record<string, unknown>
}

export type GenerateAiArticlesOptions = {
  articleType?: AiArticleType
  periodCode?: string
  year?: number
  month?: number
  observedOn?: string
  force?: boolean
}

export type GenerateAiArticlesResult = {
  status: 'success' | 'partial' | 'failed' | 'skipped'
  createdCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  errors: string[]
  articles: AiArticleSummary[]
}

const PROMPT_VERSION = 'ai-articles-v1'
const AI_ARTICLE_SOURCE_LABEL = 'NongSanVN AI'
const AI_ARTICLE_SOURCE_KEY = 'nongsanvn_ai'
const DEFAULT_MODEL = 'gemini-3.1-flash-lite'
const DEFAULT_THUMBNAIL_URL =
  'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80'
const AI_ARTICLE_COMMODITY_LABELS: Record<string, string> = {
  'rice-5pct': 'Gạo 5% tấm',
  'rice-25pct': 'Gạo 25% tấm',
  'rice-thai': 'Gạo Thái A.1 Super',
  'coffee-robusta': 'Cà phê Robusta',
  'coffee-arabica': 'Cà phê Arabica',
  'rubber-rss3': 'Cao su RSS3',
  'rubber-tsr20': 'Cao su TSR20',
  cashew: 'Hạt điều',
  cassava: 'Sắn',
  'ho-tieu': 'Hồ tiêu',
  'pepper-black': 'Tiêu đen',
  'tea-avg': 'Chè',
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback
  }

  if (value.toLowerCase() === 'true') {
    return true
  }

  if (value.toLowerCase() === 'false') {
    return false
  }

  return fallback
}

function roundNumber(value: number, digits = 2) {
  return Number(value.toFixed(digits))
}

function compactNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? roundNumber(value, 4) : null
}

function sumNullable(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (valid.length === 0) {
    return null
  }

  return roundNumber(valid.reduce((sum, value) => sum + value, 0), 4)
}

function toDateKey(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function slugifyAiArticle(value: string) {
  return foldText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
}

function articlePath(slug: string) {
  return `/tin-tuc/${slug}`
}

function getModelName() {
  const configuredModel = process.env.GEMINI_MODEL?.trim() || process.env.AI_ARTICLE_MODEL?.trim() || DEFAULT_MODEL
  if (configuredModel === 'gemini-3.1-flash') {
    return DEFAULT_MODEL
  }

  return configuredModel
}

function getPublishStatus(): AiArticleStatus {
  return process.env.AI_ARTICLE_PUBLISH_MODE?.trim() === 'publish' ? 'published' : 'draft'
}

function getAiArticlesEnabled() {
  return parseBoolean(process.env.AI_ARTICLE_ENABLED, false)
}

function getArticleTimestamp(row: AiArticleRow) {
  return row.published_at ?? row.updated_at ?? row.created_at
}

function toDateTimestamp(value: string | null | undefined) {
  return value ? `${value.slice(0, 10)}T00:00:00.000Z` : null
}

function getArticleSortTimestamp(row: Pick<AiArticleRow, 'primary_observed_on' | 'published_at' | 'updated_at' | 'created_at'>) {
  return toDateTimestamp(row.primary_observed_on) ?? row.published_at ?? row.updated_at ?? row.created_at
}

function getCommodityName(slug: string) {
  if (AI_ARTICLE_COMMODITY_LABELS[slug]) {
    return AI_ARTICLE_COMMODITY_LABELS[slug]
  }

  return getCommodityDisplayName(slug, slug)
}

function getCommodityGroup(slug: string, fallbackCategory: string | null) {
  return getCommodityCategory(slug, fallbackCategory)
}

function toExportCommodityFact(row: CustomsExportObservationRow): ExportCommodityFact {
  const category = getCommodityGroup(row.commodity_slug, null)
  return {
    commoditySlug: row.commodity_slug,
    commodityName: getCommodityName(row.commodity_slug),
    category,
    quantityTon: compactNumber(row.quantity_ton),
    valueUsd: compactNumber(row.value_usd),
    unitValueUsdPerTon: compactNumber(row.unit_value_usd_per_ton),
    unitValueUsdPerKg: compactNumber(row.unit_value_usd_per_kg),
    unitValueVndPerKg: compactNumber(row.unit_value_vnd_per_kg),
    periodCode: row.period_code,
  }
}

function aggregateExportCommodityFacts(rows: CustomsExportObservationRow[]) {
  const byCommodity = new Map<string, ExportCommodityFact & { valueTotal: number; quantityTotal: number }>()

  for (const row of rows) {
    const existing =
      byCommodity.get(row.commodity_slug) ??
      ({
        ...toExportCommodityFact(row),
        valueTotal: 0,
        quantityTotal: 0,
      } satisfies ExportCommodityFact & { valueTotal: number; quantityTotal: number })

    if (typeof row.value_usd === 'number') {
      existing.valueTotal += row.value_usd
    }

    if (typeof row.quantity_ton === 'number') {
      existing.quantityTotal += row.quantity_ton
    }

    existing.valueUsd = existing.valueTotal > 0 ? roundNumber(existing.valueTotal, 4) : existing.valueUsd
    existing.quantityTon = existing.quantityTotal > 0 ? roundNumber(existing.quantityTotal, 4) : existing.quantityTon
    existing.unitValueUsdPerTon =
      existing.valueTotal > 0 && existing.quantityTotal > 0 ? roundNumber(existing.valueTotal / existing.quantityTotal, 4) : null
    existing.unitValueUsdPerKg =
      existing.unitValueUsdPerTon !== null ? roundNumber(existing.unitValueUsdPerTon / 1000, 6) : null
    byCommodity.set(row.commodity_slug, existing)
  }

  return [...byCommodity.values()]
    .map(({ valueTotal, quantityTotal, ...fact }) => {
      void valueTotal
      void quantityTotal
      return fact
    })
    .sort((left, right) => (right.valueUsd ?? 0) - (left.valueUsd ?? 0))
}

export function buildExportPeriodArticleContextFromRows(rows: CustomsExportObservationRow[]): AiArticleContext | null {
  if (rows.length === 0) {
    return null
  }

  const first = rows[0]
  if (
    !first.period_code ||
    !first.period_label ||
    !first.period_year ||
    !first.period_month ||
    !first.period_number ||
    !first.period_start_date ||
    !first.period_end_date
  ) {
    return null
  }

  const commodities = rows.map(toExportCommodityFact).sort((left, right) => (right.valueUsd ?? 0) - (left.valueUsd ?? 0))
  return {
    articleType: 'export_period_report',
    articleScopeKey: first.period_code,
    titleHint: `Bao cao xuat khau nong san ${first.period_label}`,
    contentFamilySlug: 'xuat-khau-va-doanh-nghiep',
    category: 'Xuat khau',
    topicTags: ['xuat-khau', 'hai-quan', 'nong-san', first.period_code],
    dataGranularity: 'period',
    primaryPeriodCode: first.period_code,
    primaryObservedOn: first.period_end_date,
    dataCutoff: rows.reduce((latest, row) => (row.crawled_at > latest ? row.crawled_at : latest), first.crawled_at),
    period: {
      code: first.period_code,
      label: first.period_label,
      type: first.period_type ?? 'customs_semimonthly',
      year: first.period_year,
      month: first.period_month,
      number: first.period_number,
      startDate: first.period_start_date,
      endDate: first.period_end_date,
    },
    totals: {
      quantityTon: sumNullable(rows.map(row => row.quantity_ton)),
      valueUsd: sumNullable(rows.map(row => row.value_usd)),
    },
    commodities,
    sourceNotes: [
      'Nguon du lieu la gia tri don vi xuat khau tu bao cao Hai quan theo ky.',
      'Khong dien giai thanh du lieu ngay; period_type phai giu customs_semimonthly.',
    ],
  }
}

export function buildExportPeriodArticleContextsFromRows(rows: CustomsExportObservationRow[]) {
  const byPeriod = new Map<string, CustomsExportObservationRow[]>()
  for (const row of rows) {
    if (!row.period_code) {
      continue
    }

    const group = byPeriod.get(row.period_code) ?? []
    group.push(row)
    byPeriod.set(row.period_code, group)
  }

  return [...byPeriod.values()]
    .map(group => buildExportPeriodArticleContextFromRows(group))
    .filter((context): context is Extract<AiArticleContext, { articleType: 'export_period_report' }> => context !== null)
    .sort((left, right) => (right.primaryObservedOn ?? '').localeCompare(left.primaryObservedOn ?? ''))
}

export function buildExportMonthlyArticleContextFromRows(rows: CustomsExportObservationRow[]): AiArticleContext | null {
  if (rows.length === 0) {
    return null
  }

  const first = rows[0]
  if (!first.period_year || !first.period_month) {
    return null
  }

  const periodCodes = [...new Set(rows.map(row => row.period_code).filter((value): value is string => Boolean(value)))].sort()
  const periodNumbers = new Set(rows.map(row => row.period_number).filter((value): value is number => typeof value === 'number'))
  if (periodNumbers.size < 2) {
    return null
  }

  const key = monthKey(first.period_year, first.period_month)
  const commodities = aggregateExportCommodityFacts(rows)
  return {
    articleType: 'export_monthly_report',
    articleScopeKey: key,
    titleHint: `Bao cao xuat khau nong san thang ${first.period_month}/${first.period_year}`,
    contentFamilySlug: 'xuat-khau-va-doanh-nghiep',
    category: 'Xuat khau',
    topicTags: ['xuat-khau', 'hai-quan', 'nong-san', key],
    dataGranularity: 'monthly',
    primaryPeriodCode: key,
    primaryObservedOn: rows
      .map(row => row.period_end_date)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null,
    dataCutoff: rows.reduce((latest, row) => (row.crawled_at > latest ? row.crawled_at : latest), first.crawled_at),
    month: {
      year: first.period_year,
      month: first.period_month,
      label: `Thang ${first.period_month}/${first.period_year}`,
      periodCodes,
      periodCount: periodNumbers.size,
    },
    totals: {
      quantityTon: sumNullable(rows.map(row => row.quantity_ton)),
      valueUsd: sumNullable(rows.map(row => row.value_usd)),
    },
    commodities,
    sourceNotes: [
      'Bao cao thang chi duoc tao khi co du cac ky hai quan trong thang.',
      'So lieu la tong hop theo ky hai quan, khong phai gia giao dich hang ngay.',
    ],
  }
}

export function buildExportMonthlyArticleContextsFromRows(rows: CustomsExportObservationRow[]) {
  const byMonth = new Map<string, CustomsExportObservationRow[]>()
  for (const row of rows) {
    if (!row.period_year || !row.period_month) {
      continue
    }

    const key = monthKey(row.period_year, row.period_month)
    const group = byMonth.get(key) ?? []
    group.push(row)
    byMonth.set(key, group)
  }

  return [...byMonth.values()]
    .map(group => buildExportMonthlyArticleContextFromRows(group))
    .filter((context): context is Extract<AiArticleContext, { articleType: 'export_monthly_report' }> => context !== null)
    .sort((left, right) => (right.primaryObservedOn ?? '').localeCompare(left.primaryObservedOn ?? ''))
}

function toWorldCommodityFact(row: WorldPriceRow): WorldCommodityFact {
  const rawName = typeof row.raw_payload?.name === 'string' ? row.raw_payload.name : row.commodity_slug
  const rawCategory = typeof row.raw_payload?.category === 'string' ? row.raw_payload.category : null
  return {
    commoditySlug: row.commodity_slug,
    commodityName: getCommodityDisplayName(row.commodity_slug, rawName),
    category: getCommodityGroup(row.commodity_slug, rawCategory),
    exchange: row.exchange,
    priceUsd: row.price_usd,
    priceUnit: row.price_unit,
    priceVndKg: compactNumber(row.price_vnd_kg),
    change1d: compactNumber(row.change_1d),
    change1dPct: compactNumber(row.change_1d_pct),
    dataGranularity: row.data_granularity,
    benchmarkType: row.benchmark_type,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    observedOn: toDateKey(row.observed_on),
    sourceObservationLabel: row.source_observation_label,
  }
}

export function buildWorldDailyArticleContextFromRows(rows: WorldPriceRow[], observedOn?: string): AiArticleContext | null {
  const dailyRows = rows.filter(row => row.data_granularity === 'daily')
  if (dailyRows.length === 0) {
    return null
  }

  const selectedObservedOn =
    observedOn ??
    dailyRows
      .map(row => toDateKey(row.observed_on))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1)
  if (!selectedObservedOn) {
    return null
  }

  const selectedDailyRows = dailyRows.filter(row => toDateKey(row.observed_on) === selectedObservedOn)
  if (selectedDailyRows.length === 0) {
    return null
  }

  const referenceRows = rows.filter(row => {
    const observedDate = toDateKey(row.observed_on)
    return (
      (!observedDate || observedDate <= selectedObservedOn) &&
      (row.data_granularity === 'weekly' ||
        row.data_granularity === 'monthly' ||
        row.data_granularity === 'period' ||
        row.data_granularity === 'as_published')
    )
  })
  return {
    articleType: 'world_daily_price_update',
    articleScopeKey: selectedObservedOn,
    titleHint: `Cap nhat gia nong san the gioi ngay ${selectedObservedOn}`,
    contentFamilySlug: 'gia-nong-san-the-gioi',
    category: 'Gia the gioi',
    topicTags: ['gia-the-gioi', 'nong-san', 'xuat-khau', selectedObservedOn],
    dataGranularity: 'daily',
    primaryPeriodCode: null,
    primaryObservedOn: selectedObservedOn,
    dataCutoff: selectedDailyRows.reduce(
      (latest, row) => ((row.crawl_recorded_at ?? row.recorded_at) > latest ? row.crawl_recorded_at ?? row.recorded_at : latest),
      selectedDailyRows[0].crawl_recorded_at ?? selectedDailyRows[0].recorded_at,
    ),
    observedOn: selectedObservedOn,
    dailySignals: selectedDailyRows.map(toWorldCommodityFact).sort((left, right) => Math.abs(right.change1dPct ?? 0) - Math.abs(left.change1dPct ?? 0)),
    referenceBenchmarks: referenceRows.map(toWorldCommodityFact),
    sourceNotes: [
      'Chi cac hang co data_granularity=daily moi duoc goi la bien dong ngay.',
      'Benchmark as_published/monthly chi la tham chieu moi nhat, khong dua vao headline daily.',
    ],
  }
}

export function buildWorldDailyArticleContextsFromRows(rows: WorldPriceRow[]) {
  const observedDates = [
    ...new Set(
      rows
        .filter(row => row.data_granularity === 'daily')
        .map(row => toDateKey(row.observed_on))
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => right.localeCompare(left))

  return observedDates
    .map(observedOn => buildWorldDailyArticleContextFromRows(rows, observedOn))
    .filter((context): context is Extract<AiArticleContext, { articleType: 'world_daily_price_update' }> => context !== null)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function markdownToHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const html: string[] = []
  let listItems: string[] = []
  let tableRows: string[][] = []

  const inlineHtml = (value: string) =>
    escapeHtml(value)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')

  const flushList = () => {
    if (listItems.length > 0) {
      html.push(`<ul>${listItems.map(item => `<li>${inlineHtml(item)}</li>`).join('')}</ul>`)
      listItems = []
    }
  }

  const flushTable = () => {
    if (tableRows.length === 0) {
      return
    }

    const [head, ...body] = tableRows
    html.push(
      [
        '<table>',
        `<thead><tr>${head.map(cell => `<th>${inlineHtml(cell)}</th>`).join('')}</tr></thead>`,
        `<tbody>${body.map(row => `<tr>${row.map(cell => `<td>${inlineHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`,
        '</table>',
      ].join(''),
    )
    tableRows = []
  }

  const isMarkdownTableLine = (line: string) => line.startsWith('|') && line.endsWith('|')
  const parseTableCells = (line: string) => line.split('|').slice(1, -1).map(cell => cell.trim())
  const isTableDivider = (cells: string[]) => cells.every(cell => /^:?-{3,}:?$/.test(cell))

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushList()
      flushTable()
      continue
    }

    if (isMarkdownTableLine(line)) {
      flushList()
      const cells = parseTableCells(line)
      if (!isTableDivider(cells)) {
        tableRows.push(cells)
      }
      continue
    }

    if (line.startsWith('### ')) {
      flushList()
      flushTable()
      html.push(`<h3>${inlineHtml(line.slice(4))}</h3>`)
      continue
    }

    if (line.startsWith('## ')) {
      flushList()
      flushTable()
      html.push(`<h2>${inlineHtml(line.slice(3))}</h2>`)
      continue
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushTable()
      listItems.push(line.slice(2))
      continue
    }

    flushList()
    flushTable()
    html.push(`<p>${inlineHtml(line)}</p>`)
  }

  flushList()
  flushTable()
  return html.join('\n')
}

function markdownToText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractJsonFromText(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    return fenced[1].trim()
  }

  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1)
  }

  return trimmed
}

function parseAiDraft(value: string): AiDraft {
  const parsed = JSON.parse(extractJsonFromText(value)) as Partial<AiDraft>
  if (
    typeof parsed.title !== 'string' ||
    typeof parsed.excerpt !== 'string' ||
    typeof parsed.bodyMarkdown !== 'string' ||
    parsed.title.trim().length === 0 ||
    parsed.excerpt.trim().length === 0 ||
    parsed.bodyMarkdown.trim().length === 0
  ) {
    throw new Error('AI response is missing title, excerpt, or bodyMarkdown')
  }

  return {
    title: parsed.title.trim(),
    excerpt: parsed.excerpt.trim(),
    answerSummary: typeof parsed.answerSummary === 'string' ? parsed.answerSummary.trim() : parsed.excerpt.trim(),
    bodyMarkdown: parsed.bodyMarkdown.trim(),
    seo: parsed.seo,
    topicTags: Array.isArray(parsed.topicTags) ? parsed.topicTags.filter((tag): tag is string => typeof tag === 'string') : undefined,
  }
}

function buildArticlePrompt(context: AiArticleContext) {
  const rules = [
    'Ban la bien tap vien NongSanVN viet tieng Viet cho nha xuat khau, thuong lai va doanh nghiep nong san.',
    'Chi su dung so lieu trong SOURCE_FACTS. Khong bia so, khong copy noi dung tu bao chi, khong dua loi khuyen dau tu.',
    'Neu articleType=export_period_report, goi dung la bai theo ky hai quan, khong goi la bao cao thang.',
    'Neu articleType=export_monthly_report, goi la bao cao thang vi SOURCE_FACTS da co du ky trong thang.',
    'Neu articleType=world_daily_price_update, chi goi daily voi dailySignals; referenceBenchmarks khong duoc goi la bien dong ngay.',
    'Viet theo SEO va AEO: co cau tra loi ngan o dau bai, heading ro, FAQ ngan neu phu hop.',
    'Co the dung bang Markdown don gian neu can so sanh so lieu; khong dung HTML raw.',
    'Tra ve JSON hop le duy nhat: title, excerpt, answerSummary, bodyMarkdown, topicTags, seo.title, seo.description, seo.faq.',
  ]

  return `${rules.join('\n')}\n\nSOURCE_FACTS:\n${JSON.stringify(context, null, 2)}`
}

async function callGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required to generate AI articles')
  }

  const model = getModelName()
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json',
        },
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Gemini request failed with HTTP ${response.status}: ${await response.text()}`)
  }

  const json = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = json.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('\n').trim()
  if (!text) {
    throw new Error('Gemini returned an empty response')
  }

  return { model, text }
}

function validateDraft(context: AiArticleContext, draft: AiDraft) {
  const warnings: string[] = []
  const folded = foldText([draft.title, draft.excerpt, draft.bodyMarkdown].join(' '))

  if (context.articleType === 'export_period_report' && folded.includes('bao cao thang')) {
    warnings.push('Period article mentions monthly report wording')
  }

  if (context.articleType === 'world_daily_price_update') {
    const hasDailyRice = context.dailySignals.some(item => item.commoditySlug.startsWith('rice-'))
    const impliesDailyRice = foldText(draft.bodyMarkdown)
      .split(/\n|[.!?;]/)
      .some(segment => {
        const movementIndex = segment.indexOf('bien dong')
        if (movementIndex < 0) {
          return false
        }

        const riceIndexes = [
          segment.indexOf('gao'),
          segment.search(/\brice\b/),
        ].filter(index => index >= 0)
        return riceIndexes.some(index => Math.abs(index - movementIndex) <= 80)
      })
    if (!hasDailyRice && impliesDailyRice) {
      warnings.push('Article may imply rice has a daily signal without a daily rice source')
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
    factHash: hashJson(context),
    generatedAt: new Date().toISOString(),
  }
}

function buildSlugForContext(context: AiArticleContext, title: string) {
  if (context.articleType === 'export_period_report') {
    return slugifyAiArticle(`xuat-khau-nong-san-${context.primaryPeriodCode}`)
  }

  if (context.articleType === 'export_monthly_report') {
    return slugifyAiArticle(`bao-cao-xuat-khau-nong-san-${context.articleScopeKey}`)
  }

  if (context.articleType === 'world_daily_price_update') {
    return slugifyAiArticle(`gia-nong-san-the-gioi-${context.primaryObservedOn}`)
  }

  return slugifyAiArticle(title)
}

function toArticleSummary(row: AiArticleRow): AiArticleSummary {
  const familyMeta = getContentFamilyMeta(row.content_family_slug)
  return {
    id: row.id,
    slug: row.slug,
    path: articlePath(row.slug),
    articleType: row.article_type,
    title: row.title,
    excerpt: row.excerpt,
    thumbnailUrl: row.thumbnail_url,
    sourceKey: row.source_key,
    sourceLabel: row.source_label,
    publishedAt: getArticleTimestamp(row),
    updatedAt: row.updated_at,
    sortAt: getArticleSortTimestamp(row),
    category: row.category,
    topicTags: row.topic_tags ?? [],
    contentFamilySlug: familyMeta.contentFamilySlug,
    contentFamilyLabel: familyMeta.contentFamilyLabel,
    familyPath: familyMeta.familyPath,
    badgeLabel: familyMeta.badgeLabel,
    dataGranularity: row.data_granularity,
    primaryPeriodCode: row.primary_period_code,
    primaryObservedOn: row.primary_observed_on,
    status: row.status,
  }
}

function toArticleDetail(row: AiArticleRow): AiArticleDetail {
  return {
    ...toArticleSummary(row),
    contentHtml: row.content_html,
    contentText: row.content_text,
    author: AI_ARTICLE_SOURCE_LABEL,
    canonicalUrl: articlePath(row.slug),
    fetchedAt: row.updated_at,
    sourceFacts: row.source_facts_json,
    seo: row.seo_json,
  }
}

export function toAiArticleContentFeedItem(article: AiArticleSummary): ContentFeedItem {
  const priceGroupMeta =
    article.contentFamilySlug === 'tin-gia-nong-san' ? getPriceCommodityGroupMeta(article.category) : null

  return {
    kind: 'ai_article',
    path: article.path,
    title: article.title,
    excerpt: article.excerpt,
    thumbnailUrl: article.thumbnailUrl,
    thumbnailAlt: article.title,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    category: article.category,
    topicTags: article.topicTags,
    badgeLabel: article.badgeLabel,
    contentFamilySlug: article.contentFamilySlug,
    contentFamilyLabel: article.contentFamilyLabel,
    contentFamilyOrder: getContentFamilyMeta(article.contentFamilySlug).contentFamilyOrder,
    familyPath: article.familyPath,
    subcategoryPath: priceGroupMeta?.subcategoryPath ?? null,
    priceGroupSlug: (priceGroupMeta?.priceGroupSlug ?? null) as PriceCommodityGroupSlug | null,
    priceGroupLabel: priceGroupMeta?.priceGroupLabel ?? null,
    sourceLabel: article.sourceLabel,
    sourceKey: article.sourceKey,
    articleType: article.articleType,
    dataGranularity: article.dataGranularity,
    sortAt: article.sortAt,
  }
}

function isRelationMissing(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return code === 'PGRST205' || code === 'PGRST204' || message.includes('relation') || message.includes('does not exist')
}

async function insertRun(context: AiArticleContext, status: 'started' | 'skipped' | 'failed' | 'success', error?: string) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const { data, error: insertError } = await client
    .from('ai_article_generation_runs')
    .insert({
      article_type: context.articleType,
      article_scope_key: context.articleScopeKey,
      status,
      source_facts_hash: hashJson(context),
      model_name: getModelName(),
      prompt_version: PROMPT_VERSION,
      finished_at: status === 'started' ? null : new Date().toISOString(),
      error: error ?? null,
      metadata_json: { dataGranularity: context.dataGranularity },
    })
    .select('id')
    .single()

  if (insertError) {
    console.warn('[AI Articles] Failed to insert generation run:', insertError)
    return null
  }

  return data?.id as string | null
}

async function updateRun(runId: string | null, status: 'success' | 'skipped' | 'failed', articleId: string | null, error?: string) {
  const client = getSupabaseAdminClient()
  if (!client || !runId) {
    return
  }

  const { error: updateError } = await client
    .from('ai_article_generation_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      article_id: articleId,
      error: error ?? null,
    })
    .eq('id', runId)

  if (updateError) {
    console.warn('[AI Articles] Failed to update generation run:', updateError)
  }
}

async function persistGeneratedArticle(context: AiArticleContext, draft: AiDraft, modelName: string, quality: Record<string, unknown>) {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('Supabase admin client is required to persist AI articles')
  }

  const status = getPublishStatus()
  const slug = buildSlugForContext(context, draft.title)
  const topicTags = [...new Set([...(draft.topicTags ?? []), ...context.topicTags])].slice(0, 12)
  const bodyHtml = markdownToHtml(draft.bodyMarkdown)
  const bodyText = markdownToText(draft.bodyMarkdown)
  const publishedAt = status === 'published' ? new Date().toISOString() : null

  const row = {
    article_type: context.articleType,
    article_scope_key: context.articleScopeKey,
    slug,
    title: draft.title,
    excerpt: draft.excerpt,
    answer_summary: draft.answerSummary ?? draft.excerpt,
    content_html: bodyHtml,
    content_text: bodyText,
    status,
    content_family_slug: context.contentFamilySlug,
    category: context.category,
    topic_tags: topicTags,
    thumbnail_url: DEFAULT_THUMBNAIL_URL,
    source_label: AI_ARTICLE_SOURCE_LABEL,
    source_key: AI_ARTICLE_SOURCE_KEY,
    source_facts_json: context,
    data_cutoff: context.dataCutoff,
    data_granularity: context.dataGranularity,
    primary_period_code: context.primaryPeriodCode,
    primary_observed_on: context.primaryObservedOn,
    seo_json: draft.seo ?? {},
    quality_json: quality,
    model_name: modelName,
    prompt_version: PROMPT_VERSION,
    published_at: publishedAt,
  }

  const existing = await client
    .from('ai_generated_articles')
    .select('id')
    .eq('article_type', context.articleType)
    .eq('article_scope_key', context.articleScopeKey)
    .maybeSingle()
  if (existing.error) {
    throw existing.error
  }

  const { data, error } = await client
    .from('ai_generated_articles')
    .upsert(row, { onConflict: 'article_type,article_scope_key' })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return {
    article: toArticleSummary(data as AiArticleRow),
    created: !existing.data,
  }
}

async function generateOne(context: AiArticleContext, force = false) {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('Supabase admin client is required to generate AI articles')
  }

  if (!force) {
    const existing = await client
      .from('ai_generated_articles')
      .select('*')
      .eq('article_type', context.articleType)
      .eq('article_scope_key', context.articleScopeKey)
      .maybeSingle()
    if (existing.error) {
      throw existing.error
    }

    if (existing.data) {
      return { status: 'skipped' as const, article: toArticleSummary(existing.data as AiArticleRow), created: false }
    }
  }

  const runId = await insertRun(context, 'started')
  try {
    const { model, text } = await callGemini(buildArticlePrompt(context))
    const draft = parseAiDraft(text)
    const quality = validateDraft(context, draft)
    const persisted = await persistGeneratedArticle(context, draft, model, quality)
    await updateRun(runId, 'success', persisted.article.id)
    return { status: 'success' as const, article: persisted.article, created: persisted.created }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await updateRun(runId, 'failed', null, message)
    throw error
  }
}

async function loadCustomsRowsByPeriod(periodCode: string) {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('customs_export_observations_public')
    .select('*')
    .eq('period_code', periodCode)
    .order('value_usd', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as CustomsExportObservationRow[]
}

async function loadAllCustomsRows() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('customs_export_observations_public')
    .select('*')
    .not('period_code', 'is', null)
    .order('period_end_date', { ascending: false })
    .order('value_usd', { ascending: false })
    .limit(5000)

  if (error) {
    throw error
  }

  return (data ?? []) as CustomsExportObservationRow[]
}

async function loadLatestCustomsPeriodCode() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('customs_export_observations_public')
    .select('period_code, period_end_date')
    .not('period_code', 'is', null)
    .order('period_end_date', { ascending: false })
    .limit(1)

  if (error) {
    throw error
  }

  return (data?.[0] as { period_code?: string | null } | undefined)?.period_code ?? null
}

async function loadCustomsRowsByMonth(year: number, month: number) {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('customs_export_observations_public')
    .select('*')
    .eq('period_year', year)
    .eq('period_month', month)
    .order('period_number', { ascending: true })
    .order('value_usd', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as CustomsExportObservationRow[]
}

async function loadLatestCompleteCustomsMonth() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('customs_export_observations_public')
    .select('period_year, period_month, period_number, period_end_date')
    .not('period_year', 'is', null)
    .not('period_month', 'is', null)
    .not('period_number', 'is', null)
    .order('period_end_date', { ascending: false })
    .limit(300)

  if (error) {
    throw error
  }

  const byMonth = new Map<string, { year: number; month: number; periodNumbers: Set<number>; maxEndDate: string }>()
  for (const row of (data ?? []) as Array<{ period_year: number; period_month: number; period_number: number; period_end_date: string }>) {
    const key = monthKey(row.period_year, row.period_month)
    const existing =
      byMonth.get(key) ??
      ({
        year: row.period_year,
        month: row.period_month,
        periodNumbers: new Set<number>(),
        maxEndDate: row.period_end_date,
      } satisfies { year: number; month: number; periodNumbers: Set<number>; maxEndDate: string })
    existing.periodNumbers.add(row.period_number)
    if (row.period_end_date > existing.maxEndDate) {
      existing.maxEndDate = row.period_end_date
    }
    byMonth.set(key, existing)
  }

  return [...byMonth.values()]
    .filter(item => item.periodNumbers.size >= 2)
    .sort((left, right) => right.maxEndDate.localeCompare(left.maxEndDate))[0] ?? null
}

async function loadWorldRows() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('latest_world_prices_public')
    .select(
      [
        'recorded_at',
        'observed_on',
        'crawl_recorded_at',
        'commodity_slug',
        'exchange',
        'price_usd',
        'price_unit',
        'price_vnd_kg',
        'change_1d',
        'change_1d_pct',
        'change_1w_pct',
        'data_granularity',
        'temporal_coverage',
        'benchmark_type',
        'source_id',
        'source_license_note',
        'quality_grade',
        'contract_symbol',
        'source_observation_label',
        'source_url',
        'raw_payload',
      ].join(', '),
    )
    .order('observed_on', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as unknown as WorldPriceRow[]
}

export async function buildAiArticleContext(options: GenerateAiArticlesOptions): Promise<AiArticleContext | null> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return null
  }

  if (options.articleType === 'export_period_report') {
    const periodCode = options.periodCode ?? (await loadLatestCustomsPeriodCode())
    if (!periodCode) {
      return null
    }

    const rows = await loadCustomsRowsByPeriod(periodCode)
    return rows ? buildExportPeriodArticleContextFromRows(rows) : null
  }

  if (options.articleType === 'export_monthly_report') {
    const month = options.year && options.month ? { year: options.year, month: options.month } : await loadLatestCompleteCustomsMonth()
    if (!month) {
      return null
    }

    const rows = await loadCustomsRowsByMonth(month.year, month.month)
    return rows ? buildExportMonthlyArticleContextFromRows(rows) : null
  }

  if (options.articleType === 'world_daily_price_update') {
    const rows = await loadWorldRows()
    return rows ? buildWorldDailyArticleContextFromRows(rows, options.observedOn) : null
  }

  return null
}

function hasSpecificContextSelector(options: GenerateAiArticlesOptions) {
  return Boolean(options.periodCode || options.observedOn || (typeof options.year === 'number' && typeof options.month === 'number'))
}

export async function buildAiArticleContexts(options: GenerateAiArticlesOptions = {}): Promise<AiArticleContext[]> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return []
  }

  if (hasSpecificContextSelector(options)) {
    const context = await buildAiArticleContext(options)
    return context ? [context] : []
  }

  if (options.articleType === 'export_period_report') {
    const rows = await loadAllCustomsRows()
    return rows ? buildExportPeriodArticleContextsFromRows(rows) : []
  }

  if (options.articleType === 'export_monthly_report') {
    const rows = await loadAllCustomsRows()
    return rows ? buildExportMonthlyArticleContextsFromRows(rows) : []
  }

  if (options.articleType === 'world_daily_price_update') {
    const rows = await loadWorldRows()
    return rows ? buildWorldDailyArticleContextsFromRows(rows) : []
  }

  const [customsRows, worldRows] = await Promise.all([loadAllCustomsRows(), loadWorldRows()])
  return [
    ...(customsRows ? buildExportPeriodArticleContextsFromRows(customsRows) : []),
    ...(customsRows ? buildExportMonthlyArticleContextsFromRows(customsRows) : []),
    ...(worldRows ? buildWorldDailyArticleContextsFromRows(worldRows) : []),
  ].sort((left, right) => (right.primaryObservedOn ?? '').localeCompare(left.primaryObservedOn ?? ''))
}

async function buildDefaultContexts() {
  return buildAiArticleContexts()
}

export async function generateAiArticles(options: GenerateAiArticlesOptions = {}): Promise<GenerateAiArticlesResult> {
  if (!getAiArticlesEnabled()) {
    return {
      status: 'skipped',
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      errorCount: 0,
      errors: ['AI_ARTICLE_ENABLED is not true'],
      articles: [],
    }
  }

  const contexts = options.articleType ? await buildAiArticleContexts(options) : await buildDefaultContexts()

  if (contexts.length === 0) {
    return {
      status: 'skipped',
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      errorCount: 0,
      errors: ['No eligible article context found'],
      articles: [],
    }
  }

  const articles: AiArticleSummary[] = []
  const errors: string[] = []
  let createdCount = 0
  let updatedCount = 0
  let skippedCount = 0

  for (const context of contexts) {
    try {
      const result = await generateOne(context, options.force ?? false)
      articles.push(result.article)
      if (result.status === 'skipped') {
        skippedCount += 1
      } else if (result.created) {
        createdCount += 1
      } else {
        updatedCount += 1
      }
    } catch (error) {
      errors.push(`${context.articleType}:${context.articleScopeKey}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const errorCount = errors.length
  return {
    status: errorCount === contexts.length ? 'failed' : errorCount > 0 ? 'partial' : 'success',
    createdCount,
    updatedCount,
    skippedCount,
    errorCount,
    errors,
    articles,
  }
}

export async function listAiArticles(options: { limit?: number; includeDrafts?: boolean; status?: AiArticleStatus | 'all' } = {}) {
  const client = options.includeDrafts ? getSupabaseAdminClient() : getSupabaseReadClient()
  if (!client) {
    return []
  }

  const query = client
    .from('ai_generated_articles')
    .select('*')
    .order('primary_observed_on', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 40, 1), 100))

  if (!options.includeDrafts) {
    query.eq('status', 'published')
  } else if (options.status && options.status !== 'all') {
    query.eq('status', options.status)
  }

  const { data, error } = await query
  if (error) {
    if (isRelationMissing(error)) {
      return []
    }
    throw error
  }

  return ((data ?? []) as AiArticleRow[]).map(toArticleSummary)
}

export async function getAiArticle(slug: string, options: { includeDrafts?: boolean } = {}) {
  const client = options.includeDrafts ? getSupabaseAdminClient() : getSupabaseReadClient()
  if (!client) {
    return null
  }

  const query = client.from('ai_generated_articles').select('*').eq('slug', slug)
  if (!options.includeDrafts) {
    query.eq('status', 'published')
  }

  const { data, error } = await query.maybeSingle()
  if (error) {
    if (isRelationMissing(error)) {
      return null
    }
    throw error
  }

  return data ? toArticleDetail(data as AiArticleRow) : null
}

export async function updateAiArticleStatus(slug: string, status: Exclude<AiArticleStatus, 'failed'>) {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('Supabase admin client is required to update AI articles')
  }

  const existing = await client
    .from('ai_generated_articles')
    .select('published_at')
    .eq('slug', slug)
    .maybeSingle()

  if (existing.error) {
    if (isRelationMissing(existing.error)) {
      return null
    }
    throw existing.error
  }

  if (!existing.data) {
    return null
  }

  const publishedAt =
    status === 'published'
      ? ((existing.data as Pick<AiArticleRow, 'published_at'>).published_at ?? new Date().toISOString())
      : null

  const { data, error } = await client
    .from('ai_generated_articles')
    .update({
      status,
      published_at: publishedAt,
    })
    .eq('slug', slug)
    .select('*')
    .maybeSingle()

  if (error) {
    if (isRelationMissing(error)) {
      return null
    }
    throw error
  }

  return data ? toArticleDetail(data as AiArticleRow) : null
}

export async function getAiArticleAsNewsDetail(slug: string) {
  const article = await getAiArticle(slug)
  if (!article) {
    return null
  }

  const related = (await listAiArticles({ limit: 6 }))
    .filter(item => item.slug !== slug && item.contentFamilySlug === article.contentFamilySlug)
    .slice(0, 4)
    .map(item => ({
      slug: item.slug,
      title: item.title,
      excerpt: item.excerpt,
      thumbnailUrl: item.thumbnailUrl,
      sourceKey: AI_ARTICLE_SOURCE_KEY,
      sourceLabel: item.sourceLabel,
      publishedAt: item.publishedAt,
      category: item.category,
      topicTags: item.topicTags,
      contentMode: 'full_html' as const,
      contentFamilySlug: item.contentFamilySlug,
      contentFamilyLabel: item.contentFamilyLabel,
      familyPath: item.familyPath,
    }))

  return {
    article: {
      id: article.id,
      sourceKey: AI_ARTICLE_SOURCE_KEY,
      canonicalUrl: article.canonicalUrl,
      slug: article.slug,
      title: article.title,
      excerpt: article.excerpt,
      contentHtml: article.contentHtml,
      contentText: article.contentText,
      thumbnailUrl: article.thumbnailUrl,
      author: article.author,
      category: article.category,
      topicTags: article.topicTags,
      publishedAt: article.publishedAt,
      fetchedAt: article.fetchedAt,
      contentMode: 'full_html' as const,
      fingerprint: hashJson(article.sourceFacts),
      status: article.status,
      sourceLabel: article.sourceLabel,
      contentFamilySlug: article.contentFamilySlug,
      contentFamilyLabel: article.contentFamilyLabel,
      familyPath: article.familyPath,
    },
    related,
    latestFromSource: related,
  }
}
