import 'dotenv/config'
import { getSupabaseAdminClient } from '../services/supabaseClient.js'

type ScenarioName = 'valid' | 'duplicate' | 'stale' | 'spike'

type ObservationRow = {
  recorded_at: string
  commodity_slug: string
  province_code: string | null
  price_type: string
  price_vnd: number
  confidence: number
  flags: string[]
  source_url: string | null
}

type ErrorRow = {
  failed_at: string
  error_type: string
  reason: string | null
  raw_payload: {
    sourceUrl?: string
  } | null
}

function getArgValue(name: string) {
  const prefix = `--${name}=`
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
}

function getScenario(): ScenarioName {
  const scenario = (getArgValue('scenario') ?? 'valid') as ScenarioName
  if (['valid', 'duplicate', 'stale', 'spike'].includes(scenario)) {
    return scenario
  }

  throw new Error(`Unsupported scenario "${scenario}"`)
}

function getTag() {
  return getArgValue('tag') ?? ''
}

function getMinutesWindow() {
  const value = Number(getArgValue('minutes') ?? '30')
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('`--minutes` must be a positive number')
  }

  return value
}

function buildSourceUrlMatcher(scenario: ScenarioName, tag: string) {
  const base = `https://example.local/ingestion-test/${scenario}`
  return tag ? `${base}?tag=${encodeURIComponent(tag)}` : base
}

function scenarioExpectation(scenario: ScenarioName) {
  switch (scenario) {
    case 'duplicate':
      return {
        minObservations: 1,
        minErrors: 1,
        expectedErrorType: 'duplicate',
      }
    case 'stale':
      return {
        minObservations: 0,
        minErrors: 1,
        expectedErrorType: 'stale_data',
      }
    case 'spike':
      return {
        minObservations: 1,
        minErrors: 0,
        expectedErrorType: null,
      }
    case 'valid':
    default:
      return {
        minObservations: 1,
        minErrors: 0,
        expectedErrorType: null,
      }
  }
}

function printObservation(row: ObservationRow) {
  console.log(
    `  obs ${row.recorded_at} | ${row.commodity_slug} | ${row.price_vnd} | conf=${row.confidence} | flags=${row.flags.join(',') || 'none'}`,
  )
}

function printError(row: ErrorRow) {
  console.log(`  err ${row.failed_at} | ${row.error_type} | ${row.reason ?? 'No reason provided'}`)
}

async function main() {
  const db = getSupabaseAdminClient()
  if (!db) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to verify ingestion results')
  }

  const scenario = getScenario()
  const tag = getTag()
  const minutes = getMinutesWindow()
  const sourceUrlMatcher = buildSourceUrlMatcher(scenario, tag)
  const sinceIso = new Date(Date.now() - minutes * 60 * 1000).toISOString()
  const expectation = scenarioExpectation(scenario)

  const [{ data: observationData, error: observationError }, { data: errorData, error: errorQueryError }] = await Promise.all([
    db
      .from('price_observations')
      .select('recorded_at, commodity_slug, province_code, price_type, price_vnd, confidence, flags, source_url')
      .eq('source_name', 'congthuong')
      .gte('recorded_at', sinceIso)
      .order('recorded_at', { ascending: false })
      .limit(20),
    db
      .from('ingestion_errors')
      .select('failed_at, error_type, reason, raw_payload')
      .eq('source_name', 'congthuong')
      .gte('failed_at', sinceIso)
      .order('failed_at', { ascending: false })
      .limit(20),
  ])

  if (observationError) {
    throw observationError
  }

  if (errorQueryError) {
    throw errorQueryError
  }

  const observations = ((observationData ?? []) as ObservationRow[]).filter(
    row => typeof row.source_url === 'string' && row.source_url.startsWith(sourceUrlMatcher),
  )
  const errors = ((errorData ?? []) as ErrorRow[]).filter(row => row.raw_payload?.sourceUrl?.startsWith(sourceUrlMatcher))
  const matchingExpectedError =
    expectation.expectedErrorType === null
      ? true
      : errors.some(row => row.error_type === expectation.expectedErrorType)

  console.log(`[Sample Verify] scenario=${scenario}`)
  console.log(`[Sample Verify] tag=${tag || 'latest'}`)
  console.log(`[Sample Verify] windowMinutes=${minutes}`)
  console.log(`[Sample Verify] sourceUrlPrefix=${sourceUrlMatcher}`)
  console.log(`[Sample Verify] observations=${observations.length}`)
  for (const row of observations) {
    printObservation(row)
  }
  console.log(`[Sample Verify] errors=${errors.length}`)
  for (const row of errors) {
    printError(row)
  }

  const passed =
    observations.length >= expectation.minObservations &&
    errors.length >= expectation.minErrors &&
    matchingExpectedError

  if (!passed) {
    console.error('[Sample Verify] Verification failed for the expected scenario outcome.')
    process.exitCode = 1
    return
  }

  if (scenario === 'spike' && observations.length > 0 && !observations.some(row => row.flags.includes('spike_detected'))) {
    console.log('[Sample Verify] Note: no `spike_detected` flag was found; this usually means the 7-day median history is not populated yet.')
  }

  console.log('[Sample Verify] Verification passed.')
}

main().catch(error => {
  console.error('[Sample Verify] Failed:', error)
  process.exitCode = 1
})
