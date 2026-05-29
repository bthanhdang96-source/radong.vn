import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { getSupabaseAdminClient } from './supabaseClient.js'

export type CoffeeExportUnitValuePeriodType = 'A' | 'M'
export type CoffeeExportUnitValueFlag =
  | 'ok'
  | 'missing_value'
  | 'missing_quantity'
  | 'zero_quantity'
  | 'low_volume'
  | 'invalid_unit_value'

export type CoffeeExportByMarketFactRow = {
  period_type: CoffeeExportUnitValuePeriodType
  period_start: string
  period_label: string
  reporter_country: string
  reporter_iso: string
  partner_country: string
  partner_iso: string | null
  flow: string
  commodity_group: string
  analysis_bucket: string
  hs6: string
  hs_description: string | null
  quantity_ton: number | null
  value_usd: number | null
  source_name: string
  source_url: string
  fetched_at: string
  data_quality_flag: string | null
  confidence_score: number | null
  notes: string | null
}

export type CoffeeExportUnitValueRow = {
  period_type: CoffeeExportUnitValuePeriodType
  period_start: string
  period_label: string
  reporter_country: string
  reporter_iso: string
  partner_country: string
  partner_iso: string | null
  flow: string
  commodity_group: string
  analysis_bucket: string
  hs6: string
  hs_description: string | null
  export_value_usd: number | null
  export_quantity_ton: number | null
  export_unit_value_usd_per_ton: number | null
  export_value_usd_yoy_pct: number | null
  export_quantity_ton_yoy_pct: number | null
  export_unit_value_yoy_pct: number | null
  export_value_usd_mom_pct: number | null
  export_quantity_ton_mom_pct: number | null
  export_unit_value_mom_pct: number | null
  market_share_by_value_pct: number | null
  market_share_by_quantity_pct: number | null
  unit_value_rank_by_period: number | null
  value_rank_by_period: number | null
  quantity_rank_by_period: number | null
  data_quality_flag: string | null
  unit_value_flag: CoffeeExportUnitValueFlag
  confidence_score: number
  notes: string
  source_name: string
  source_url: string
  fetched_at: string
}

export type CoffeeExportUnitValueQcReport = {
  inputRows: number
  outputRows: number
  duplicateInputGrainRows: number
  aggregatePartnerRowsExcluded: number
  flagCounts: Record<CoffeeExportUnitValueFlag, number>
  latestPeriodLabel: string | null
  topHighestUnitValues: CoffeeExportUnitValueRow[]
  topLowestUnitValues: CoffeeExportUnitValueRow[]
  topMarketsByValue: CoffeeExportUnitValueRow[]
  premiumMarkets: Array<CoffeeExportUnitValueRow & { medianUnitValue: number; premiumVsMedianPct: number }>
}

export type CoffeeExportUnitValueTransformResult = {
  rows: CoffeeExportUnitValueRow[]
  qc: CoffeeExportUnitValueQcReport
}

export type CoffeeExportUnitValueSyncOptions = {
  periodType?: CoffeeExportUnitValuePeriodType
  workspaceRoot?: string
  dryRun?: boolean
  writeArtifacts?: boolean
  inputCsvPath?: string
  sourceRows?: CoffeeExportByMarketFactRow[]
}

export type CoffeeExportUnitValueSyncResult = CoffeeExportUnitValueTransformResult & {
  rowsPersisted: number
  artifacts: {
    factCsvPath: string | null
    qcReportPath: string | null
    methodologyPath: string | null
  }
}

type AggregationBucket = {
  period_type: CoffeeExportUnitValuePeriodType
  period_start: string
  period_label: string
  reporter_country: string
  reporter_iso: string
  partner_country: string
  partner_iso: string | null
  flow: string
  commodity_group: string
  analysis_bucket: string
  hs6: string
  hs_description: string | null
  source_name: string
  source_url: string
  fetched_at: string
  data_quality_flags: Set<string>
  valueSum: number
  valueCount: number
  quantitySum: number
  quantityCount: number
  minConfidenceScore: number | null
}

