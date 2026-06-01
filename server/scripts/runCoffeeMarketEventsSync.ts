import '../env.js'
import { resolve } from 'node:path'
import { syncCoffeeMarketEvents } from '../services/coffeeMarketEvents.js'

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function getOption(name: string) {
  const prefix = `--${name}=`
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length) ?? null
}

function parseIntegerOption(name: string) {
  const value = getOption(name)
  if (value === null) {
    return undefined
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid --${name}: ${value}`)
  }
  return Math.trunc(numeric)
}

async function main() {
  const dryRun = hasFlag('dry-run')
  const writeArtifacts = !hasFlag('no-artifacts')
  const staleDays = parseIntegerOption('stale-days')
  const seedCsvPath = getOption('seed-csv') ?? undefined
  const rawCsvPath = getOption('raw-csv') ?? undefined

  const result = await syncCoffeeMarketEvents({
    dryRun,
    writeArtifacts,
    staleDays,
    seedCsvPath,
    rawCsvPath,
    workspaceRoot: resolve(process.cwd(), '..'),
  })

  console.log(`[Coffee Market Events] rawRows=${result.rawRowsPrepared}`)
  console.log(`[Coffee Market Events] factRows=${result.factRowsPrepared}`)
  console.log(
    `[Coffee Market Events] persisted raw=${result.rawRowsPersisted} fact=${result.factRowsPersisted} dryRun=${dryRun}`,
  )
  console.log(`[Coffee Market Events] duplicateRawRowsCollapsed=${result.duplicateRawRowsCollapsed}`)
  console.log(`[Coffee Market Events] duplicateFactRowsCollapsed=${result.duplicateFactRowsCollapsed}`)
  console.log(`[Coffee Market Events] qualityFlags=${JSON.stringify(result.qc.countByQualityFlag)}`)
  if (result.artifacts.factCsvPath) {
    console.log(`[Coffee Market Events] factCsv=${result.artifacts.factCsvPath}`)
  }
  if (result.artifacts.qcReportPath) {
    console.log(`[Coffee Market Events] qcReport=${result.artifacts.qcReportPath}`)
  }
  if (result.artifacts.methodologyPath) {
    console.log(`[Coffee Market Events] methodology=${result.artifacts.methodologyPath}`)
  }
}

main().catch(error => {
  console.error('[Coffee Market Events] Failed:', error)
  process.exitCode = 1
})
