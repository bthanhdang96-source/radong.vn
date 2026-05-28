import { getSupabaseAdminClient, getSupabaseReadClient, getSupabaseRuntimeStatus } from './supabaseClient.js'

export const DEFAULT_EXCHANGE_RATE_CODES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'SGD', 'THB', 'AUD', 'CAD'] as const

const EXCHANGE_RATE_SOURCE_ID = 'fawazahmed0_exchange_api'
const EXCHANGE_RATE_SOURCE_PAGE = 'https://github.com/fawazahmed0/exchange-api'
const EXCHANGE_RATE_SOURCE_LICENSE = 'CC0-1.0 (exchange-api). Data is provided as-is.'
const EXCHANGE_RATE_BASE = 'VND'
const EXCHANGE_RATE_TIMEOUT_MS = 12_000
const MAX_HISTORY_DAYS = 365
const MAX_BACKFILL_DAYS = 365
export const EXCHANGE_RATE_STALE_DATA_ALERT_DAYS = 3
const STALE_DATA_ALERT_DAYS = EXCHANGE_RATE_STALE_DATA_ALERT_DAYS
const SPIKE_GUARD_CHANGE_PCT = 25

type ExchangeRateSyncMode = 'latest' | 'backfill'
type ExchangeRateSyncStatus = 'running' | 'success' | 'partial' | 'failed'

type ExchangeRateObservationRow = {
  observed_on: string
  currency_code: string
  currency_name: string
  base_currency: string
  vnd_per_unit: number
  source_id: string
  source_url: string
  source_license_note: string
  raw_payload: Record<string, unknown>
  crawl_recorded_at: string
}

type ExchangeRateHistoryRow = {
  observed_on: string
  currency_code: string
  currency_name: string
  vnd_per_unit: number
  source_id: string
  source_url: string
  source_license_note: string
  crawl_recorded_at: string
}

type ExchangeRateSyncRunRow = {
  id: string
  started_at: string
  finished_at: string | null
  status: ExchangeRateSyncStatus
  mode: ExchangeRateSyncMode
  requested_days: number
  fetched_days: number
  row_count: number
  upsert_count: number
  error_count: number
  errors: string[] | null
  error_message: string | null
  metadata: Record<string, unknown> | null
}

type ProviderRatesPayload = {
  date?: unknown
  vnd?: unknown
}

type CurrencyCatalogPayload = Record<string, unknown>

type ExchangeRateHistoryPoint = {
  date: string
  vndPerUnit: number
}

type ExchangeRateItem = {
  currencyCode: string
  currencyName: string
  latestVndPerUnit: number
  change1dPct: number | null
  change7dPct: number | null
  change30dPct: number | null
  change365dPct: number | null
  history: ExchangeRateHistoryPoint[]
  source: {
    id: string
    url: string
    license: string
  }
}

export type ExchangeRateLookupResponse = {
  status: 'live' | 'fallback'
  sourceMode: 'supabase_curated' | 'live_provider'
  baseCurrency: 'VND'
  days: number
  latestObservedOn: string | null
  refreshedAt: string | null
  availableCodes: string[]
  items: ExchangeRateItem[]
  errors: string[]
}

export type ExchangeRateSyncResult = {
  success: boolean
  mode: ExchangeRateSyncMode
  requestedDays: number
  fetchedDays: number
  rowCount: number
  upsertCount: number
  errors: string[]
}

function parsePositiveInt(value: unknown, fallbackValue: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue
  }
  return Math.trunc(parsed)
}

function clampHistoryDays(value: unknown) {
  return Math.max(1, Math.min(MAX_HISTORY_DAYS, parsePositiveInt(value, MAX_HISTORY_DAYS)))
}

function clampBackfillDays(value: unknown) {
  return Math.max(1, Math.min(MAX_BACKFILL_DAYS, parsePositiveInt(value, 1)))
}

function roundNumber(value: number, digits = 8) {
  return Number(value.toFixed(digits))
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString().slice(0, 10) === value ? value : null
}

function formatDateToken(date: Date) {
  return date.toISOString().slice(0, 10)
}

function buildDateTokens(days: number, now = new Date()) {
  if (days <= 1) {
    return ['latest']
  }

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - index)
    return formatDateToken(date)
  })
}

