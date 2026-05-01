import 'dotenv/config'
import { createClient } from 'redis'
import type { CrawledDayData, CrawledPriceItem, SourceSnapshot } from '../crawlers/types.js'
import type { IngestionQueueMessage } from './pipeline.js'

export const RAW_PRICE_STREAM = 'price:raw'
export const ERROR_PRICE_STREAM = 'price:errors'

let redisClientPromise: Promise<RedisClientType | null> | null = null
type RedisClientType = ReturnType<typeof createClient>

function getRedisUrl() {
  return process.env.REDIS_URL?.trim() || ''
}

function getSnapshotUrl(snapshotById: Map<string, SourceSnapshot>, item: CrawledPriceItem) {
  return snapshotById.get(item.source)?.latestArticleUrl ?? snapshotById.get(item.source)?.url ?? null
}

async function createRedisConnection() {
  const redisUrl = getRedisUrl()
  if (!redisUrl) {
    return null
  }

  const client = createClient({ url: redisUrl })
  client.on('error', error => {
    console.error('[Ingestion Queue] Redis error:', error)
  })

  await client.connect()
  return client
}

export function isRedisQueueConfigured() {
  return getRedisUrl().length > 0
}

export async function getRedisClient() {
  if (!redisClientPromise) {
    redisClientPromise = createRedisConnection()
  }

  return redisClientPromise
}

export function shouldProcessInline() {
  return process.env.INGESTION_INLINE_PROCESSING !== 'false'
}

export function buildQueueMessage(raw: CrawledPriceItem, sourceUrl: string | null): IngestionQueueMessage {
  return {
    source: raw.source,
    sourceUrl,
    crawledAt: raw.timestamp,
    raw,
  }
}

export async function enqueueMessage(message: IngestionQueueMessage) {
  const client = await getRedisClient()
  if (!client) {
    return null
  }

  return client.xAdd(RAW_PRICE_STREAM, '*', {
    source: message.source,
    source_url: message.sourceUrl ?? '',
    crawled_at: message.crawledAt,
    raw: JSON.stringify(message.raw),
  })
}

export async function enqueueDayData(dayData: CrawledDayData) {
  const client = await getRedisClient()
  if (!client) {
    return 0
  }

  const snapshotById = new Map(dayData.sources.map(snapshot => [snapshot.id, snapshot]))
  let enqueued = 0

  for (const item of dayData.items) {
    await enqueueMessage(buildQueueMessage(item, getSnapshotUrl(snapshotById, item)))
    enqueued += 1
  }

  return enqueued
}

export async function readQueuedMessages(limit = 50) {
  const client = await getRedisClient()
  if (!client) {
    return []
  }

  const entries = await client.xRange(RAW_PRICE_STREAM, '-', '+', {
    COUNT: limit,
  })

  return entries.map(entry => ({
    id: entry.id,
    message: entry.message,
  }))
}

export async function deleteQueuedMessage(messageId: string) {
  const client = await getRedisClient()
  if (!client) {
    return
  }

  await client.xDel(RAW_PRICE_STREAM, messageId)
}

export async function pushErrorToQueue(message: IngestionQueueMessage, errorType: string, reason: string) {
  const client = await getRedisClient()
  if (!client) {
    return null
  }

  return client.xAdd(ERROR_PRICE_STREAM, '*', {
    original: JSON.stringify({
      source: message.source,
      source_url: message.sourceUrl,
      crawled_at: message.crawledAt,
      raw: message.raw,
    }),
    error_type: errorType,
    reason,
    failed_at: new Date().toISOString(),
  })
}

export async function getQueueDepth(streamKey = RAW_PRICE_STREAM) {
  const client = await getRedisClient()
  if (!client) {
    return 0
  }

  return client.xLen(streamKey)
}
