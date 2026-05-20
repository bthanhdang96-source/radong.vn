import { foldText } from './crawlers/common.js'
import { SOURCE_BASE_CONFIDENCE } from './marketDataMappings.js'
import type { SourceId } from './crawlers/types.js'

export const COCONUT_COMMODITY_SLUG = 'dua-tuoi'

export type NormalizedUnitKey = 'kg' | 'trai' | 'chuc' | 'ton'

type UnitClusterScore = {
  key: NormalizedUnitKey
  score: number
  count: number
  latestRecordedAt: string
}

export function normalizeUnitKey(value: string | null | undefined): NormalizedUnitKey | null {
  if (!value) {
    return null
  }

  const folded = foldText(value)
  if (folded.includes('/kg') || folded === 'kg' || folded.endsWith(' kg')) {
    return 'kg'
  }

  if (folded.includes('/trai') || folded.includes('/qua') || folded === 'trai' || folded === 'qua') {
    return 'trai'
  }

  if (folded.includes('/chuc') || folded === 'chuc') {
    return 'chuc'
  }

  if (folded.includes('/tan') || folded.includes('/ton') || folded === 'tan' || folded === 'ton') {
    return 'ton'
  }

  return null
}

export function getDisplayUnit(
  normalizedUnitKey: string | null | undefined,
  displayUnit: string | null | undefined,
  currency = 'VND',
) {
  if (displayUnit && displayUnit.trim().length > 0) {
    return displayUnit
  }

  switch (normalizedUnitKey) {
    case 'trai':
      return `${currency}/trai`
    case 'chuc':
      return `${currency}/chuc`
    case 'ton':
      return `${currency}/tan`
    case 'kg':
    default:
      return `${currency}/kg`
  }
}

export function getUnitLabel(displayUnit: string) {
  const normalized = normalizeUnitKey(displayUnit)
  switch (normalized) {
    case 'trai':
      return 'Theo trái'
    case 'chuc':
      return 'Theo chục'
    case 'ton':
      return 'Theo tấn'
    case 'kg':
    default:
      return 'Theo kg'
  }
}

export function getCoconutUnitPriority(unitKey: string | null | undefined) {
  switch (unitKey) {
    case 'chuc':
      return 3
    case 'trai':
      return 2
    case 'kg':
      return 1
    default:
      return 0
  }
}

type CoconutUnitClusterInput = {
  commoditySlug: string
  sourceId?: string | null
  recordedAt?: string | null
  displayUnit?: string | null
  normalizedUnitKey?: string | null
}

export function selectPreferredCoconutUnitCluster<T>(
  rows: T[],
  pick: (row: T) => CoconutUnitClusterInput,
): NormalizedUnitKey | null {
  const scores = new Map<NormalizedUnitKey, UnitClusterScore>()

  for (const row of rows) {
    const input = pick(row)
    if (input.commoditySlug !== COCONUT_COMMODITY_SLUG) {
      continue
    }

    const key = normalizeUnitKey(input.normalizedUnitKey) ?? normalizeUnitKey(input.displayUnit)
    if (!key) {
      continue
    }

    const sourceId = input.sourceId && input.sourceId in SOURCE_BASE_CONFIDENCE ? (input.sourceId as SourceId) : null
    const baseScore = sourceId ? SOURCE_BASE_CONFIDENCE[sourceId] : 0.5
    const current = scores.get(key) ?? {
      key,
      score: 0,
      count: 0,
      latestRecordedAt: input.recordedAt ?? '',
    }

    current.score += baseScore
    current.count += 1
    if ((input.recordedAt ?? '') > current.latestRecordedAt) {
      current.latestRecordedAt = input.recordedAt ?? ''
    }
    scores.set(key, current)
  }

  const ranked = [...scores.values()].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    if (right.count !== left.count) {
      return right.count - left.count
    }

    if (right.latestRecordedAt !== left.latestRecordedAt) {
      return right.latestRecordedAt.localeCompare(left.latestRecordedAt)
    }

    return getCoconutUnitPriority(right.key) - getCoconutUnitPriority(left.key)
  })

  return ranked[0]?.key ?? null
}

