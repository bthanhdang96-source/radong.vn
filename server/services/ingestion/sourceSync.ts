import type { CrawledDayData, CrawlerResult, SourceSnapshot } from '../crawlers/types.js'
import { getProvinceCodeFromRegion, inferPriceType, normalizeExternalCommoditySlug } from '../marketDataMappings.js'
import { getSupabaseAdminClient } from '../supabaseClient.js'
import { buildObservationDedupeKey } from './observationRules.js'
import { buildQueueMessage, enqueueDayData, isRedisQueueConfigured, shouldProcessInline } from './queue.js'
import { loadCommodityLookup, processIngestionMessage } from './pipeline.js'
import { processQueuedBatch } from './worker.js'

type SourceSyncResult = {
  processedCount: number
  insertedCount: number
  failedCount: number
  enqueuedCount: number
  skippedDuplicateCount: number
}

function toDayData(result: CrawlerResult): CrawledDayData {
  const timestamp = result.sources[0]?.fetchedAt ?? result.items[0]?.timestamp ?? new Date().toISOString()
  return {
    date: timestamp.slice(0, 10),
    items: result.items,
    sources: result.sources,
  }
}

async function persistSourceSnapshots(sourceSnapshots: SourceSnapshot[]) {
  if (sourceSnapshots.length === 0) {
    return
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to persist source snapshots')
  }

  const rows = sourceSnapshots.map(source => ({
    source_name: source.id,
    source_url: source.latestArticleUrl ?? source.url,
    raw_json: {
      snapshot: source,
      coverage: source.coverage,
      syncedAt: new Date().toISOString(),
    },
  }))

  const { error } = await client.from('raw_crawl_logs').insert(rows)
  if (error) {
    throw error
  }
}

async function refreshCuratedViews() {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to refresh curated views')
  }

  const { error } = await client.rpc('refresh_curated_views')
  if (error) {
    throw error
  }
}

async function filterExistingItems(dayData: CrawledDayData) {
  const client = getSupabaseAdminClient()
  if (!client || dayData.items.length === 0) {
    return { items: dayData.items, skippedDuplicateCount: 0 }
  }

  const fingerprintedItems = dayData.items.map(item => ({
    item,
    fingerprint: buildObservationDedupeKey({
      sourceName: item.source,
      commoditySlug: normalizeExternalCommoditySlug(item.commodity),
      priceType: inferPriceType({
        sourceId: item.source,
        articleTitle: item.articleTitle ?? null,
        declaredPriceType: item.priceType ?? null,
      }),
      provinceCode: getProvinceCodeFromRegion(item.region),
      marketName: item.marketName ?? null,
      articleTitle: item.articleTitle ?? null,
      sourceUrl: null,
      countryCode: item.countryCode ?? 'VNM',
      priceVnd: item.price,
      recordedAt: item.timestamp,
      explicitKey: item.dedupeKey ?? null,
      extra: item.extra ?? null,
    }),
  }))
  const itemsBySource = new Map<string, string[]>()
  for (const entry of fingerprintedItems) {
    const existing = itemsBySource.get(entry.item.source) ?? []
    existing.push(entry.fingerprint)
    itemsBySource.set(entry.item.source, existing)
  }

  if (itemsBySource.size === 0) {
    return { items: dayData.items, skippedDuplicateCount: 0 }
  }

  const existingKeys = new Set<string>()
  for (const [sourceName, fingerprints] of itemsBySource.entries()) {
    const dedupeKeys = [...new Set(fingerprints.filter(Boolean))]
    if (dedupeKeys.length === 0) {
      continue
    }

    const { data, error } = await client
      .from('price_observations')
      .select('dedupe_key')
      .eq('source_name', sourceName)
      .in('dedupe_key', dedupeKeys)

    if (error) {
      throw error
    }

    for (const row of data ?? []) {
      if (typeof row.dedupe_key === 'string' && row.dedupe_key.length > 0) {
        existingKeys.add(`${sourceName}:${row.dedupe_key}`)
      }
    }
  }

  const items = fingerprintedItems
    .filter(entry => !existingKeys.has(`${entry.item.source}:${entry.fingerprint}`))
    .map(entry => entry.item)

  return {
    items,
    skippedDuplicateCount: dayData.items.length - items.length,
  }
}

export async function syncCrawlerResultToSupabase(result: CrawlerResult): Promise<SourceSyncResult> {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to sync crawler output')
  }

  const sourceDayData = toDayData(result)
  const filtered = await filterExistingItems(sourceDayData)
  const dayData: CrawledDayData = {
    ...sourceDayData,
    items: filtered.items,
  }
  let processedCount = 0
  let insertedCount = 0
  let failedCount = 0
  let enqueuedCount = 0

  if (dayData.items.length > 0 && isRedisQueueConfigured()) {
    enqueuedCount = await enqueueDayData(dayData)

    if (shouldProcessInline()) {
      while (true) {
        const batch = await processQueuedBatch(25)
        processedCount += batch.processedCount
        insertedCount += batch.insertedCount
        failedCount += batch.failedCount

        if (batch.processedCount === 0) {
          break
        }
      }
    }
  } else if (dayData.items.length > 0) {
    const commodityLookup = await loadCommodityLookup(client)
    const snapshotBySource = new Map(dayData.sources.map(source => [source.id, source]))

    for (const item of dayData.items) {
      processedCount += 1
      const sourceSnapshot = snapshotBySource.get(item.source)
      const outcome = await processIngestionMessage(
        client,
        commodityLookup,
        buildQueueMessage(item, sourceSnapshot?.latestArticleUrl ?? sourceSnapshot?.url ?? null),
      )

      if (outcome.inserted) {
        insertedCount += 1
      } else {
        failedCount += 1
      }
    }
  }

  await persistSourceSnapshots(dayData.sources)
  if (insertedCount > 0) {
    await refreshCuratedViews()
  }

  return {
    processedCount,
    insertedCount,
    failedCount,
    enqueuedCount,
    skippedDuplicateCount: filtered.skippedDuplicateCount,
  }
}