const REPORTER_ISO = 'VNM'
const FLOW = 'Export'
const COMMODITY_GROUP = 'coffee'
const ANALYSIS_BUCKET = 'coffee_raw_core'
const HS6 = '090111'
const LOW_VOLUME_TON_THRESHOLD = 10
const OUTPUT_COLUMNS: Array<keyof CoffeeExportUnitValueRow> = [
  'period_type',
  'period_start',
  'period_label',
  'reporter_country',
  'reporter_iso',
  'partner_country',
  'partner_iso',
  'flow',
  'commodity_group',
  'analysis_bucket',
  'hs6',
  'hs_description',
  'export_value_usd',
  'export_quantity_ton',
  'export_unit_value_usd_per_ton',
  'export_value_usd_yoy_pct',
  'export_quantity_ton_yoy_pct',
  'export_unit_value_yoy_pct',
  'export_value_usd_mom_pct',
  'export_quantity_ton_mom_pct',
  'export_unit_value_mom_pct',
  'market_share_by_value_pct',
  'market_share_by_quantity_pct',
  'unit_value_rank_by_period',
  'value_rank_by_period',
  'quantity_rank_by_period',
  'data_quality_flag',
  'unit_value_flag',
  'confidence_score',
  'notes',
  'source_name',
  'source_url',
  'fetched_at',
]

function roundNumber(value: number, digits = 6) {
  return Number(value.toFixed(digits))
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeHs6(value: string | null | undefined) {
  return String(value ?? '').trim().padStart(6, '0')
}

function isExportFlow(value: string | null | undefined) {
  return String(value ?? '').toLowerCase().includes('export')
}

function isAggregatePartner(row: Pick<CoffeeExportByMarketFactRow, 'partner_country' | 'partner_iso'>) {
  const country = row.partner_country.toLowerCase().trim()
  const iso = row.partner_iso?.toUpperCase().trim()
  return country === 'world' || country === 'all' || country.includes('world') || iso === 'W00'
}

function buildInputGrainKey(row: CoffeeExportByMarketFactRow) {
  return [
    row.period_type,
    row.period_label,
    row.reporter_iso,
    row.partner_iso ?? '',
    row.flow,
    normalizeHs6(row.hs6),
    row.source_name,
  ].join('|')
}

function buildPeriodKey(row: Pick<CoffeeExportUnitValueRow, 'period_type' | 'period_label' | 'hs6'>) {
  return [row.period_type, row.period_label, row.hs6].join('|')
}

function buildPartnerLagKey(row: Pick<CoffeeExportUnitValueRow, 'partner_iso' | 'partner_country' | 'hs6' | 'period_type' | 'source_name'>) {
  return [row.partner_iso ?? row.partner_country, row.hs6, row.period_type, row.source_name].join('|')
}

function buildAggregationKey(row: CoffeeExportByMarketFactRow) {
  return [
    row.period_type,
    row.period_label,
    row.reporter_iso,
    row.partner_iso ?? '',
    row.flow,
    normalizeHs6(row.hs6),
    row.source_name,
  ].join('|')
}

function maxFetchedAt(left: string, right: string) {
  return left >= right ? left : right
}

function calculateUnitValueFlag(row: Pick<CoffeeExportUnitValueRow, 'export_value_usd' | 'export_quantity_ton' | 'export_unit_value_usd_per_ton'>): CoffeeExportUnitValueFlag {
  if (row.export_value_usd === null) {
    return 'missing_value'
  }
  if (row.export_quantity_ton === null) {
    return 'missing_quantity'
  }
  if (row.export_quantity_ton === 0) {
    return 'zero_quantity'
  }
  if (row.export_unit_value_usd_per_ton !== null && row.export_unit_value_usd_per_ton <= 0) {
    return 'invalid_unit_value'
  }
  if (row.export_quantity_ton > 0 && row.export_quantity_ton < LOW_VOLUME_TON_THRESHOLD) {
    return 'low_volume'
  }
  return 'ok'
}

function confidenceForFlag(flag: CoffeeExportUnitValueFlag) {
  switch (flag) {
    case 'ok':
      return 0.85
    case 'low_volume':
      return 0.55
    case 'missing_value':
    case 'missing_quantity':
      return 0.4
    case 'zero_quantity':
    case 'invalid_unit_value':
      return 0.2
    default:
      return 0.4
  }
}

function buildNotes(flag: CoffeeExportUnitValueFlag) {
  if (flag === 'low_volume') {
    return 'Low volume market; export unit value may be noisy. Do not use as a strong pricing signal without verification. Export unit value is an average proxy, not a transaction, contract, FOB invoice, or exact selling price.'
  }

  return 'Export unit value is calculated as total export value USD divided by total quantity tons. It is an average proxy, not a transaction, contract, FOB invoice, or exact selling price.'
}

function percentChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) {
    return null
  }
  return roundNumber(100 * (current / previous - 1), 6)
}

