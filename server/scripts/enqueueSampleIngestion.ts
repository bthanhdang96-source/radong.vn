import 'dotenv/config'
import type { CrawledPriceItem, SourceId } from '../services/crawlers/types.js'
import { buildQueueMessage, enqueueMessage, isRedisQueueConfigured } from '../services/ingestion/queue.js'

type ScenarioName = 'valid' | 'duplicate' | 'stale' | 'spike' | 'granular'

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
  if (['valid', 'duplicate', 'stale', 'spike', 'granular'].includes(scenario)) {
    return scenario
  }

  throw new Error(`Unsupported scenario "${scenario}"`)
}

function getTag() {
  return getArgValue('tag') ?? new Date().toISOString().replace(/[:.]/g, '-')
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

function buildSourceUrl(scenario: ScenarioName, tag: string) {
  return `https://example.local/ingestion-test/${scenario}?tag=${encodeURIComponent(tag)}`
}

function getScenarioDefinition(scenario: ScenarioName, tag: string): SampleDefinition {
  switch (scenario) {
    case 'duplicate': {
      const item = createSampleItem()
      return {
        source: item.source,
        sourceUrl: buildSourceUrl('duplicate', tag),
        description: 'Queues two identical records so the second should hit duplicate detection after the first insert.',
        items: [item, { ...item }],
      }
    }
    case 'stale':
      return {
        source: 'congthuong',
        sourceUrl: buildSourceUrl('stale', tag),
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
        sourceUrl: buildSourceUrl('spike', tag),
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
    case 'granular':
      return {
        source: 'customs',
        sourceUrl: buildSourceUrl('granular', tag),
        description: 'Queues two export records with the same commodity and date but different dedupe fingerprints so both should insert.',
        items: [
          createSampleItem({
            source: 'customs',
            commodity: 'ca-phe',
            region: 'Viet Nam',
            price: 78_000,
            change: null,
            changePct: null,
            previousPrice: null,
            priceType: 'export',
            marketName: 'Hoa Ky',
            countryCode: 'USA',
            priceUsd: 3.02,
            exchangeRate: 25_850,
            dedupeKey: `customs-usa-${tag}`,
          }),
          createSampleItem({
            source: 'customs',
            commodity: 'ca-phe',
            region: 'Viet Nam',
            price: 78_000,
            change: null,
            changePct: null,
            previousPrice: null,
            priceType: 'export',
            marketName: 'Duc',
            countryCode: 'DEU',
            priceUsd: 3.02,
            exchangeRate: 25_850,
            dedupeKey: `customs-deu-${tag}`,
          }),
        ],
      }
    case 'valid':
    default:
      return {
        source: 'congthuong',
        sourceUrl: buildSourceUrl('valid', tag),
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
  const tag = getTag()
  const sample = getScenarioDefinition(scenario, tag)

  for (const item of sample.items) {
    await enqueueMessage(buildQueueMessage(item, sample.sourceUrl))
  }

  console.log(`[Sample Ingestion] scenario=${scenario}`)
  console.log(`[Sample Ingestion] tag=${tag}`)
  console.log(`[Sample Ingestion] queued=${sample.items.length}`)
  console.log(`[Sample Ingestion] sourceUrl=${sample.sourceUrl}`)
  console.log(`[Sample Ingestion] description=${sample.description}`)
  console.log('[Sample Ingestion] Next: run `npm --prefix server run worker:once` or keep `npm --prefix server run worker` active.')
  console.log(`[Sample Ingestion] Verify: npm --prefix server run ingestion:verify -- --scenario=${scenario} --tag=${tag}`)
}

main().catch(error => {
  console.error('[Sample Ingestion] Failed:', error)
  process.exitCode = 1
})
