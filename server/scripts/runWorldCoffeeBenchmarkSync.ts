import '../env.js'
import { resolve } from 'node:path'
import { syncWorldCoffeeBenchmark } from '../services/worldCoffeeBenchmark.js'

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const dryRun = hasFlag('dry-run')
  const writeArtifacts = !hasFlag('no-artifacts')

  const result = await syncWorldCoffeeBenchmark({
    dryRun,
    writeArtifacts,
    workspaceRoot: resolve(process.cwd(), '..'),
  })

  console.log(`[World Coffee Benchmark] rawRows=${result.rawRows.length} facts=${result.rows.length}`)
  console.log(`[World Coffee Benchmark] persisted=${result.rowsPersisted}`)
  console.log(`[World Coffee Benchmark] flags=${JSON.stringify(result.qc.flagCounts)}`)
  if (result.qc.sourceErrors.length > 0) {
    console.log(`[World Coffee Benchmark] sourceErrors=${result.qc.sourceErrors.join('; ')}`)
  }
  if (result.artifacts.rawCsvPath) {
    console.log(`[World Coffee Benchmark] rawCsv=${result.artifacts.rawCsvPath}`)
  }
  if (result.artifacts.factCsvPath) {
    console.log(`[World Coffee Benchmark] factCsv=${result.artifacts.factCsvPath}`)
  }
  if (result.artifacts.qcReportPath) {
    console.log(`[World Coffee Benchmark] qcReport=${result.artifacts.qcReportPath}`)
  }
  if (result.artifacts.sourceResearchPath) {
    console.log(`[World Coffee Benchmark] sourceResearch=${result.artifacts.sourceResearchPath}`)
  }
  if (result.artifacts.methodologyPath) {
    console.log(`[World Coffee Benchmark] methodology=${result.artifacts.methodologyPath}`)
  }
}

main().catch(error => {
  console.error('[World Coffee Benchmark] Failed:', error)
  process.exitCode = 1
})
