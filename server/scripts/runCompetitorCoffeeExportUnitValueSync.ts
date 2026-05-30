import '../env.js'
import { resolve } from 'node:path'
import { syncCompetitorCoffeeExportUnitValue, type CompetitorCoffeePeriodType } from '../services/competitorCoffeeExportUnitValue.js'

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
  const suppressIncompleteBenchmarkPeriods = !hasFlag('include-incomplete-periods')
  const periodType = (getOption('period-type') ?? 'A') as CompetitorCoffeePeriodType
  const fromYear = parseIntegerOption('from-year')
  const toYear = parseIntegerOption('to-year')

  const result = await syncCompetitorCoffeeExportUnitValue({
    periodType,
    fromYear,
    toYear,
    dryRun,
    writeArtifacts,
    suppressIncompleteBenchmarkPeriods,
    workspaceRoot: resolve(process.cwd(), '..'),
  })

  console.log(`[Competitor Coffee Unit Value] periods=${result.requestedPeriods.join(',')}`)
  console.log(`[Competitor Coffee Unit Value] rawRows=${result.rawRowsPrepared}/${result.rawRowsFetched}`)
  console.log(`[Competitor Coffee Unit Value] factRows=${result.factRowsPrepared}`)
  console.log(`[Competitor Coffee Unit Value] benchmarkRows=${result.benchmarkRows.length}`)
  console.log(`[Competitor Coffee Unit Value] persisted raw=${result.rawRowsPersisted} fact=${result.factRowsPersisted}`)
  console.log(`[Competitor Coffee Unit Value] flags=${JSON.stringify(result.qc.flagCounts)}`)
  console.log(`[Competitor Coffee Unit Value] reporterCoverage=${JSON.stringify(result.qc.reporterCoverage)}`)
  console.log(`[Competitor Coffee Unit Value] suppressedIncompletePeriods=${result.suppressedIncompletePeriodLabels.join(',') || 'none'}`)
  if (result.artifacts.rawCsvPaths) {
    for (const [reporterIso, path] of Object.entries(result.artifacts.rawCsvPaths)) {
      console.log(`[Competitor Coffee Unit Value] rawCsv.${reporterIso}=${path}`)
    }
  }
  if (result.artifacts.factCsvPath) {
    console.log(`[Competitor Coffee Unit Value] factCsv=${result.artifacts.factCsvPath}`)
  }
  if (result.artifacts.benchmarkCsvPath) {
    console.log(`[Competitor Coffee Unit Value] benchmarkCsv=${result.artifacts.benchmarkCsvPath}`)
  }
  if (result.artifacts.qcReportPath) {
    console.log(`[Competitor Coffee Unit Value] qcReport=${result.artifacts.qcReportPath}`)
  }
  if (result.artifacts.methodologyPath) {
    console.log(`[Competitor Coffee Unit Value] methodology=${result.artifacts.methodologyPath}`)
  }
}

main().catch(error => {
  console.error('[Competitor Coffee Unit Value] Failed:', error)
  process.exitCode = 1
})