function rankRows(
  rows: CoffeeExportUnitValueRow[],
  valueGetter: (row: CoffeeExportUnitValueRow) => number | null,
  setter: (row: CoffeeExportUnitValueRow, rank: number | null) => void,
) {
  const sorted = [...rows].sort((left, right) => {
    const leftValue = valueGetter(left)
    const rightValue = valueGetter(right)
    if (leftValue === null && rightValue === null) {
      return left.partner_country.localeCompare(right.partner_country)
    }
    if (leftValue === null) {
      return 1
    }
    if (rightValue === null) {
      return -1
    }
    if (rightValue !== leftValue) {
      return rightValue - leftValue
    }
    return left.partner_country.localeCompare(right.partner_country)
  })

  let previousValue: number | null | undefined
  let previousRank: number | null = null
  for (let index = 0; index < sorted.length; index += 1) {
    const value = valueGetter(sorted[index])
    if (value === null) {
      setter(sorted[index], null)
      continue
    }
    const rank: number | null = previousValue === value ? previousRank : index + 1
    setter(sorted[index], rank)
    previousValue = value
    previousRank = rank
  }
}

function median(values: number[]) {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sorted[middle]
  }
  return (sorted[middle - 1] + sorted[middle]) / 2
}

function isScopeRow(row: CoffeeExportByMarketFactRow, periodType: CoffeeExportUnitValuePeriodType) {
  return (
    row.period_type === periodType &&
    row.reporter_iso === REPORTER_ISO &&
    isExportFlow(row.flow) &&
    row.commodity_group === COMMODITY_GROUP &&
    row.analysis_bucket === ANALYSIS_BUCKET &&
    normalizeHs6(row.hs6) === HS6
  )
}

