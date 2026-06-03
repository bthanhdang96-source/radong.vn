import '../env.js'
import { resolve } from 'node:path'
import {
  syncCoffeeMirrorImportUnitValue,
  type MirrorImporterTier,
  type MirrorImportPeriodType,
  type MirrorMonthlyMode,
} from '../services/coffeeMirrorImportUnitValue.js'

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
  const periodType = (getOption('period-type') ?? 'A') as MirrorImportPeriodType
  const importerTier = (getOption('importer-tier') ?? 'core') as MirrorImporterTier
  const importers = getOption('importers')
    ?.split(',')
    .map(value => value.trim().toUpperCase())
    .filter(Boolean)
  const monthlyMode = getOption('monthly-mode') as MirrorMonthlyMode | null
  const months = parseIntegerOption('months')
  const topExportImporters = parseIntegerOption('top-export-importers')
  const includeStaticCore = getOption('include-static-core') !== 'false'
  const fromYear = parseIntegerOption('from-year')
  const toYear = parseIntegerOption('to-year')

  const result = await syncCoffeeMirrorImportUnitValue({
    periodType,
    importerTier,
    importers,
    monthlyMode: monthlyMode ?? undefined,
    months,
    topExportImporters,
    includeStaticCore,
    fromYear,
    toYear,
    dryRun,
    writeArtifacts,
    workspaceRoot: resolve(process.cwd(), '..'),
  })

  console.log(`[Coffee Mirror Import] periodType=${result.periodType} importerTier=${result.importerTier}`)
  console.log(`[Coffee Mirror Import] importers=${result.importers.map(importer => importer.iso).join(',')}`)
  console.log(`[Coffee Mirror Import] skippedUnverifiedImporters=${result.skippedUnverifiedImporters.join(',') || 'none'}`)
  console.log(`[Coffee Mirror Import] monthlyReviewMode=${result.monthlyReviewMode}`)
  console.log(`[Coffee Mirror Import] periods=${result.requestedPeriods.join(',')}`)
  console.log(`[Coffee Mirror Import] rawRows=${result.rawRowsPrepared}/${result.rawRowsFetched}`)
  console.log(`[Coffee Mirror Import] factRows=${result.factRowsPrepared}`)
  console.log(`[Coffee Mirror Import] mirrorGapRows=${result.mirrorGapRows.length}`)
  console.log(`[Coffee Mirror Import] persisted raw=${result.rawRowsPersisted} fact=${result.factRowsPersisted}`)
  console.log(`[Coffee Mirror Import] flags=${JSON.stringify(result.qc.flagCounts)}`)
  console.log(`[Coffee Mirror Import] mirrorGapFlags=${JSON.stringify(result.qc.mirrorGapFlagCounts)}`)
  if (result.artifacts.rawCsvPath) {
    console.log(`[Coffee Mirror Import] rawCsv=${result.artifacts.rawCsvPath}`)
  }
  if (result.artifacts.factCsvPath) {
    console.log(`[Coffee Mirror Import] factCsv=${result.artifacts.factCsvPath}`)
  }
  if (result.artifacts.mirrorGapCsvPath) {
    console.log(`[Coffee Mirror Import] mirrorGapCsv=${result.artifacts.mirrorGapCsvPath}`)
  }
  if (result.artifacts.qcReportPath) {
    console.log(`[Coffee Mirror Import] qcReport=${result.artifacts.qcReportPath}`)
  }
  if (result.artifacts.methodologyPath) {
    console.log(`[Coffee Mirror Import] methodology=${result.artifacts.methodologyPath}`)
  }
}

main().catch(error => {
  console.error('[Coffee Mirror Import] Failed:', error)
  process.exitCode = 1
})
