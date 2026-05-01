import type { SupabaseClient } from '@supabase/supabase-js'
import type { CrawledPriceItem, SourceId } from '../crawlers/types.js'
import {
  classifyRiceRegionLabel,
  inferPriceType,
  getProvinceCodeFromRegion,
  isAggregateRegionLabel,
  SOURCE_TYPE_BY_SOURCE_ID,
  SOURCE_BASE_CONFIDENCE,
  USD_VND_RATE,
  type PriceType,
  type SourceType,
} from '../marketDataMappings.js'
import { pushErrorToQueue } from './queue.js'

type CommodityRow = {
  id: number
  slug: string
}

type Bounds = {
  min: number
  max: number
}

type ValidationResult = {
  passed: boolean
  reason?: string
  flag?: string
  confidencePenalty: number
  note?: string
}

export type IngestionQueueMessage = {
  source: SourceId
  sourceUrl: string | null
  crawledAt: string
  raw: CrawledPriceItem
}

export type NormalizedObservation = {
  recorded_at: string
  commodity_id: number
  commodity_slug: string
  variety: string | null
  quality_grade: string | null
  province_code: string | null
  market_name: string | null
  country_code: string
  price_type: PriceType
  price_vnd: number | null
  unit: string
  price_usd: number | null
  exchange_rate: number
  source_type: SourceType
  source_name: string
  source_url: string | null
  article_title: string | null
  confidence: number
  flags: string[]
  raw_payload: Record<string, unknown>
}

type NormalizationResult =
  | {
      value: NormalizedObservation
      penalties: number[]
      notes: string[]
    }
  | {
      error: {
        source_name: string
        error_type: string
        reason: string
        raw_payload: Record<string, unknown>
      }
    }

export const PRICE_BOUNDS: Record<string, Bounds> = {
  'ca-phe-robusta': { min: 60_000, max: 160_000 },
  'ho-tieu': { min: 80_000, max: 250_000 },
  'heo-hoi': { min: 40_000, max: 100_000 },
  'gao-noi-dia': { min: 3_000, max: 30_000 },
  cashew: { min: 20_000, max: 60_000 },
  cocoa: { min: 5_000, max: 90_000 },
  'ca-tra': { min: 20_000, max: 70_000 },
  'cam-sanh': { min: 5_000, max: 80_000 },
  'buoi-nam-roi': { min: 10_000, max: 80_000 },
}

function roundNumber(value: number) {
  return Number(value.toFixed(2))
}

export async function loadCommodityLookup(db: SupabaseClient) {
  const { data, error } = await db.from('commodities').select('id, slug')
  if (error) {
    throw error
  }

  return new Map(((data ?? []) as CommodityRow[]).map(row => [row.slug, row.id]))
}

function calculateConfidence(source: SourceId, penalties: number[]) {
  const base = SOURCE_BASE_CONFIDENCE[source] ?? 0.65
  const total = penalties.reduce((sum, penalty) => sum + penalty, 0)
  return Math.max(0.1, roundNumber(base - total))
}