export function buildCoffeeExportUnitValueRows(
  inputRows: CoffeeExportByMarketFactRow[],
  options: { periodType?: CoffeeExportUnitValuePeriodType } = {},
): CoffeeExportUnitValueTransformResult {
  const periodType = options.periodType ?? 'A'
  const inputGrainCounts = new Map<string, number>()
  const aggregations = new Map<string, AggregationBucket>()
  let aggregatePartnerRowsExcluded = 0

  for (const row of inputRows) {
    if (!isScopeRow(row, periodType)) {
      continue
    }

    const inputGrainKey = buildInputGrainKey(row)
    inputGrainCounts.set(inputGrainKey, (inputGrainCounts.get(inputGrainKey) ?? 0) + 1)

    if (isAggregatePartner(row)) {
      aggregatePartnerRowsExcluded += 1
      continue
    }

    const key = buildAggregationKey(row)
    const existing = aggregations.get(key)
    const valueUsd = toNumber(row.value_usd)
    const quantityTon = toNumber(row.quantity_ton)
    const confidenceScore = toNumber(row.confidence_score)

    if (!existing) {
      aggregations.set(key, {
        period_type: row.period_type,
        period_start: row.period_start,
        period_label: row.period_label,
        reporter_country: row.reporter_country,
        reporter_iso: row.reporter_iso,
        partner_country: row.partner_country,
        partner_iso: row.partner_iso,
        flow: FLOW,
        commodity_group: row.commodity_group,
        analysis_bucket: row.analysis_bucket,
        hs6: normalizeHs6(row.hs6),
        hs_description: row.hs_description,
        source_name: row.source_name,
        source_url: row.source_url,
        fetched_at: row.fetched_at,
        data_quality_flags: new Set(row.data_quality_flag ? [row.data_quality_flag] : []),
        valueSum: valueUsd ?? 0,
        valueCount: valueUsd === null ? 0 : 1,
        quantitySum: quantityTon ?? 0,
        quantityCount: quantityTon === null ? 0 : 1,
        minConfidenceScore: confidenceScore,
      })
      continue
    }

    if (valueUsd !== null) {
      existing.valueSum += valueUsd
      existing.valueCount += 1
    }
    if (quantityTon !== null) {
      existing.quantitySum += quantityTon
      existing.quantityCount += 1
    }
    if (confidenceScore !== null) {
      existing.minConfidenceScore =
        existing.minConfidenceScore === null ? confidenceScore : Math.min(existing.minConfidenceScore, confidenceScore)
    }
    if (row.data_quality_flag) {
      existing.data_quality_flags.add(row.data_quality_flag)
    }
    existing.fetched_at = maxFetchedAt(existing.fetched_at, row.fetched_at)
  }

  const rows: CoffeeExportUnitValueRow[] = [...aggregations.values()].map(bucket => {
    const exportValueUsd = bucket.valueCount > 0 ? roundNumber(bucket.valueSum, 6) : null
    const exportQuantityTon = bucket.quantityCount > 0 ? roundNumber(bucket.quantitySum, 6) : null
    const exportUnitValue =
      exportValueUsd !== null && exportQuantityTon !== null && exportQuantityTon !== 0
        ? roundNumber(exportValueUsd / exportQuantityTon, 6)
        : null
    const unitValueFlag = calculateUnitValueFlag({
      export_value_usd: exportValueUsd,
      export_quantity_ton: exportQuantityTon,
      export_unit_value_usd_per_ton: exportUnitValue,
    })
    const calculatedConfidence = confidenceForFlag(unitValueFlag)
    const sourceConfidence = bucket.minConfidenceScore ?? calculatedConfidence

    return {
      period_type: bucket.period_type,
      period_start: bucket.period_start,
      period_label: bucket.period_label,
      reporter_country: bucket.reporter_country,
      reporter_iso: bucket.reporter_iso,
      partner_country: bucket.partner_country,
      partner_iso: bucket.partner_iso,
      flow: bucket.flow,
      commodity_group: bucket.commodity_group,
      analysis_bucket: bucket.analysis_bucket,
      hs6: bucket.hs6,
      hs_description: bucket.hs_description,
      export_value_usd: exportValueUsd,
      export_quantity_ton: exportQuantityTon,
      export_unit_value_usd_per_ton: exportUnitValue,
      export_value_usd_yoy_pct: null,
      export_quantity_ton_yoy_pct: null,
      export_unit_value_yoy_pct: null,
      export_value_usd_mom_pct: null,
      export_quantity_ton_mom_pct: null,
      export_unit_value_mom_pct: null,
      market_share_by_value_pct: null,
      market_share_by_quantity_pct: null,
      unit_value_rank_by_period: null,
      value_rank_by_period: null,
      quantity_rank_by_period: null,
      data_quality_flag: [...bucket.data_quality_flags].sort().join(',') || null,
      unit_value_flag: unitValueFlag,
      confidence_score: roundNumber(Math.min(sourceConfidence, calculatedConfidence), 3),
      notes: buildNotes(unitValueFlag),
      source_name: bucket.source_name,
      source_url: bucket.source_url,
      fetched_at: bucket.fetched_at,
    }
  })

  const rowsByPeriod = new Map<string, CoffeeExportUnitValueRow[]>()
  for (const row of rows) {
    const key = buildPeriodKey(row)
    const bucket = rowsByPeriod.get(key) ?? []
    bucket.push(row)
    rowsByPeriod.set(key, bucket)
  }

  for (const periodRows of rowsByPeriod.values()) {
    const totalValue = periodRows.reduce((sum, row) => sum + (row.export_value_usd ?? 0), 0)
    const totalQuantity = periodRows.reduce((sum, row) => sum + (row.export_quantity_ton ?? 0), 0)
    for (const row of periodRows) {
      row.market_share_by_value_pct =
        row.export_value_usd !== null && totalValue > 0 ? roundNumber((100 * row.export_value_usd) / totalValue, 6) : null
      row.market_share_by_quantity_pct =
        row.export_quantity_ton !== null && totalQuantity > 0 ? roundNumber((100 * row.export_quantity_ton) / totalQuantity, 6) : null
    }
    rankRows(periodRows, row => row.export_unit_value_usd_per_ton, (row, rank) => {
      row.unit_value_rank_by_period = rank
    })
    rankRows(periodRows, row => row.export_value_usd, (row, rank) => {
      row.value_rank_by_period = rank
    })
    rankRows(periodRows, row => row.export_quantity_ton, (row, rank) => {
      row.quantity_rank_by_period = rank
    })
  }

  const rowsByPartner = new Map<string, CoffeeExportUnitValueRow[]>()
  for (const row of rows) {
    const key = buildPartnerLagKey(row)
    const bucket = rowsByPartner.get(key) ?? []
    bucket.push(row)
    rowsByPartner.set(key, bucket)
  }

  for (const partnerRows of rowsByPartner.values()) {
    const sorted = partnerRows.sort((left, right) => left.period_start.localeCompare(right.period_start))
    for (let index = 0; index < sorted.length; index += 1) {
      const row = sorted[index]
      const previous = sorted[index - 1]
      if (!previous) {
        continue
      }
      row.export_value_usd_yoy_pct = percentChange(row.export_value_usd, previous.export_value_usd)
      row.export_quantity_ton_yoy_pct = percentChange(row.export_quantity_ton, previous.export_quantity_ton)
      row.export_unit_value_yoy_pct = percentChange(row.export_unit_value_usd_per_ton, previous.export_unit_value_usd_per_ton)
    }
  }

  rows.sort((left, right) => {
    const periodSort = left.period_start.localeCompare(right.period_start)
    if (periodSort !== 0) {
      return periodSort
    }
    return (left.value_rank_by_period ?? Number.MAX_SAFE_INTEGER) - (right.value_rank_by_period ?? Number.MAX_SAFE_INTEGER)
  })

  return {
    rows,
    qc: buildCoffeeExportUnitValueQcReport(rows, {
      inputRows: inputRows.filter(row => isScopeRow(row, periodType)).length,
      duplicateInputGrainRows: [...inputGrainCounts.values()].filter(count => count > 1).reduce((sum, count) => sum + (count - 1), 0),
      aggregatePartnerRowsExcluded,
    }),
  }
}

