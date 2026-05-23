import '../env.js'
import { getCrawlerScheduleConfig } from '../services/crawlerScheduler.js'
import { getSupabaseRuntimeStatus } from '../services/supabaseClient.js'

async function main() {
  const payload = {
    timestamp: new Date().toISOString(),
    supabase: getSupabaseRuntimeStatus(),
    schedule: getCrawlerScheduleConfig(),
  }

  console.log(JSON.stringify(payload, null, 2))
}

main().catch(error => {
  console.error('[Crawler Status] Failed:', error)
  process.exitCode = 1
})
