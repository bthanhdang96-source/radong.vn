import 'dotenv/config'
import type { CrawledPriceItem, SourceId } from '../services/crawlers/types.js'
import { buildQueueMessage, enqueueMessage, isRedisQueueConfigured } from '../services/ingestion/queue.js'

type ScenarioName = 'valid' | 'duplicate' | 'stale' | 'spike'

type SampleDefinition = {
  source: SourceId
  sourceUrl: string
  items: CrawledPriceItem[]
  description: string
}

function getArgValue(name: string) {
  const prefix = `--${name}=`
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
}

function getScenario(): ScenarioName {
  const scenario = (getArgValue('scenario') ?? 'valid') as ScenarioName
  if (['valid', 'duplicate', 'stale', 'spike'].includes(scenario)) {
    return scenario
  }

  throw new Error(`Unsupported scenario "${scenario}"`)
}

function isoOffsetHours(hoursAgo: number) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()
}

function createSampleItem(overrides: Partial<CrawledPriceItem> = {}): CrawledPriceItem {
  return {
    commodity: 'ca-phe-robusta',
    commodityName: 'Ca phe Robusta',
    category: 'Cay cong nghiep',
    region: 'Dak Lak',
    price: 128_000,
    unit: 'VND/kg',
    change: 1_500,
    changePct: 1.19,
    timestamp: new Date().toISOString(),
    source: 'congthuong',
    previousPrice: 126_500,
    ...overrides,
  }
}

function getScenarioDefinition(scenario: ScenarioName): SampleDefinition {
  switch (scenario) {
    case 'duplicate': {
      const item = createSampleItem()
      return {
        source: item.source,
        sourceUrl: 'https://example.local/ingestion-test/duplicate',
        description: 'Queues two identical records so the second should hit duplicate detection after the first insert.',
        items: [item, { ...item }],
      }
    }
    case 'stale':
      return {
        source: 'congthuong',
        sourceUrl: 'https://example.local/ingestion-test/stale',
        description: 'Queues one stale record older than 48 hours to verify freshness rejection.',
        items: [
          createSampleItem({
            timestamp: isoOffsetHours(72),
          }),
        ],
      }
    case 'spike':
      return {
        source: 'congthuong',
        sourceUrl: 'https://example.local/ingestion-test/spike',
        description: 'Queues one extreme but still in-bounds record to exercise spike detection when 7-day history exists.',
        items: [
          createSampleItem({
            price: 159_000,
            change: 24_000,
            previousPrice: 135_000,
            changePct: 17.78,
          }),
        ],
      }
    case 'valid':
    default:
      return {
        source: 'congthuong',
        sourceUrl: 'https://example.local/ingestion-test/valid',
        description: 'Queues one valid record that should insert successfully.',
        items: [createSampleItem()],
      }
  }
}

async function main() {
  if (!isRedisQueueConfigured()) {
    throw new Error('REDIS_URL is required to enqueue sample ingestion messages')
  }

  const scenario = getScenario()
  const sample = getScenarioDefinition(scenario)

  for (const item of sample.items) {
    await enqueueMessage(buildQueueMessage(item, sample.sourceUrl))
  }

  console.log(`[Sample Ingestion] scenario=${scenario}`)
  console.log(`[Sample Ingestion] queued=${sample.items.length}`)
  console.log(`[Sample Ingestion] description=${sample.description}`)
  console.log('[Sample Ingestion] Next: run `npm --prefix server run worker:once` or keep `npm --prefix server run worker` active.')
}

main().catch(error => {
  console.error('[Sample Ingestion] Failed:', error)
  process.exitCode = 1
})