export function buildCoffeeExportUnitValueQcReport(
  rows: CoffeeExportUnitValueRow[],
  metadata: { inputRows: number; duplicateInputGrainRows: number; aggregatePartnerRowsExcluded: number },
): CoffeeExportUnitValueQcReport {
  const flagCounts: Record<CoffeeExportUnitValueFlag, number> = {
    ok: 0,
    missing_value: 0,
    missing_quantity: 0,
    zero_quantity: 0,
    low_volume: 0,
    invalid_unit_value: 0,
  }
  for (const row of rows) {
    flagCounts[row.unit_value_flag] += 1
  }

  const latestPeriodLabel = rows.map(row => row.period_label).sort().at(-1) ?? null
  const latestRows = latestPeriodLabel ? rows.filter(row => row.period_label === latestPeriodLabel) : []
  const topMarketsByValue = latestRows
    .filter(row => row.value_rank_by_period !== null && row.value_rank_by_period <= 10)
    .sort((left, right) => (left.value_rank_by_period ?? 0) - (right.value_rank_by_period ?? 0))

  const topHighestUnitValues = rows
    .filter(row => row.export_unit_value_usd_per_ton !== null)
    .sort((left, right) => (right.export_unit_value_usd_per_ton ?? 0) - (left.export_unit_value_usd_per_ton ?? 0))
    .slice(0, 20)
  const topLowestUnitValues = rows
    .filter(row => row.export_unit_value_usd_per_ton !== null)
    .sort((left, right) => (left.export_unit_value_usd_per_ton ?? 0) - (right.export_unit_value_usd_per_ton ?? 0))
    .slice(0, 20)

  const premiumMarkets: CoffeeExportUnitValueQcReport['premiumMarkets'] = []
  const rowsByPeriod = new Map<string, CoffeeExportUnitValueRow[]>()
  for (const row of rows) {
    const bucket = rowsByPeriod.get(row.period_label) ?? []
    bucket.push(row)
    rowsByPeriod.set(row.period_label, bucket)
  }
  for (const periodRows of rowsByPeriod.values()) {
    const medianUnitValue = median(
      periodRows
        .filter(row => row.unit_value_flag === 'ok' && (row.export_quantity_ton ?? 0) >= LOW_VOLUME_TON_THRESHOLD)
        .map(row => row.export_unit_value_usd_per_ton)
        .filter((value): value is number => value !== null),
    )
    if (medianUnitValue === null || medianUnitValue === 0) {
      continue
    }
    for (const row of periodRows) {
      if (row.unit_value_flag !== 'ok' || (row.export_quantity_ton ?? 0) < LOW_VOLUME_TON_THRESHOLD || row.export_unit_value_usd_per_ton === null) {
        continue
      }
      premiumMarkets.push({
        ...row,
        medianUnitValue: roundNumber(medianUnitValue, 6),
        premiumVsMedianPct: roundNumber(100 * (row.export_unit_value_usd_per_ton / medianUnitValue - 1), 6),
      })
    }
  }
  premiumMarkets.sort((left, right) => {
    const periodSort = right.period_label.localeCompare(left.period_label)
    if (periodSort !== 0) {
      return periodSort
    }
    return right.premiumVsMedianPct - left.premiumVsMedianPct
  })

  return {
    inputRows: metadata.inputRows,
    outputRows: rows.length,
    duplicateInputGrainRows: metadata.duplicateInputGrainRows,
    aggregatePartnerRowsExcluded: metadata.aggregatePartnerRowsExcluded,
    flagCounts,
    latestPeriodLabel,
    topHighestUnitValues,
    topLowestUnitValues,
    topMarketsByValue,
    premiumMarkets: premiumMarkets.slice(0, 50),
  }
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }
  const text = String(value)
  if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) {
    return text
  }
  return `"${text.replace(/"/g, '""')}"`
}

