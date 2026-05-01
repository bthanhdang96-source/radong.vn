import 'dotenv/config'
import { setTimeout as delay } from 'node:timers/promises'
import { getSupabaseAdminClient } from '../supabaseClient.js'
import { deleteQueuedMessage, readQueuedMessages } from './queue.js'
import { loadCommodityLookup, processIngestionMessage, type IngestionQueueMessage } from './pipeline.js'

function parseQueuedMessage(payload: Record<string, string>): IngestionQueueMessage {
  return {
    source: payload.source as IngestionQueueMessage['source'],
    sourceUrl: payload.source_url || null,
    crawledAt: payload.crawled_at,
    raw: JSON.parse(payload.raw),
  }
}

export async function processQueuedBatch(limit = 25) {
  const db = getSupabaseAdminClient()
  if (!db) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to run the ingestion worker')
  }

  const commodityLookup = await loadCommodityLookup(db)
  const messages = await readQueuedMessages(limit)
  let insertedCount = 0
  let failedCount = 0

  for (const entry of messages) {
    try {
      const result = await processIngestionMessage(db, commodityLookup, parseQueuedMessage(entry.message))
      if (result.inserted) {
        insertedCount += 1
      } else {
        failedCount += 1
      }
    } catch (error) {
      failedCount += 1
      console.error('[Ingestion Worker] Failed to process message:', error)
    } finally {
      await deleteQueuedMessage(entry.id)
    }
  }

  if (insertedCount > 0) {
    const { error } = await db.rpc('refresh_curated_views')
    if (error) {
      throw error
    }
  }

  return {
    processedCount: messages.length,
    insertedCount,
    failedCount,
  }
}

export async function runWorker() {
  console.log('[Ingestion Worker] Listening on Redis stream price:raw')

  while (true) {
    const batch = await processQueuedBatch(25)
    if (batch.processedCount === 0) {
      await delay(5000)
      continue
    }

    console.log(
      `[Ingestion Worker] processed=${batch.processedCount} inserted=${batch.insertedCount} failed=${batch.failedCount}`,
    )
  }
}

if (process.argv[1]?.endsWith('worker.ts')) {
  runWorker().catch(error => {
    console.error('[Ingestion Worker] Fatal error:', error)
    process.exitCode = 1
  })
}
