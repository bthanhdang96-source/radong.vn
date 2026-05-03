import { createHash } from 'node:crypto'
import { foldText } from '../crawlers/common.js'
import type { PriceType } from '../marketDataMappings.js'

export type Bounds = {
  min: number
  max: number
}

export const BASE_PRICE_BOUNDS: Record<string, Bounds> = {
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

const PRICE_TYPE_BOUND_MULTIPLIERS: Record<PriceType, { min: number; max: number }> = {
  farm_gate: { min: 0.6, max: 1.15 },
  wholesale: { min: 1, max: 1 },
  retail: { min: 0.55, max: 3.25 },
  export: { min: 0.45, max: 2.4 },
}

const PRICE_TYPE_BOUND_OVERRIDES: Partial<Record<PriceType, Partial<Record<string, Bounds>>>> = {
  export: {
    cashew: { min: 40_000, max: 250_000 },
  },
}

type DedupeKeyInput = {
  sourceName: string
  commoditySlug: string
  priceType: string
  provinceCode?: string | null
  marketName?: string | null
  articleTitle?: string | null
  sourceUrl?: string | null
  countryCode?: string | null
  priceVnd?: number | null
  recordedAt: string
  explicitKey?: string | null
  extra?: Record<string, unknown> | null
}

function roundPriceForFingerprint(priceVnd: number | null | undefined) {
  if (priceVnd === null || priceVnd === undefined || !Number.isFinite(priceVnd)) {
    return 'na'
  }

  return String(Math.round(priceVnd))
}

function normalizeRecordedDate(recordedAt: string) {
  const parsed = new Date(recordedAt)
  if (Number.isNaN(parsed.getTime())) {
    return recordedAt.slice(0, 10) || 'unknown-date'
  }

  return parsed.toISOString().slice(0, 10)
}

function normalizeFingerprintPart(value: string | null | undefined) {
  if (!value) {
    return 'na'
  }

  const folded = foldText(value)
  return folded.length > 0 ? folded : 'na'
}

function getExtraFingerprintHint(extra: Record<string, unknown> | null | undefined) {
  if (!extra) {
    return null
  }

  const candidateKeys = ['dedupeKey', 'listingId', 'itemId', 'modelId', 'shopId', 'destination', 'hsCode', 'partner']
  for (const key of candidateKeys) {
    const value = extra[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  }

  return null
}

export function getValidationBounds(commoditySlug: string, priceType: PriceType) {
  const override = PRICE_TYPE_BOUND_OVERRIDES[priceType]?.[commoditySlug]
  if (override) {
    return override
  }

  const bounds = BASE_PRICE_BOUNDS[commoditySlug]
  if (!bounds) {
    return null
  }

  const multiplier = PRICE_TYPE_BOUND_MULTIPLIERS[priceType]
  return {
    min: Math.round(bounds.min * multiplier.min),
    max: Math.round(bounds.max * multiplier.max),
  }
}

export function buildObservationDedupeKey(input: DedupeKeyInput) {
  const explicitKey = input.explicitKey?.trim() || getExtraFingerprintHint(input.extra)
  const parts = explicitKey
    ? ['explicit', input.sourceName, explicitKey]
    : [
        input.sourceName,
        input.commoditySlug,
        input.priceType,
        input.provinceCode ?? input.countryCode ?? 'na',
        input.marketName ?? getExtraFingerprintHint(input.extra) ?? input.articleTitle ?? input.sourceUrl ?? 'na',
        roundPriceForFingerprint(input.priceVnd),
        normalizeRecordedDate(input.recordedAt),
      ]

  const normalized = parts.map(part => normalizeFingerprintPart(part))
  return createHash('md5').update(normalized.join('|')).digest('hex')
}
