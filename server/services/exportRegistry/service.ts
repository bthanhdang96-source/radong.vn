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

const SUPABASE_BATCH_SIZE = 100

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

  const { data, error } = await client
    .from('export_registry_entries')
    .select('registry_type, crawled_at')
    .order('crawled_at', { ascending: false })
    .limit(20000)

  if (error) {
    throw error
  }

  const byType = new Map<ExportRegistryType, { count: number; latestCrawledAt: string | null }>()
  for (const row of (data ?? []) as Array<{ registry_type: ExportRegistryType; crawled_at: string }>) {
    const current = byType.get(row.registry_type) ?? { count: 0, latestCrawledAt: null }
    current.count += 1
    if (!current.latestCrawledAt || row.crawled_at > current.latestCrawledAt) {
      current.latestCrawledAt = row.crawled_at
    }
    byType.set(row.registry_type, current)
  }

  return defaults.map(item => ({
    ...item,
    count: byType.get(item.key)?.count ?? 0,
    latestCrawledAt: byType.get(item.key)?.latestCrawledAt ?? null,
  }))
}