function normalizeObservation(message: IngestionQueueMessage, commodityLookup: Map<string, number>): NormalizationResult {
  const item = message.raw
  const commodityId = commodityLookup.get(item.commodity)

  if (!commodityId) {
    return {
      error: {
        source_name: message.source,
        error_type: 'unknown_commodity',
        reason: `Commodity slug "${item.commodity}" is not seeded in commodities`,
        raw_payload: {
          ...message,
          raw: item,
        },
      },
    }
  }

  let provinceCode: string | null = getProvinceCodeFromRegion(item.region)
  let variety: string | null = null
  let qualityGrade: string | null = null
  let priceType: PriceType = inferPriceType({ sourceId: message.source })
  const flags: string[] = []
  const penalties: number[] = []
  const notes: string[] = []

  if (item.commodity === 'gao-noi-dia') {
    const riceClassification = classifyRiceRegionLabel(item.region)
    variety = riceClassification.variety
    qualityGrade = riceClassification.qualityGrade
    priceType = riceClassification.marketType
    provinceCode = null
  } else if (isAggregateRegionLabel(item.region)) {
    flags.push('aggregate_region')
  } else if (!provinceCode) {
    flags.push('unknown_region')
    penalties.push(0.2)
    notes.push(`Unknown region mapping for "${item.region}"`)
  }

  if (item.changePct === null || item.previousPrice === null || item.previousPrice === undefined) {
    flags.push('missing_change_context')
    penalties.push(0.05)
  }

  flags.push('price_type_inferred')

  return {
    value: {
      recorded_at: message.crawledAt,
      commodity_id: commodityId,
      commodity_slug: item.commodity,
      variety,
      quality_grade: qualityGrade,
      province_code: provinceCode,
      market_name: null,
      country_code: 'VNM',
      price_type: priceType,
      price_vnd: roundNumber(item.price),
      unit: 'kg',
      price_usd: roundNumber(item.price / USD_VND_RATE),
      exchange_rate: USD_VND_RATE,
      source_type: SOURCE_TYPE_BY_SOURCE_ID[message.source] ?? 'crawl_news',
      source_name: message.source,
      source_url: message.sourceUrl,
      article_title: null,
      confidence: SOURCE_BASE_CONFIDENCE[message.source] ?? 0.65,
      flags,
      raw_payload: {
        ...item,
        provinceCode,
      },
    },
    penalties,
    notes,
  }
}

function checkBounds(record: NormalizedObservation): ValidationResult {
  const bounds = PRICE_BOUNDS[record.commodity_slug]
  const priceVnd = record.price_vnd

  if (priceVnd === null) {
    return {
      passed: false,
      reason: 'Normalized observation is missing price_vnd',
      flag: 'unparseable_price',
      confidencePenalty: 0,
    }
  }

  if (!bounds) {
    return {
      passed: true,
      flag: 'no_bounds_defined',
      confidencePenalty: 0.1,
    }
  }

  if (priceVnd < bounds.min) {
    return {
      passed: false,
      reason: `Price ${priceVnd.toLocaleString('en-US')} is below ${bounds.min.toLocaleString('en-US')}`,
      flag: 'below_minimum',
      confidencePenalty: 0,
    }
  }

  if (priceVnd > bounds.max) {
    return {
      passed: false,
      reason: `Price ${priceVnd.toLocaleString('en-US')} is above ${bounds.max.toLocaleString('en-US')}`,
      flag: 'above_maximum',
      confidencePenalty: 0,
    }
  }

  return {
    passed: true,
    confidencePenalty: 0,
  }
}

function checkFreshness(record: NormalizedObservation): ValidationResult {
  const crawledAt = new Date(record.recorded_at)
  const ageHours = (Date.now() - crawledAt.getTime()) / (60 * 60 * 1000)

  if (!Number.isFinite(ageHours)) {
    return {
      passed: false,
      reason: 'Invalid crawled timestamp',
      flag: 'invalid_timestamp',
      confidencePenalty: 0,
    }
  }

  if (ageHours > 48) {
    return {
      passed: false,
      reason: `Data is stale (${Math.round(ageHours)}h old)`,
      flag: 'stale_data',
      confidencePenalty: 0,
    }
  }

  return {
    passed: true,
    confidencePenalty: 0,
  }
}

async function checkDuplicate(record: NormalizedObservation, db: SupabaseClient): Promise<ValidationResult> {
  const windowEnd = new Date(record.recorded_at)
  const windowStart = new Date(windowEnd)
  windowStart.setHours(windowStart.getHours() - 6)

  let query = db
    .from('price_observations')
    .select('id', { head: true, count: 'exact' })
    .eq('commodity_id', record.commodity_id)
    .eq('price_type', record.price_type)
    .eq('source_name', record.source_name)
    .gte('recorded_at', windowStart.toISOString())
    .lte('recorded_at', windowEnd.toISOString())

  query =
    record.province_code === null
      ? query.is('province_code', null)
      : query.eq('province_code', record.province_code)

  const { count, error } = await query
  if (error) {
    throw error
  }

  if ((count ?? 0) > 0) {
    return {
      passed: false,
      reason: 'Duplicate observation found within 6 hours',
      flag: 'duplicate',
      confidencePenalty: 0,
    }
  }

  return {
    passed: true,
    confidencePenalty: 0,
  }
}