function toCsv(rows: CoffeeExportUnitValueRow[]) {
  const header = OUTPUT_COLUMNS.join(',')
  const body = rows.map(row => OUTPUT_COLUMNS.map(column => csvEscape(row[column])).join(',')).join('\n')
  return `${header}\n${body}`
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }
    current += char
  }
  values.push(current)
  return values
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.length > 0)
  if (lines.length === 0) {
    return []
  }
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

function csvRecordToFactRow(record: Record<string, string>): CoffeeExportByMarketFactRow {
  return {
    period_type: record.period_type === 'M' ? 'M' : 'A',
    period_start: record.period_start,
    period_label: record.period_label,
    reporter_country: record.reporter_country,
    reporter_iso: record.reporter_iso,
    partner_country: record.partner_country,
    partner_iso: record.partner_iso || null,
    flow: record.flow,
    commodity_group: record.commodity_group,
    analysis_bucket: record.analysis_bucket,
    hs6: record.hs6,
    hs_description: record.hs_description || null,
    quantity_ton: toNumber(record.quantity_ton),
    value_usd: toNumber(record.value_usd),
    source_name: record.source_name,
    source_url: record.source_url,
    fetched_at: record.fetched_at,
    data_quality_flag: record.data_quality_flag || null,
    confidence_score: toNumber(record.confidence_score),
    notes: record.notes || null,
  }
}

async function loadRowsFromCsv(path: string) {
  const content = await readFile(path, 'utf-8')
  return parseCsv(content).map(csvRecordToFactRow)
}

async function loadRowsFromSupabase() {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('fact_vietnam_coffee_export_by_market')
    .select(
      'period_type,period_start,period_label,reporter_country,reporter_iso,partner_country,partner_iso,flow,commodity_group,analysis_bucket,hs6,hs_description,quantity_ton,value_usd,source_name,source_url,fetched_at,data_quality_flag,confidence_score,notes',
    )
    .eq('period_type', 'A')

  if (error) {
    throw error
  }

  return (data ?? []) as CoffeeExportByMarketFactRow[]
}

