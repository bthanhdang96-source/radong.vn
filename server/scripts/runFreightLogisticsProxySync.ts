import '../env.js'
import { resolve } from 'node:path'
import { syncFreightLogisticsProxy } from '../services/freightLogisticsProxy.js'

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function getOption(name: string) {
  const prefix = `--${name}=`
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length) ?? null
}

function parseIntegerOption(name: string) {
  const value = getOption(name)
  if (value === null) return undefined
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) throw new Error(`Invalid --${name}: ${value}`)
  return Math.trunc(numeric)
}

async function main() {
  const dryRun = hasFlag('dry-run')
  const writeArtifacts = !hasFlag('no-artifacts')
  const fetchSources = hasFlag('fetch-sources')
  const probeSources = hasFlag('probe-sources')
  const sourceHealthOnly = hasFlag('source-health-only')
  const maxItemsPerSource = parseIntegerOption('max-items-per-source')
  const seedCsvPath = getOption('seed-csv') ?? undefined
  const fromDate = getOption('from-date') ?? undefined
  const toDate = getOption('to-date') ?? undefined
  const sourceIds = process.argv
    .filter(arg => arg.startsWith('--source='))
    .map(arg => arg.slice('--source='.length))
    .filter(Boolean)

  const result = await syncFreightLogisticsProxy({
    dryRun,
    writeArtifacts,
    fetchSources,
    probeSources,
    sourceHealthOnly,
    maxItemsPerSource,
    seedCsvPath,
    fromDate,
    toDate,
    sourceIds: sourceIds.length > 0 ? sourceIds : undefined,
    workspaceRoot: resolve(process.cwd(), '..'),
  })

  console.log(`[Freight Logistics Proxy] rawRows=${result.rawRowsPrepared}`)
  console.log(`[Freight Logistics Proxy] factRows=${result.factRowsPrepared}`)
  console.log(`[Freight Logistics Proxy] sourceRowsFetched=${result.sourceRowsFetched}`)
  console.log(`[Freight Logistics Proxy] sourceHealth=${result.sourceHealth.map(row => `${row.sourceId}:${row.status}:${row.extractedRows}`).join('; ') || 'not-probed'}`)
  console.log(`[Freight Logistics Proxy] sourceErrors=${result.sourceErrors.map(error => `${error.sourceId}: ${error.message}`).join('; ') || 'none'}`)
  console.log(`[Freight Logistics Proxy] persisted raw=${result.rawRowsPersisted} fact=${result.factRowsPersisted} dryRun=${dryRun}`)
  console.log(`[Freight Logistics Proxy] duplicateRawRowsCollapsed=${result.duplicateRawRowsCollapsed}`)
  console.log(`[Freight Logistics Proxy] duplicateFactRowsCollapsed=${result.duplicateFactRowsCollapsed}`)
  console.log(`[Freight Logistics Proxy] qualityFlags=${JSON.stringify(result.qc.flagCounts)}`)
  if (result.artifacts.rawCsvPath) console.log(`[Freight Logistics Proxy] rawCsv=${result.artifacts.rawCsvPath}`)
  if (result.artifacts.factCsvPath) console.log(`[Freight Logistics Proxy] factCsv=${result.artifacts.factCsvPath}`)
  if (result.artifacts.qcReportPath) console.log(`[Freight Logistics Proxy] qcReport=${result.artifacts.qcReportPath}`)
  if (result.artifacts.sourceResearchPath) console.log(`[Freight Logistics Proxy] sourceResearch=${result.artifacts.sourceResearchPath}`)
  if (result.artifacts.sourceHealthPath) console.log(`[Freight Logistics Proxy] sourceHealthReport=${result.artifacts.sourceHealthPath}`)
  if (result.artifacts.methodologyPath) console.log(`[Freight Logistics Proxy] methodology=${result.artifacts.methodologyPath}`)
}

main().catch(error => {
  console.error('[Freight Logistics Proxy] Failed:', error)
  process.exitCode = 1
})
