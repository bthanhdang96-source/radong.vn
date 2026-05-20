import '../env.js'
import { crawlExportRegistry } from '../services/exportRegistry/crawler.js'
import { syncExportRegistryResultsToSupabase } from '../services/exportRegistry/service.js'
import type { ExportRegistryType } from '../services/exportRegistry/types.js'

const REGISTRY_TYPES: ExportRegistryType[] = ['production_area', 'packing_facility']

function getArgValue(name: string) {
  const prefix = `${name}=`
  const arg = process.argv.slice(2).find(value => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : undefined
}

function hasFlag(name: string) {
  return process.argv.includes(name)
}

function parseRegistryTypes() {
  const raw = getArgValue('--type')
  if (!raw || raw === 'all') {
    return undefined
  }

  const items = raw.split(',').map(item => item.trim()).filter(Boolean)
  const valid = items.filter((item): item is ExportRegistryType => REGISTRY_TYPES.includes(item as ExportRegistryType))
  if (valid.length === 0) {
    throw new Error(`Unsupported --type value. Use one of: ${REGISTRY_TYPES.join(', ')}, all`)
  }

  return [...new Set(valid)]
}

function parseMaxPages() {
  const raw = getArgValue('--max-pages')
  if (!raw) {
    return undefined
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('--max-pages must be a positive number')
  }

  return Math.floor(parsed)
}

const dryRun = hasFlag('--dry-run')
const registryTypes = parseRegistryTypes()
const maxPagesPerType = parseMaxPages()

const results = await crawlExportRegistry({
  registryTypes,
  maxPagesPerType,
})

for (const result of results) {
  console.log(
    `[Export Registry] type=${result.registryType} pages=${result.pageCount} items=${result.items.length} source=${result.sourceUrl}`,
  )
  for (const error of result.errors) {
    console.error(`[Export Registry] ${result.registryType} error=${error}`)
  }
}

if (dryRun) {
  console.log('[Export Registry] sync skipped (dry-run)')
} else {
  const sync = await syncExportRegistryResultsToSupabase(results)
  console.log(
    `[Export Registry] synced run=${sync.runId} type=${sync.registryType} items=${sync.itemCount} inserted=${sync.insertedCount} updated=${sync.updatedCount}`,
  )
}