async function checkSpike(record: NormalizedObservation, db: SupabaseClient): Promise<ValidationResult> {
  const { data, error } = await db.rpc('get_recent_median', {
    p_commodity_id: record.commodity_id,
    p_province_code: record.province_code,
    p_price_type: record.price_type,
    p_days: 7,
  })

  if (error) {
    throw error
  }

  const medianValue = Array.isArray(data) ? data[0]?.median_price : null
  if (!medianValue) {
    return {
      passed: true,
      flag: 'no_market_history',
      confidencePenalty: 0,
    }
  }

  const medianPrice = Number(medianValue)
  const currentPrice = record.price_vnd
  if (!Number.isFinite(medianPrice) || medianPrice <= 0) {
    return {
      passed: true,
      flag: 'no_market_history',
      confidencePenalty: 0,
    }
  }

  if (currentPrice === null) {
    return {
      passed: false,
      reason: 'Normalized observation is missing price_vnd',
      flag: 'unparseable_price',
      confidencePenalty: 0,
    }
  }

  const changePct = Math.abs(currentPrice - medianPrice) / medianPrice * 100
  if (changePct > 40) {
    return {
      passed: true,
      flag: 'spike_detected',
      confidencePenalty: 0.3,
      note: `Change ${roundNumber(changePct)}% vs 7d median ${roundNumber(medianPrice)}`,
    }
  }

  return {
    passed: true,
    confidencePenalty: 0,
  }
}

export async function recordIngestionError(
  db: SupabaseClient,
  message: IngestionQueueMessage,
  errorType: string,
  reason: string,
) {
  await pushErrorToQueue(message, errorType, reason)

  const { error } = await db.from('ingestion_errors').insert({
    source_name: message.source,
    error_type: errorType,
    reason,
    raw_payload: {
      ...message,
      raw: message.raw,
    },
  })

  if (error) {
    throw error
  }
}

export async function processIngestionMessage(
  db: SupabaseClient,
  commodityLookup: Map<string, number>,
  message: IngestionQueueMessage,
) {
  const normalized = normalizeObservation(message, commodityLookup)
  if ('error' in normalized) {
    await recordIngestionError(db, message, normalized.error.error_type, normalized.error.reason)
    return { inserted: false, errorType: normalized.error.error_type }
  }

  const clean = normalized.value
  const penalties = [...normalized.penalties]
  const validationNotes = [...normalized.notes]

  const checks = [
    checkBounds(clean),
    checkFreshness(clean),
    await checkDuplicate(clean, db),
    await checkSpike(clean, db),
  ]

  for (const result of checks) {
    if (!result.passed) {
      await recordIngestionError(db, message, result.flag ?? 'validation_failed', result.reason ?? 'Validation failed')
      return { inserted: false, errorType: result.flag ?? 'validation_failed' }
    }

    if (result.flag) {
      clean.flags.push(result.flag)
    }

    if (result.confidencePenalty > 0) {
      penalties.push(result.confidencePenalty)
    }

    if (result.note) {
      validationNotes.push(result.note)
    }
  }

  clean.confidence = calculateConfidence(message.source, penalties)
  if (clean.confidence < 0.5) {
    clean.flags.push('low_confidence')
  }

  clean.raw_payload = {
    ...clean.raw_payload,
    validationNotes,
  }

  const { error } = await db.from('price_observations').insert(clean)
  if (error) {
    throw error
  }

  return { inserted: true, errorType: null }
}