async function upsertRowsInChunks(rows: CoffeeExportUnitValueRow[], chunkSize = 500) {
  if (rows.length === 0) {
    return 0
  }
  const client = getSupabaseAdminClient()
  if (!client) {
    return 0
  }

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const { error } = await client
      .from('fact_export_unit_value')
      .upsert(chunk, { onConflict: 'period_type,period_label,reporter_iso,partner_iso,flow,hs6,source_name' })
    if (error) {
      throw error
    }
  }
  return rows.length
}

async function writeArtifactFile(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf-8')
}

export function renderCoffeeExportUnitValueQcMarkdown(report: CoffeeExportUnitValueQcReport, options: { generatedAt: string }) {
  const rows = [
    '# QC Report - Coffee Export Unit Value',
    '',
    `Generated at: ${options.generatedAt}`,
    '',
    '## Scope',
    '',
    '- Reporter: Vietnam (VNM)',
    '- Flow: Export',
    '- HS6: 090111 (coffee, not roasted, not decaffeinated)',
    '- Period type: annual',
    '- Aggregate partner rows such as World are excluded from by-market output and ranking.',
    '',
    '## Row Counts',
    '',
    `- Input rows in scope: ${report.inputRows}`,
    `- Output rows: ${report.outputRows}`,
    `- Duplicate input grain rows: ${report.duplicateInputGrainRows}`,
    `- Aggregate partner rows excluded: ${report.aggregatePartnerRowsExcluded}`,
    '',
    '## Unit Value Flags',
    '',
  ]

  for (const [flag, count] of Object.entries(report.flagCounts)) {
    rows.push(`- ${flag}: ${count}`)
  }

  rows.push('', '## Top 20 Highest Unit Values', '')
  for (const row of report.topHighestUnitValues) {
    rows.push(
      `- ${row.period_label} | ${row.partner_country} (${row.partner_iso ?? 'n/a'}) | value_usd=${row.export_value_usd ?? 'n/a'} | quantity_ton=${row.export_quantity_ton ?? 'n/a'} | unit_value_usd_per_ton=${row.export_unit_value_usd_per_ton ?? 'n/a'} | flag=${row.unit_value_flag} | confidence=${row.confidence_score}`,
    )
  }

  rows.push('', '## Top 20 Lowest Unit Values', '')
  for (const row of report.topLowestUnitValues) {
    rows.push(
      `- ${row.period_label} | ${row.partner_country} (${row.partner_iso ?? 'n/a'}) | value_usd=${row.export_value_usd ?? 'n/a'} | quantity_ton=${row.export_quantity_ton ?? 'n/a'} | unit_value_usd_per_ton=${row.export_unit_value_usd_per_ton ?? 'n/a'} | flag=${row.unit_value_flag} | confidence=${row.confidence_score}`,
    )
  }

  rows.push('', '## Top Markets By Value (Latest Period)', '')
  if (report.topMarketsByValue.length === 0) {
    rows.push('- No rows available')
  } else {
    rows.push(`Latest period: ${report.latestPeriodLabel ?? 'n/a'}`, '')
    for (const row of report.topMarketsByValue) {
      rows.push(
        `- #${row.value_rank_by_period} ${row.partner_country} (${row.partner_iso ?? 'n/a'}) | value_usd=${row.export_value_usd ?? 'n/a'} | quantity_ton=${row.export_quantity_ton ?? 'n/a'} | unit_value_usd_per_ton=${row.export_unit_value_usd_per_ton ?? 'n/a'} | share_value_pct=${row.market_share_by_value_pct ?? 'n/a'}`,
      )
    }
  }

  rows.push('', '## Premium Markets With Sufficient Volume', '')
  for (const row of report.premiumMarkets.slice(0, 20)) {
    rows.push(
      `- ${row.period_label} | ${row.partner_country} (${row.partner_iso ?? 'n/a'}) | unit_value_usd_per_ton=${row.export_unit_value_usd_per_ton ?? 'n/a'} | median=${row.medianUnitValue} | premium_vs_median_pct=${row.premiumVsMedianPct}`,
    )
  }

  rows.push(
    '',
    '## Notes',
    '',
    '- Export unit value is calculated as SUM(value_usd) / SUM(quantity_ton).',
    '- It is an average proxy, not a transaction, contract, FOB invoice, or exact selling price.',
    `- Low-volume threshold: quantity_ton < ${LOW_VOLUME_TON_THRESHOLD}.`,
    '',
  )

  return rows.join('\n')
}

