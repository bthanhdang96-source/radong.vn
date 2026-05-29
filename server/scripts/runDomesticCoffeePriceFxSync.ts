import '../env.js'
import { resolve } from 'node:path'
import { syncDomesticCoffeePriceFx } from '../services/domesticCoffeePriceFx.js'

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const dryRun = hasFlag('dry-run')
  const writeArtifacts = !hasFlag('no-artifacts')

  const result = await syncDomesticCoffeePriceFx({
    dryRun,
    writeArtifacts,
    workspaceRoot: resolve(process.cwd(), '..'),
  })

  console.log(
    `[Domestic Coffee Price FX] rawPrices=${result.rawPriceRows.length} rawFx=${result.rawFxRows.length} facts=${result.rows.length}`,
  )
  console.log(
    `[Domestic Coffee Price FX] persisted rawPrices=${result.rawPriceRowsPersisted} rawFx=${result.rawFxRowsPersisted} facts=${result.factRowsPersisted}`,
  )
  console.log(`[Domestic Coffee Price FX] flags=${JSON.stringify(result.qc.flagCounts)}`)
  if (result.artifacts.rawPriceCsvPath) {
    console.log(`[Domestic Coffee Price FX] rawPriceCsv=${result.artifacts.rawPriceCsvPath}`)
  }
  if (result.artifacts.rawFxCsvPath) {
    console.log(`[Domestic Coffee Price FX] rawFxCsv=${result.artifacts.rawFxCsvPath}`)
  }
  if (result.artifacts.factCsvPath) {
    console.log(`[Domestic Coffee Price FX] factCsv=${result.artifacts.factCsvPath}`)
  }
  if (result.artifacts.qcReportPath) {
    console.log(`[Domestic Coffee Price FX] qcReport=${result.artifacts.qcReportPath}`)
  }
  if (result.artifacts.sourceResearchPath) {
    console.log(`[Domestic Coffee Price FX] sourceResearch=${result.artifacts.sourceResearchPath}`)
  }
  if (result.artifacts.methodologyPath) {
    console.log(`[Domestic Coffee Price FX] methodology=${result.artifacts.methodologyPath}`)
  }
}

main().catch(error => {
  console.error('[Domestic Coffee Price FX] Failed:', error)
  process.exitCode = 1
})
