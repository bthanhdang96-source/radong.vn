import '../env.js'
import { resolve } from 'node:path'
import { syncVietnamCoffeeExportByMarket, type CoffeeExportPeriodType } from '../services/coffeeExportMarket.js'

function getArgValue(name: string) {
  const prefix = `--${name}=`
  return process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function parsePeriodType(value: string | undefined): CoffeeExportPeriodType {
  if (value?.toUpperCase() === 'M') {
    return 'M'
  }
  return 'A'
}

function parseInteger(value: string | undefined, fallback: number) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback
}

async function main() {
  const periodType = parsePeriodType(getArgValue('period-type'))
  const fromYear = parseInteger(getArgValue('from-year'), 2020)
  const toYear = parseInteger(getArgValue('to-year'), new Date().getUTCFullYear())
  const monthlyMonths = parseInteger(getArgValue('months'), 24)
  const requestChunkSize = parseInteger(getArgValue('chunk-size'), periodType === 'A' ? 4 : 6)
  const dryRun = hasFlag('dry-run')
  const writeArtifacts = !hasFlag('no-artifacts')

  const result = await syncVietnamCoffeeExportByMarket({
    periodType,
    fromYear,
    toYear,
    monthlyMonths,
    dryRun,
    writeArtifacts,
    requestChunkSize,
    workspaceRoot: resolve(process.cwd(), '..'),
  })

  console.log(`[Coffee Export Sync] periodType=${result.periodType}`)
  console.log(`[Coffee Export Sync] requestedPeriods=${result.requestedPeriods.join(',')}`)
  console.log(`[Coffee Export Sync] availablePeriods=${result.availablePeriodLabels.join(',')}`)
  console.log(`[Coffee Export Sync] requests=${result.requestCount}`)
  console.log(`[Coffee Export Sync] raw fetched=${result.rawRowsFetched} prepared=${result.rawRowsPrepared} persisted=${result.rawRowsPersisted}`)
  console.log(
    `[Coffee Export Sync] fact prepared=${result.factRowsPrepared} persisted=${result.factRowsPersisted} verifications=${result.verificationRowsPersisted}`,
  )
  console.log(
    `[Coffee Export Sync] qc duplicate=${result.qc.duplicateGrainRows} missingValue=${result.qc.missingValueRows} missingQuantity=${result.qc.missingQuantityRows} suspicious=${result.qc.suspiciousUnitPriceRows}`,
  )
  if (result.artifacts.rawCsvPath) {
    console.log(`[Coffee Export Sync] rawCsv=${result.artifacts.rawCsvPath}`)
  }
  if (result.artifacts.factCsvPath) {
    console.log(`[Coffee Export Sync] factCsv=${result.artifacts.factCsvPath}`)
  }
  if (result.artifacts.qcReportPath) {
    console.log(`[Coffee Export Sync] qcReport=${result.artifacts.qcReportPath}`)
  }
}

main().catch(error => {
  console.error('[Coffee Export Sync] Failed:', error)
  process.exitCode = 1
})
