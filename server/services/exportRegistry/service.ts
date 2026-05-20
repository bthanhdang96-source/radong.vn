import { getSupabaseAdminClient, getSupabaseReadClient } from '../supabaseClient.js'
import { retryTransient } from '../transientNetwork.js'
import type { ExportRegistryCrawlResult, ExportRegistryEntry, ExportRegistrySyncResult, ExportRegistryType } from './types.js'

type ExportRegistryCategory = {
  key: ExportRegistryType
  label: string
  path: string
  count: number
  latestCrawledAt: string | null
}

type ExportRegistryRunRow = {
  id: string
  registry_type: ExportRegistryType | 'all'
  source_url: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'success' | 'partial' | 'failed'
  page_count: number
  item_count: number
  inserted_count: number
  updated_count: number
  error_message: string | null
  metadata: {
    uniqueItemCount?: number
    duplicateItemCount?: number
    sources?: Array<{
      registryType: ExportRegistryType
      sourceUrl: string
      pageCount: number
      itemCount: number
      errors: string[]
    }>
  } | null
}

type ExportRegistryEntryRow = {
  id: string
  registry_type: ExportRegistryType
  source_url: string
  source_page: number
  source_position: number
  source_row_number: number | null
  name: string
  address: string | null
  phone: string | null
  market: string | null
  province: string | null
  district: string | null
  commune: string | null
  approval_periods: Array<{
    round: number
    startsOn: string | null
    endsOn: string | null
    startRaw: string | null
    endRaw: string | null
  }> | null
  raw_payload: {
    registryCode?: string | null
    cells?: string[]
    [key: string]: unknown
  } | null
  content_hash: string
  crawled_at: string
}

export type ExportRegistryQueryOptions = {
  type?: ExportRegistryType
  q?: string
  province?: string
  market?: string
  product?: string
  status?: 'all' | 'harvesting'
  page?: number
  limit?: number
  now?: Date
}

type ExportRegistryLookupItem = {
  id: string
  registryType: ExportRegistryType
  sourceUrl: string
  sourcePage: number
  sourcePosition: number
  sourceRowNumber: number | null
  name: string
  address: string | null
  phone: string | null
  phoneDisplay: string | null
  market: string | null
  province: string | null
  district: string | null
  commune: string | null
  product: string
  registryCode: string | null
  approvalPeriods: NonNullable<ExportRegistryEntryRow['approval_periods']>
  harvestStatus: 'harvesting' | 'soon' | 'ended' | 'unknown'
  harvestStatusLabel: string
  seasonProgressPct: number | null
  latestCrawledAt: string
  capacity: string | null
  certifications: string[]
}

type ExportRegistryEntriesResponse = {
  items: ExportRegistryLookupItem[]
  total: number
  page: number
  limit: number
  latestCrawledAt: string | null
  stats: Record<ExportRegistryType, number>
  filters: {
    provinces: string[]
    markets: string[]
    products: string[]
  }
}

const SUPABASE_BATCH_SIZE = 100
const SUPABASE_READ_PAGE_SIZE = 1000
const DEFAULT_PAGE_SIZE = 24
const MAX_PAGE_SIZE = 60
const KNOWN_PRODUCT_RULES: Array<{ label: string; patterns: string[] }> = [
  { label: 'Sầu riêng', patterns: ['sau rieng', 'durian'] },
  { label: 'Thanh long', patterns: ['thanh long', 'dragon fruit'] },
  { label: 'Quế', patterns: ['que', 'cinnamon'] },
  { label: 'Xoài', patterns: ['xoai', 'mango'] },
  { label: 'Nhãn', patterns: ['nhan', 'longan'] },
  { label: 'Vải', patterns: ['vai', 'lychee'] },
  { label: 'Chuối', patterns: ['chuoi', 'banana'] },
  { label: 'Mít', patterns: ['mit', 'jackfruit'] },
  { label: 'Chôm chôm', patterns: ['chom chom', 'rambutan'] },
  { label: 'Dừa', patterns: ['dua', 'coconut'] },
  { label: 'Bưởi', patterns: ['buoi', 'pomelo'] },
  { label: 'Chanh leo', patterns: ['chanh leo', 'passion'] },
  { label: 'Ớt', patterns: ['ot', 'chili'] },
]

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function toDbRow(entry: ExportRegistryEntry, runId: string) {
  return {
    registry_type: entry.registryType,
    source_url: entry.sourceUrl,
    source_page: entry.sourcePage,
    source_position: entry.sourcePosition,
    source_row_number: entry.sourceRowNumber,
    name: entry.name,
    address: entry.address,
    phone: entry.phone,
    market: entry.market,
    province: entry.province,
    district: entry.district,
    commune: entry.commune,
    approval_periods: entry.approvalPeriods,
    raw_payload: entry.rawPayload,
    content_hash: entry.contentHash,
    crawled_at: entry.crawledAt,
    run_id: runId,
  }
}

