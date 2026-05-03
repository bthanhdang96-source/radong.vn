import 'dotenv/config'
import { ensureFreshShopeeSession, getShopeeSessionMetadataPath, getShopeeStorageStatePath } from '../services/crawlers/shopeeSession.js'

function getArgValue(name: string) {
  const prefix = `--${name}=`
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const force = hasFlag('force')
  const headless = hasFlag('headed') ? false : hasFlag('headless') ? true : undefined
  const keyword = getArgValue('keyword') ?? undefined
  const waitMs = Number(getArgValue('wait-ms') ?? '')
  const metadata = await ensureFreshShopeeSession({
    force,
    headless,
    keyword,
    manualWaitMs: Number.isFinite(waitMs) && waitMs >= 0 ? waitMs : undefined,
  })

  console.log(`[Shopee Session] status=${metadata.status}`)
  console.log(`[Shopee Session] refreshedAt=${metadata.refreshedAt ?? 'n/a'}`)
  console.log(`[Shopee Session] expiresAt=${metadata.expiresAt ?? 'n/a'}`)
  console.log(`[Shopee Session] statePath=${getShopeeStorageStatePath()}`)
  console.log(`[Shopee Session] metadataPath=${getShopeeSessionMetadataPath()}`)
  console.log(`[Shopee Session] sampleCount=${metadata.sampleCount}`)
  if (metadata.message) {
    console.log(`[Shopee Session] message=${metadata.message}`)
  }

  if (metadata.status !== 'healthy') {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error('[Shopee Session] Failed:', error)
  process.exitCode = 1
})
