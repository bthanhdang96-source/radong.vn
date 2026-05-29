import '../env.js'
import { resolve } from 'node:path'
import { syncCoffeeExportUnitValue } from '../services/coffeeExportUnitValue.js'

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function getArgValue(name: string) {
  const prefix = `--${name}=`
  return process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
}

async function main() {
  const dryRun = hasFlag('dry-run')
  const writeArtifacts = !hasFlag('no-artifacts')
  const inputCsvPath = getArgValue('input-csv')

  const result = await syncCoffeeExportUnitValue({
    periodType: 'A',
    dryRun,
    writeArtifacts,
    inputCsvPath,
    workspaceRoot: resolve(process.cwd(), '..'),
  })

  console.log(`[Coffee Export Unit Value] rows=${result.rows.length} persisted=${result.rowsPersisted}`)
  console.log(
    `[Coffee Export Unit Value] qc input=${result.qc.inputRows} duplicate=${result.qc.duplicateInputGrainRows} aggregateExcluded=${result.qc.aggregatePartnerRowsExcluded}`,
  )
  console.log(`[Coffee Export Unit Value] flags=${JSON.stringify(result.qc.flagCounts)}`)
  if (result.artifacts.factCsvPath) {
    console.log(`[Coffee Export Unit Value] factCsv=${result.artifacts.factCsvPath}`)
  }
  if (result.artifacts.qcReportPath) {
    console.log(`[Coffee Export Unit Value] qcReport=${result.artifacts.qcReportPath}`)
  }
  if (result.artifacts.methodologyPath) {
    console.log(`[Coffee Export Unit Value] methodology=${result.artifacts.methodologyPath}`)
  }
}

main().catch(error => {
  console.error('[Coffee Export Unit Value] Failed:', error)
  process.exitCode = 1
})