function normalizeCodes(codes?: string[]) {
  if (!codes || codes.length === 0) {
    return [...DEFAULT_EXCHANGE_RATE_CODES]
  }

  const normalized = codes
    .map(code => code.trim().toUpperCase())
    .filter(code => /^[A-Z]{3}$/.test(code))

  if (normalized.length === 0) {
    return [...DEFAULT_EXCHANGE_RATE_CODES]
  }

  return [...new Set(normalized)]
}

function normalizeCurrencyName(rawName: unknown, code: string) {
  if (typeof rawName !== 'string' || rawName.trim().length === 0) {
    return code
  }

  const value = rawName.trim().replace(/\s+/g, ' ')
  return value
    .split(' ')
    .map(token => token.slice(0, 1).toUpperCase() + token.slice(1))
    .join(' ')
}

function buildProviderUrls(dateToken: string, endpoint: string) {
  return [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateToken}/v1/${endpoint}`,
    `https://${dateToken}.currency-api.pages.dev/v1/${endpoint}`,
  ]
}

async function fetchJson(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EXCHANGE_RATE_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'nongsanvn-exchange-rate-sync/1.0 (+https://nongsanvn.vn)',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchProviderJson<T>(dateToken: string, endpoint: string): Promise<{ data: T; sourceUrl: string }> {
  let lastError: unknown

  for (const url of buildProviderUrls(dateToken, endpoint)) {
    try {
      const data = (await fetchJson(url)) as T
      return { data, sourceUrl: url }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to fetch provider endpoint ${endpoint}`)
}

async function loadCurrencyCatalog() {
  const payload = await fetchProviderJson<CurrencyCatalogPayload>('latest', 'currencies.min.json')
  if (!isObject(payload.data)) {
    throw new Error('Currency catalog payload is invalid')
  }

  return {
    sourceUrl: payload.sourceUrl,
    names: payload.data,
  }
}

function parseProviderRatesPayload(payload: unknown) {
  if (!isObject(payload)) {
    throw new Error('Rate payload is not an object')
  }

  const observedOn = parseIsoDate(payload.date)
  if (!observedOn) {
    throw new Error('Rate payload date is invalid')
  }

  const ratesRaw = payload.vnd
  if (!isObject(ratesRaw)) {
    throw new Error('Rate payload does not contain vnd rates')
  }

  return {
    observedOn,
    vndRates: ratesRaw,
  }
}

export function buildObservationRowsFromPayload(params: {
  requestedDateToken: string
  payload: unknown
  currencyCatalog: Record<string, unknown>
  trackedCodes: string[]
  sourceUrl: string
  crawledAt: string
}) {
  const parsed = parseProviderRatesPayload(params.payload)
  const rows: ExchangeRateObservationRow[] = []
  const skippedCodes: string[] = []

  for (const code of params.trackedCodes) {
    const currencyKey = code.toLowerCase()
    const vndToCurrency = parsed.vndRates[currencyKey]
    if (typeof vndToCurrency !== 'number' || !Number.isFinite(vndToCurrency) || vndToCurrency <= 0) {
      skippedCodes.push(code)
      continue
    }

    const vndPerUnit = roundNumber(1 / vndToCurrency)
    rows.push({
      observed_on: parsed.observedOn,
      currency_code: code,
      currency_name: normalizeCurrencyName(params.currencyCatalog[currencyKey], code),
      base_currency: EXCHANGE_RATE_BASE,
      vnd_per_unit: vndPerUnit,
      source_id: EXCHANGE_RATE_SOURCE_ID,
      source_url: params.sourceUrl,
      source_license_note: EXCHANGE_RATE_SOURCE_LICENSE,
      raw_payload: {
        requestedDateToken: params.requestedDateToken,
        providerDate: parsed.observedOn,
        vndToCurrency,
      },
      crawl_recorded_at: params.crawledAt,
    })
  }

  return {
    observedOn: parsed.observedOn,
    rows,
    skippedCodes,
  }
}

function isRelationMissing(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : null
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return (code === '42P01' || code === 'PGRST204' || code === '42703') && message.includes('exchange_rate')
}

async function startExchangeRateSyncRun(mode: ExchangeRateSyncMode, requestedDays: number) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('exchange_rate_sync_runs')
    .insert({
      started_at: new Date().toISOString(),
      status: 'running',
      mode,
      requested_days: requestedDays,
    })
    .select('id')
    .single()

  if (error) {
    if (!isRelationMissing(error)) {
      console.warn('[Exchange Rates] Unable to write sync start log:', error)
    }
    return null
  }

  return (data as { id: string }).id
}

async function finishExchangeRateSyncRun(
  runId: string | null,
  payload: {
    status: Exclude<ExchangeRateSyncStatus, 'running'>
    fetchedDays: number
    rowCount: number
    upsertCount: number
    errors: string[]
    errorMessage?: string | null
    metadata?: Record<string, unknown>
  },
) {
  if (!runId) {
    return
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    return
  }

  const { error } = await client
    .from('exchange_rate_sync_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: payload.status,
      fetched_days: payload.fetchedDays,
      row_count: payload.rowCount,
      upsert_count: payload.upsertCount,
      error_count: payload.errors.length,
      errors: payload.errors,
      error_message: payload.errorMessage ?? null,
      metadata: payload.metadata ?? {},
    })
    .eq('id', runId)

  if (error && !isRelationMissing(error)) {
    console.warn('[Exchange Rates] Unable to write sync completion log:', error)
  }
}

async function loadPreviousRateByCode(code: string, observedOn: string) {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('exchange_rate_observations')
    .select('vnd_per_unit, observed_on')
    .eq('currency_code', code)
    .lt('observed_on', observedOn)
    .order('observed_on', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (!isRelationMissing(error)) {
      console.warn(`[Exchange Rates] Unable to load previous rate for ${code}:`, error)
    }
    return null
  }

  if (!data) {
    return null
  }

  return data as { observed_on: string; vnd_per_unit: number }
}

async function applySpikeGuard(rows: ExchangeRateObservationRow[]) {
  if (rows.length === 0) {
    return { acceptedRows: rows, skippedErrors: [] as string[] }
  }

  const observedOn = rows[0].observed_on
  const acceptedRows: ExchangeRateObservationRow[] = []
  const skippedErrors: string[] = []

  for (const row of rows) {
    const previous = await loadPreviousRateByCode(row.currency_code, observedOn)
    if (!previous || previous.vnd_per_unit <= 0) {
      acceptedRows.push(row)
      continue
    }

    const changePct = Math.abs((row.vnd_per_unit / previous.vnd_per_unit - 1) * 100)
    if (changePct > SPIKE_GUARD_CHANGE_PCT) {
      skippedErrors.push(
        `${row.currency_code}: skipped spike ${roundNumber(changePct, 2)}% (${previous.vnd_per_unit} -> ${row.vnd_per_unit})`,
      )
      continue
    }

    acceptedRows.push(row)
  }

  return { acceptedRows, skippedErrors }
}

async function upsertExchangeRateRows(rows: ExchangeRateObservationRow[]) {
  if (rows.length === 0) {
    return 0
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    return 0
  }

  const { error, count } = await client.from('exchange_rate_observations').upsert(rows, {
    onConflict: 'source_id,currency_code,observed_on',
    count: 'exact',
  })

  if (error) {
    throw error
  }

  return count ?? rows.length
}

function dedupeRows(rows: ExchangeRateObservationRow[]) {
  const lookup = new Map<string, ExchangeRateObservationRow>()
  for (const row of rows) {
    lookup.set(`${row.observed_on}:${row.currency_code}`, row)
  }
  return [...lookup.values()]
}

function daysDiff(fromIsoDate: string, toDate = new Date()) {
  const from = new Date(`${fromIsoDate}T00:00:00.000Z`).getTime()
  const to = Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate())
  return Math.floor((to - from) / (24 * 60 * 60 * 1000))
}

export async function syncExchangeRatesToSupabase(options?: { backfillDays?: number }): Promise<ExchangeRateSyncResult> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasAdminConfig) {
    return {
      success: false,
      mode: 'latest',
      requestedDays: 1,
      fetchedDays: 0,
      rowCount: 0,
      upsertCount: 0,
      errors: ['SUPABASE_SERVICE_ROLE_KEY is required for exchange rate sync'],
    }
  }

  const requestedDays = clampBackfillDays(options?.backfillDays ?? 1)
  const mode: ExchangeRateSyncMode = requestedDays > 1 ? 'backfill' : 'latest'
  const runId = await startExchangeRateSyncRun(mode, requestedDays)
  const trackedCodes = [...DEFAULT_EXCHANGE_RATE_CODES]
  const dateTokens = buildDateTokens(requestedDays)
  const crawledAt = new Date().toISOString()
  const errors: string[] = []
  const rowsByToken: ExchangeRateObservationRow[] = []
  const observedDates = new Set<string>()

  try {
    const { names } = await loadCurrencyCatalog()

    for (const dateToken of dateTokens) {
      try {
        const payload = await fetchProviderJson<ProviderRatesPayload>(dateToken, 'currencies/vnd.min.json')
        const parsed = buildObservationRowsFromPayload({
          requestedDateToken: dateToken,
          payload: payload.data,
          currencyCatalog: names,
          trackedCodes,
          sourceUrl: payload.sourceUrl,
          crawledAt,
        })

        observedDates.add(parsed.observedOn)
        rowsByToken.push(...parsed.rows)
        if (parsed.skippedCodes.length > 0) {
          errors.push(`${parsed.observedOn}: missing ${parsed.skippedCodes.join(', ')}`)
        }
      } catch (error) {
        errors.push(`${dateToken}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (rowsByToken.length === 0) {
      const result: ExchangeRateSyncResult = {
        success: false,
        mode,
        requestedDays,
        fetchedDays: observedDates.size,
        rowCount: 0,
        upsertCount: 0,
        errors: errors.length > 0 ? errors : ['Provider returned no exchange rate rows'],
      }
      await finishExchangeRateSyncRun(runId, {
        status: 'failed',
        fetchedDays: observedDates.size,
        rowCount: 0,
        upsertCount: 0,
        errors: result.errors,
        errorMessage: result.errors[0],
      })
      return result
    }

    const dedupedRows = dedupeRows(rowsByToken)
    const latestObservedOn = dedupedRows.reduce(
      (latest, row) => (row.observed_on > latest ? row.observed_on : latest),
      dedupedRows[0]?.observed_on ?? formatDateToken(new Date()),
    )
    const stalenessDays = daysDiff(latestObservedOn)
    if (mode === 'latest' && stalenessDays > STALE_DATA_ALERT_DAYS) {
      errors.push(`Provider latest data is stale by ${stalenessDays} days (latest ${latestObservedOn})`)
    }

    const latestRows = dedupedRows.filter(row => row.observed_on === latestObservedOn)
    const spikeGuardResult = await applySpikeGuard(latestRows)
    errors.push(...spikeGuardResult.skippedErrors)

    const baseRows =
      mode === 'backfill'
        ? [
            ...dedupedRows.filter(row => row.observed_on !== latestObservedOn),
            ...spikeGuardResult.acceptedRows,
          ]
        : spikeGuardResult.acceptedRows
    const rowsToUpsert = dedupeRows(baseRows)
    const upsertCount = await upsertExchangeRateRows(rowsToUpsert)

    const success = rowsToUpsert.length > 0
    const finalStatus: Exclude<ExchangeRateSyncStatus, 'running'> =
      !success ? 'failed' : errors.length > 0 ? 'partial' : 'success'

    await finishExchangeRateSyncRun(runId, {
      status: finalStatus,
      fetchedDays: observedDates.size,
      rowCount: rowsToUpsert.length,
      upsertCount,
      errors,
      metadata: {
        requestedTokens: dateTokens.length,
        distinctObservedDates: observedDates.size,
        latestObservedOn,
      },
      errorMessage: !success ? 'No rows accepted for upsert' : null,
    })

    return {
      success,
      mode,
      requestedDays,
      fetchedDays: observedDates.size,
      rowCount: rowsToUpsert.length,
      upsertCount,
      errors,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errors.push(message)
    await finishExchangeRateSyncRun(runId, {
      status: 'failed',
      fetchedDays: observedDates.size,
      rowCount: 0,
      upsertCount: 0,
      errors,
      errorMessage: message,
      metadata: {
        requestedTokens: dateTokens.length,
        distinctObservedDates: observedDates.size,
      },
    })
    return {
      success: false,
      mode,
      requestedDays,
      fetchedDays: observedDates.size,
      rowCount: 0,
      upsertCount: 0,
      errors,
    }
  }
}

async function fetchObservationRows(days: number, codes: string[]) {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const start = new Date()
  start.setUTCDate(start.getUTCDate() - Math.max(0, days - 1))
  const startDate = formatDateToken(start)

  const pageSize = 1000
  let from = 0
  const rows: ExchangeRateHistoryRow[] = []

  while (true) {
    let query = client
      .from('exchange_rate_observations')
      .select(
        'observed_on, currency_code, currency_name, vnd_per_unit, source_id, source_url, source_license_note, crawl_recorded_at',
      )
      .gte('observed_on', startDate)
      .order('currency_code', { ascending: true })
      .order('observed_on', { ascending: true })
      .range(from, from + pageSize - 1)

    if (codes.length > 0) {
      query = query.in('currency_code', codes)
    }

    const { data, error } = await query
    if (error) {
      throw error
    }

    const batch = (data ?? []) as ExchangeRateHistoryRow[]
    rows.push(...batch)

    if (batch.length < pageSize) {
      break
    }

    from += pageSize
  }

  return rows
}

function findReferenceRate(history: ExchangeRateHistoryPoint[], daysBack: number) {
  if (history.length <= 1) {
    return null
  }

  const latestDate = new Date(`${history[history.length - 1].date}T00:00:00.000Z`)
  const target = new Date(latestDate)
  target.setUTCDate(target.getUTCDate() - daysBack)
  const targetKey = formatDateToken(target)

  for (let index = history.length - 2; index >= 0; index -= 1) {
    if (history[index].date <= targetKey) {
      return history[index].vndPerUnit
    }
  }

  return history[0]?.vndPerUnit ?? null
}

function computeChangePct(current: number, previous: number | null) {
  if (!previous || previous <= 0) {
    return null
  }
  return roundNumber(((current - previous) / previous) * 100, 4)
}

export function buildExchangeRateItems(rows: ExchangeRateHistoryRow[]) {
  const byCode = new Map<string, ExchangeRateHistoryRow[]>()
  for (const row of rows) {
    if (!byCode.has(row.currency_code)) {
      byCode.set(row.currency_code, [])
    }
    byCode.get(row.currency_code)?.push(row)
  }

  const items: ExchangeRateItem[] = []
  for (const [currencyCode, codeRows] of byCode.entries()) {
    const history = codeRows.map(row => ({
      date: row.observed_on,
      vndPerUnit: row.vnd_per_unit,
    }))
    const latest = history[history.length - 1]
    if (!latest) {
      continue
    }

    items.push({
      currencyCode,
      currencyName: codeRows[codeRows.length - 1]?.currency_name ?? currencyCode,
      latestVndPerUnit: latest.vndPerUnit,
      change1dPct: computeChangePct(latest.vndPerUnit, findReferenceRate(history, 1)),
      change7dPct: computeChangePct(latest.vndPerUnit, findReferenceRate(history, 7)),
      change30dPct: computeChangePct(latest.vndPerUnit, findReferenceRate(history, 30)),
      change365dPct: computeChangePct(latest.vndPerUnit, findReferenceRate(history, 365)),
      history,
      source: {
        id: codeRows[codeRows.length - 1]?.source_id ?? EXCHANGE_RATE_SOURCE_ID,
        url: codeRows[codeRows.length - 1]?.source_url ?? EXCHANGE_RATE_SOURCE_PAGE,
        license: codeRows[codeRows.length - 1]?.source_license_note ?? EXCHANGE_RATE_SOURCE_LICENSE,
      },
    })
  }

  return items.sort((left, right) => left.currencyCode.localeCompare(right.currencyCode))
}

async function getLatestExchangeRateRows(codes: string[]) {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  let query = client
    .from('latest_exchange_rates_public')
    .select('observed_on, currency_code, currency_name, vnd_per_unit, source_id, source_url, source_license_note, crawl_recorded_at')
    .order('currency_code', { ascending: true })

  if (codes.length > 0) {
    query = query.in('currency_code', codes)
  }

  const { data, error } = await query
  if (error) {
    throw error
  }

  return (data ?? []) as ExchangeRateHistoryRow[]
}

async function buildFallbackLookupResponse(days: number, codes: string[]): Promise<ExchangeRateLookupResponse> {
  const catalog = await loadCurrencyCatalog()
  const payload = await fetchProviderJson<ProviderRatesPayload>('latest', 'currencies/vnd.min.json')
  const parsed = buildObservationRowsFromPayload({
    requestedDateToken: 'latest',
    payload: payload.data,
    currencyCatalog: catalog.names,
    trackedCodes: codes,
    sourceUrl: payload.sourceUrl,
    crawledAt: new Date().toISOString(),
  })

  const fallbackRows: ExchangeRateHistoryRow[] = parsed.rows.map(row => ({
    observed_on: row.observed_on,
    currency_code: row.currency_code,
    currency_name: row.currency_name,
    vnd_per_unit: row.vnd_per_unit,
    source_id: row.source_id,
    source_url: row.source_url,
    source_license_note: row.source_license_note,
    crawl_recorded_at: row.crawl_recorded_at,
  }))

  const items = buildExchangeRateItems(fallbackRows)
  return {
    status: 'fallback',
    sourceMode: 'live_provider',
    baseCurrency: 'VND',
    days,
    latestObservedOn: parsed.observedOn,
    refreshedAt: new Date().toISOString(),
    availableCodes: items.map(item => item.currencyCode),
    items,
    errors: parsed.skippedCodes.length > 0 ? [`Missing codes: ${parsed.skippedCodes.join(', ')}`] : [],
  }
}

export async function getExchangeRateLookupResponse(options?: {
  days?: number
  codes?: string[]
}): Promise<ExchangeRateLookupResponse> {
  const days = clampHistoryDays(options?.days)
  const codes = normalizeCodes(options?.codes)
  const runtime = getSupabaseRuntimeStatus()

  if (runtime.hasReadConfig) {
    try {
      const [rows, latestRows] = await Promise.all([fetchObservationRows(days, codes), getLatestExchangeRateRows(codes)])
      if (rows && rows.length > 0) {
        const items = buildExchangeRateItems(rows)
        const latestObservedOn = items
          .map(item => item.history[item.history.length - 1]?.date)
          .filter((value): value is string => typeof value === 'string')
          .sort()
          .at(-1) ?? null
        const refreshedAt = (latestRows ?? [])
          .map(row => row.crawl_recorded_at)
          .sort()
          .at(-1) ?? null

        return {
          status: 'live',
          sourceMode: 'supabase_curated',
          baseCurrency: 'VND',
          days,
          latestObservedOn,
          refreshedAt,
          availableCodes: items.map(item => item.currencyCode),
          items,
          errors: [],
        }
      }
    } catch (error) {
      if (!(error instanceof Error) || !isRelationMissing(error)) {
        console.error('[Exchange Rates] Falling back to live provider:', error)
      }
    }
  }

  return buildFallbackLookupResponse(days, codes)
}

export async function getExchangeRateSyncRuns(limit = 20) {
  const client = getSupabaseAdminClient() ?? getSupabaseReadClient()
  if (!client) {
    return []
  }

  const { data, error } = await client
    .from('exchange_rate_sync_runs')
    .select(
      'id, started_at, finished_at, status, mode, requested_days, fetched_days, row_count, upsert_count, error_count, errors, error_message, metadata',
    )
    .order('started_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)))

  if (error) {
    if (isRelationMissing(error)) {
      return []
    }
    throw error
  }

  return (data ?? []) as ExchangeRateSyncRunRow[]
}

export function parseExchangeRateCodesParam(value: unknown) {
  if (typeof value !== 'string') {
    return [...DEFAULT_EXCHANGE_RATE_CODES]
  }

  return normalizeCodes(value.split(','))
}

export function parseExchangeRateDaysParam(value: unknown) {
  return clampHistoryDays(value)
}

export function parseExchangeRateBackfillDaysParam(value: unknown) {
  return clampBackfillDays(value)
}