export function renderCoffeeExportUnitValueMethodology() {
  return [
    '# Export Unit Value Methodology',
    '',
    '## Scope',
    '',
    '- Reporter: Vietnam (VNM)',
    '- Flow: Export',
    '- Commodity: coffee',
    '- HS6: 090111 (coffee, not roasted, not decaffeinated)',
    '- Period type: annual for the first implementation',
    '',
    '## Source',
    '',
    'Step 3 uses the Step 2 `fact_vietnam_coffee_export_by_market` dataset, originally sourced from UN Comtrade and filtered to customs=C00, mot=0, and partner2=0.',
    '',
    '## Formula',
    '',
    '`export_unit_value_usd_per_ton = SUM(value_usd) / SUM(quantity_ton)`',
    '',
    'The transform never averages row-level unit values. The unit is USD per metric ton.',
    '',
    '## Grain',
    '',
    '`period_type + period_label + reporter_iso + partner_iso + flow + hs6 + source_name`',
    '',
    '## Exclusions And Flags',
    '',
    '- Aggregate partner rows such as World are excluded from by-market output and ranking.',
    `- Markets with quantity_ton < ${LOW_VOLUME_TON_THRESHOLD} are flagged as low_volume.`,
    '- Missing value, missing quantity, zero quantity, and invalid unit values lower confidence.',
    '',
    '## Interpretation',
    '',
    'Export unit value is an average proxy calculated from trade value divided by quantity. It is not a transaction price, contract price, FOB invoice price, or exact selling price.',
    '',
    '## Known Limitations',
    '',
    '- Low-volume markets can produce noisy unit values.',
    '- HS 090111 can mix grades and qualities.',
    '- Reporting lag and customs revisions can change historical rows.',
    '- Unit conversion and source reporting issues remain possible.',
    '',
    '## Future Improvements',
    '',
    '- Compare with domestic prices, futures benchmarks, competitor unit values, and automated mirror-import verification.',
    '',
  ].join('\n')
}

export async function syncCoffeeExportUnitValue(options: CoffeeExportUnitValueSyncOptions = {}): Promise<CoffeeExportUnitValueSyncResult> {
  const periodType = options.periodType ?? 'A'
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd())
  const inputCsvPath = resolve(options.inputCsvPath ?? resolve(workspaceRoot, 'data', 'processed', 'fact_vietnam_coffee_export_by_market_a.csv'))
  const sourceRows =
    options.sourceRows ??
    (options.inputCsvPath ? await loadRowsFromCsv(inputCsvPath) : (await loadRowsFromSupabase()) ?? (await loadRowsFromCsv(inputCsvPath)))
  const transformed = buildCoffeeExportUnitValueRows(sourceRows, { periodType })
  const dryRun = options.dryRun ?? false
  const writeArtifacts = options.writeArtifacts ?? true

  const factCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'processed', `fact_export_unit_value_${periodType.toLowerCase()}.csv`) : null
  const qcReportPath = writeArtifacts
    ? resolve(workspaceRoot, 'reports', 'data_quality', `export_unit_value_qc_${periodType.toLowerCase()}.md`)
    : null
  const methodologyPath = writeArtifacts ? resolve(workspaceRoot, 'docs', 'methodology', 'export_unit_value_methodology.md') : null

  if (factCsvPath) {
    await writeArtifactFile(factCsvPath, toCsv(transformed.rows))
  }
  if (qcReportPath) {
    await writeArtifactFile(qcReportPath, renderCoffeeExportUnitValueQcMarkdown(transformed.qc, { generatedAt: new Date().toISOString() }))
  }
  if (methodologyPath) {
    await writeArtifactFile(methodologyPath, renderCoffeeExportUnitValueMethodology())
  }

  const rowsPersisted = dryRun ? 0 : await upsertRowsInChunks(transformed.rows)
  return {
    ...transformed,
    rowsPersisted,
    artifacts: {
      factCsvPath,
      qcReportPath,
      methodologyPath,
    },
  }
}