function foldText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0111\u0110]/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeOption(value: string | null | undefined) {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim()
  return trimmed.length > 0 ? trimmed : null
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.map(normalizeOption).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right, 'vi'))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasProductPattern(text: string, pattern: string) {
  const foldedPattern = foldText(pattern)
  if (!foldedPattern) {
    return false
  }

  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(foldedPattern)}([^a-z0-9]|$)`).test(text)
}

export function deriveExportRegistryProduct(row: Pick<ExportRegistryEntryRow, 'name' | 'raw_payload'>) {
  const text = foldText(`${row.name} ${(row.raw_payload?.cells ?? []).join(' ')}`)
  const match = KNOWN_PRODUCT_RULES.find(rule => rule.patterns.some(pattern => hasProductPattern(text, pattern)))
  return match?.label ?? 'Khác'
}

function maskPhone(value: string | null) {
  if (!value) {
    return null
  }

  const digits = value.replace(/\D/g, '')
  if (digits.length < 7) {
    return value
  }

  return `${digits.slice(0, 4)}***${digits.slice(-3)}`
}

function toDate(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function getHarvestState(
  periods: NonNullable<ExportRegistryEntryRow['approval_periods']>,
  now = new Date(),
) {
  if (!periods || periods.length === 0) {
    return {
      status: 'unknown' as const,
      label: 'Chưa có lịch vụ',
      progressPct: null,
    }
  }

  const nowTime = now.getTime()
  const normalized = periods
    .map(period => ({
      ...period,
      start: toDate(period.startsOn),
      end: toDate(period.endsOn),
    }))
    .filter(period => period.start || period.end)

  const active = normalized.find(period => {
    const start = period.start?.getTime() ?? Number.NEGATIVE_INFINITY
    const end = period.end?.getTime() ?? Number.POSITIVE_INFINITY
    return start <= nowTime && nowTime <= end
  })

  if (active) {
    const start = active.start?.getTime() ?? nowTime
    const end = active.end?.getTime() ?? nowTime
    const range = Math.max(end - start, 1)
    return {
      status: 'harvesting' as const,
      label: `Đang thu hoạch đợt ${active.round}`,
      progressPct: Math.max(0, Math.min(100, Math.round(((nowTime - start) / range) * 100))),
    }
  }

  const upcoming = normalized
    .filter(period => period.start && period.start.getTime() > nowTime)
    .sort((left, right) => (left.start?.getTime() ?? 0) - (right.start?.getTime() ?? 0))[0]

  if (upcoming) {
    return {
      status: 'soon' as const,
      label: `Sắp thu hoạch đợt ${upcoming.round}`,
      progressPct: 0,
    }
  }

  return {
    status: 'ended' as const,
    label: 'Đã hết lịch vụ',
    progressPct: 100,
  }
}

function toLookupItem(row: ExportRegistryEntryRow, now = new Date()): ExportRegistryLookupItem {
  const approvalPeriods = row.approval_periods ?? []
  const harvestState = getHarvestState(approvalPeriods, now)

  return {
    id: row.id,
    registryType: row.registry_type,
    sourceUrl: row.source_url,
    sourcePage: row.source_page,
    sourcePosition: row.source_position,
    sourceRowNumber: row.source_row_number,
    name: row.name,
    address: row.address,
    phone: row.phone,
    phoneDisplay: maskPhone(row.phone),
    market: row.market,
    province: row.province,
    district: row.district,
    commune: row.commune,
    product: deriveExportRegistryProduct(row),
    registryCode: normalizeOption(row.raw_payload?.registryCode),
    approvalPeriods,
    harvestStatus: harvestState.status,
    harvestStatusLabel: harvestState.label,
    seasonProgressPct: harvestState.progressPct,
    latestCrawledAt: row.crawled_at,
    capacity: null,
    certifications: [],
  }
}

function matchesSearch(item: ExportRegistryLookupItem, query: string) {
  const foldedQuery = foldText(query)
  if (!foldedQuery) {
    return true
  }

  const haystack = [
    item.name,
    item.address,
    item.phone,
    item.market,
    item.province,
    item.district,
    item.commune,
    item.product,
    item.registryCode,
  ].map(foldText).join(' ')

  return haystack.includes(foldedQuery)
}

export function filterExportRegistryItems(items: ExportRegistryLookupItem[], options: ExportRegistryQueryOptions) {
  const province = normalizeOption(options.province)
  const market = normalizeOption(options.market)
  const product = normalizeOption(options.product)

  return items.filter(item => {
    if (!matchesSearch(item, options.q ?? '')) {
      return false
    }

    if (province && province !== 'all' && item.province !== province) {
      return false
    }

    if (market && market !== 'all' && item.market !== market) {
      return false
    }

    if (product && product !== 'all' && item.product !== product) {
      return false
    }

    if (options.status === 'harvesting' && item.registryType === 'production_area' && item.harvestStatus !== 'harvesting') {
      return false
    }

    return true
  })
}

function dedupeEntries(entries: ExportRegistryEntry[]) {
  const byKey = new Map<string, ExportRegistryEntry>()
  for (const entry of entries) {
    const key = `${entry.registryType}:${entry.contentHash}`
    if (!byKey.has(key)) {
      byKey.set(key, entry)
    }
  }

  return [...byKey.values()]
}

async function countExisting(entries: ExportRegistryEntry[]) {
  const client = getSupabaseAdminClient()
  if (!client || entries.length === 0) {
    return 0
  }

  let existingCount = 0
  const byType = entries.reduce<Map<ExportRegistryType, string[]>>((acc, entry) => {
    const hashes = acc.get(entry.registryType) ?? []
    hashes.push(entry.contentHash)
    acc.set(entry.registryType, hashes)
    return acc
  }, new Map())

  for (const [registryType, hashes] of byType.entries()) {
    for (const chunk of chunkArray([...new Set(hashes)], SUPABASE_BATCH_SIZE)) {
      const { data, error } = await client
        .from('export_registry_entries')
        .select('content_hash')
        .eq('registry_type', registryType)
        .in('content_hash', chunk)

      if (error) {
        throw error
      }

      existingCount += data?.length ?? 0
    }
  }

  return existingCount
}

export async function syncExportRegistryResultsToSupabase(
  results: ExportRegistryCrawlResult[],
): Promise<ExportRegistrySyncResult> {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to sync export registry data')
  }

  const discoveredEntries = results.flatMap(result => result.items)
  const entries = dedupeEntries(discoveredEntries)
  const registryType = results.length === 1 ? results[0].registryType : 'all'
  const sourceUrl = results.length === 1 ? results[0].sourceUrl : 'https://sansangxuatkhau.ppd.gov.vn'
  const startedAt = new Date().toISOString()

  const { data: run, error: runError } = await client
    .from('export_registry_crawl_runs')
    .insert({
      registry_type: registryType,
      source_url: sourceUrl,
      started_at: startedAt,
      status: 'running',
      page_count: results.reduce((sum, result) => sum + result.pageCount, 0),
      item_count: discoveredEntries.length,
      metadata: {
        sources: results.map(result => ({
          registryType: result.registryType,
          sourceUrl: result.sourceUrl,
          pageCount: result.pageCount,
          itemCount: result.items.length,
          errors: result.errors,
        })),
        uniqueItemCount: entries.length,
        duplicateItemCount: discoveredEntries.length - entries.length,
      },
    })
    .select('id')
    .single()

  if (runError) {
    throw runError
  }

  const runId = run.id as string
  let insertedCount = 0
  let updatedCount = 0

  try {
    const existingCount = await retryTransient(() => countExisting(entries))
    insertedCount = entries.length - existingCount
    updatedCount = existingCount

    for (const chunk of chunkArray(entries, SUPABASE_BATCH_SIZE)) {
      const { error } = await client
        .from('export_registry_entries')
        .upsert(chunk.map(entry => toDbRow(entry, runId)), {
          onConflict: 'registry_type,content_hash',
        })

      if (error) {
        throw error
      }
    }

    const status = results.some(result => result.errors.length > 0) ? 'partial' : 'success'
    const { error: updateError } = await client
      .from('export_registry_crawl_runs')
      .update({
        finished_at: new Date().toISOString(),
        status,
        inserted_count: insertedCount,
        updated_count: updatedCount,
      })
      .eq('id', runId)

    if (updateError) {
      throw updateError
    }
  } catch (error) {
    await client
      .from('export_registry_crawl_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown export registry sync error',
      })
      .eq('id', runId)
    throw error
  }

  return {
    runId,
    registryType,
    itemCount: discoveredEntries.length,
    insertedCount,
    updatedCount,
  }
}

export async function getExportRegistryCategories(): Promise<ExportRegistryCategory[]> {
  const client = getSupabaseReadClient()
  const defaults: ExportRegistryCategory[] = [
    { key: 'production_area', label: 'Vùng trồng', path: '/tra-cuu/vung-trong', count: 0, latestCrawledAt: null },
    { key: 'packing_facility', label: 'Cơ sở đóng gói', path: '/tra-cuu/co-so-dong-goi', count: 0, latestCrawledAt: null },
  ]

  if (!client) {
    return defaults
  }

  const categories: ExportRegistryCategory[] = []
  for (const item of defaults) {
    const countResponse = await client
      .from('export_registry_entries')
      .select('id', { count: 'exact', head: true })
      .eq('registry_type', item.key)

    if (countResponse.error) {
      throw countResponse.error
    }

    const latestResponse = await client
      .from('export_registry_entries')
      .select('crawled_at')
      .eq('registry_type', item.key)
      .order('crawled_at', { ascending: false })
      .limit(1)

    if (latestResponse.error) {
      throw latestResponse.error
    }

    const latest = (latestResponse.data ?? [])[0] as { crawled_at?: string } | undefined
    categories.push({
      ...item,
      count: countResponse.count ?? 0,
      latestCrawledAt: latest?.crawled_at ?? null,
    })
  }

  return categories
}

export async function getExportRegistryHealth() {
  const categories = await getExportRegistryCategories()
  const client = getSupabaseAdminClient()

  if (!client) {
    return {
      categories,
      latestRun: null,
    }
  }

  const { data, error } = await client
    .from('export_registry_crawl_runs')
    .select(
      'id, registry_type, source_url, started_at, finished_at, status, page_count, item_count, inserted_count, updated_count, error_message, metadata',
    )
    .order('started_at', { ascending: false })
    .limit(1)

  if (error) {
    throw error
  }

  return {
    categories,
    latestRun: ((data ?? []) as ExportRegistryRunRow[])[0] ?? null,
  }
}

async function getRegistryStats(client: NonNullable<ReturnType<typeof getSupabaseReadClient>>) {
  const stats: Record<ExportRegistryType, number> = {
    production_area: 0,
    packing_facility: 0,
  }

  for (const registryType of Object.keys(stats) as ExportRegistryType[]) {
    const { count, error } = await client
      .from('export_registry_entries')
      .select('id', { count: 'exact', head: true })
      .eq('registry_type', registryType)

    if (error) {
      throw error
    }

    stats[registryType] = count ?? 0
  }

  return stats
}

async function loadRegistryRows(
  client: NonNullable<ReturnType<typeof getSupabaseReadClient>>,
  registryType: ExportRegistryType,
) {
  const rows: ExportRegistryEntryRow[] = []

  for (let offset = 0; ; offset += SUPABASE_READ_PAGE_SIZE) {
    const { data, error } = await client
      .from('export_registry_entries')
      .select(
        'id, registry_type, source_url, source_page, source_position, source_row_number, name, address, phone, market, province, district, commune, approval_periods, raw_payload, content_hash, crawled_at',
      )
      .eq('registry_type', registryType)
      .order('crawled_at', { ascending: false })
      .order('source_page', { ascending: true })
      .order('source_position', { ascending: true })
      .range(offset, offset + SUPABASE_READ_PAGE_SIZE - 1)

    if (error) {
      throw error
    }

    rows.push(...((data ?? []) as ExportRegistryEntryRow[]))

    if (!data || data.length < SUPABASE_READ_PAGE_SIZE) {
      break
    }
  }

  return rows
}

export async function getExportRegistryEntries(
  options: ExportRegistryQueryOptions = {},
): Promise<ExportRegistryEntriesResponse> {
  const client = getSupabaseReadClient()
  const registryType = options.type ?? 'production_area'
  const page = Math.max(1, Math.floor(options.page ?? 1))
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(options.limit ?? DEFAULT_PAGE_SIZE)))

  if (!client) {
    return {
      items: [],
      total: 0,
      page,
      limit,
      latestCrawledAt: null,
      stats: {
        production_area: 0,
        packing_facility: 0,
      },
      filters: {
        provinces: [],
        markets: [],
        products: [],
      },
    }
  }

  const [stats, rows] = await Promise.all([
    getRegistryStats(client),
    loadRegistryRows(client, registryType),
  ])

  const allItems = rows.map(row => toLookupItem(row, options.now))
  const filteredItems = filterExportRegistryItems(allItems, options)
  const start = (page - 1) * limit
  const items = filteredItems.slice(start, start + limit)

  return {
    items,
    total: filteredItems.length,
    page,
    limit,
    latestCrawledAt: allItems.reduce<string | null>(
      (latest, item) => (!latest || item.latestCrawledAt > latest ? item.latestCrawledAt : latest),
      null,
    ),
    stats,
    filters: {
      provinces: uniqueSorted(allItems.map(item => item.province)),
      markets: uniqueSorted(allItems.map(item => item.market)),
      products: uniqueSorted(allItems.map(item => item.product)),
    },
  }
}
