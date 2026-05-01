import 'dotenv/config'
import { getSupabaseAdminClient } from '../supabaseClient.js'
import { ERROR_PRICE_STREAM, RAW_PRICE_STREAM, getQueueDepth } from './queue.js'

type HealthSummary = {
  queueDepth: number
  errorCount: number
  recordsLastHour: number
  alerts: string[]
}

async function sendTelegram(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()

  if (!token || !chatId) {
    return
  }

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
    }),
  })
}

async function countRecordsLastHour() {
  const db = getSupabaseAdminClient()
  if (!db) {
    return 0
  }

  const { data, error } = await db.rpc('count_records_last_hour')
  if (error) {
    throw error
  }

  const countValue = Array.isArray(data) ? data[0]?.count : 0
  return Number(countValue ?? 0)
}

export async function healthCheck(): Promise<HealthSummary> {
  const [queueDepth, errorCount, recordsLastHour] = await Promise.all([
    getQueueDepth(RAW_PRICE_STREAM),
    getQueueDepth(ERROR_PRICE_STREAM),
    countRecordsLastHour(),
  ])

  const alerts: string[] = []
  if (queueDepth > 1000) {
    alerts.push(`Queue backlog high: ${queueDepth}`)
  }

  if (errorCount > 50) {
    alerts.push(`Error queue high: ${errorCount}`)
  }

  if (recordsLastHour < 10) {
    alerts.push(`Low ingestion rate last hour: ${recordsLastHour}`)
  }

  if (alerts.length > 0) {
    await sendTelegram(`AgriData pipeline alert\n${alerts.join('\n')}`)
  }

  return {
    queueDepth,
    errorCount,
    recordsLastHour,
    alerts,
  }
}

if (process.argv[1]?.endsWith('monitor.ts')) {
  healthCheck()
    .then(summary => {
      if (summary.alerts.length > 0) {
        console.log('[Ingestion Monitor] alerts=', summary.alerts.join(' | '))
        return
      }

      console.log(
        `[Ingestion Monitor] ok queue=${summary.queueDepth} errors=${summary.errorCount} recordsLastHour=${summary.recordsLastHour}`,
      )
    })
    .catch(error => {
      console.error('[Ingestion Monitor] Fatal error:', error)
      process.exitCode = 1
    })
}
