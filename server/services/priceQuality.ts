import { foldText, roundNumber } from './crawlers/common.js'
import type { RegionPrice, SourceId, SourceSnapshot } from './crawlers/types.js'
import { SOURCE_BASE_CONFIDENCE, isAggregateRegionLabel } from './marketDataMappings.js'

export type RankedRegionCandidate = {
  region: string
  regionKey: string
  price: number
  change: number | null
  changePct: number | null
  source: SourceId
  timestamp: string
  isAggregateRegion: boolean
  sourcePriority: number
  sourceConfidence: number
}

export type CanonicalRegionSelection = {
  regionKey: string
  region: string
  primary: RankedRegionCandidate
  candidates: RankedRegionCandidate[]
  hasConflict: boolean
  conflictPct: number | null
  isAggregateRegion: boolean
}

function getDefaultSourcePriority(source: SourceId) {
  return Math.round(SOURCE_BASE_CONFIDENCE[source] * 100)
}

function getCandidateScore(candidate: RankedRegionCandidate) {
  let score = candidate.sourcePriority * 100 + candidate.sourceConfidence * 10

  if (candidate.isAggregateRegion) {
    score -= 15
  } else {
    score += 5
  }

  if (candidate.change !== null) {
    score += 2
  }

  if (candidate.changePct !== null) {
    score += 1
  }

  return score
}

function compareCandidates(a: RankedRegionCandidate, b: RankedRegionCandidate) {
  const scoreDiff = getCandidateScore(b) - getCandidateScore(a)
  if (scoreDiff !== 0) {
    return scoreDiff
  }

  if (a.timestamp !== b.timestamp) {
    return b.timestamp.localeCompare(a.timestamp)
  }

  if (a.price !== b.price) {
    return b.price - a.price
  }

  return a.region.localeCompare(b.region)
}

export function buildSourcePriorityLookup(sourceSnapshots?: SourceSnapshot[]) {
  const priorities = new Map<SourceId, number>()

  for (const snapshot of sourceSnapshots ?? []) {
    priorities.set(snapshot.id, snapshot.priority)
  }

  return priorities
}

export function createRankedRegionCandidate(input: {
  region: string
  price: number
  change: number | null
  changePct: number | null
  source: SourceId
  timestamp: string
  sourcePriority?: number | null
}) {
  return {
    region: input.region,
    regionKey: foldText(input.region),
    price: input.price,
    change: input.change,
    changePct: input.changePct,
    source: input.source,
    timestamp: input.timestamp,
    isAggregateRegion: isAggregateRegionLabel(input.region),
    sourcePriority: input.sourcePriority ?? getDefaultSourcePriority(input.source),
    sourceConfidence: SOURCE_BASE_CONFIDENCE[input.source],
  } satisfies RankedRegionCandidate
}

export function buildCanonicalRegionSelections(candidates: RankedRegionCandidate[]): CanonicalRegionSelection[] {
  const grouped = new Map<string, RankedRegionCandidate[]>()

  for (const candidate of candidates) {
    const siblings = grouped.get(candidate.regionKey) ?? []
    siblings.push(candidate)
    grouped.set(candidate.regionKey, siblings)
  }

  return [...grouped.entries()]
    .map(([regionKey, siblings]) => {
      const ranked = [...siblings].sort(compareCandidates)
      const prices = ranked.map(item => item.price)
      const min = Math.min(...prices)
      const max = Math.max(...prices)
      const conflictPct = min > 0 ? roundNumber(((max - min) / min) * 100) : null

      return {
        regionKey,
        region: ranked[0].region,
        primary: ranked[0],
        candidates: ranked,
        hasConflict: ranked.length > 1 && conflictPct !== null && conflictPct > 2,
        conflictPct: ranked.length > 1 ? conflictPct : null,
        isAggregateRegion: ranked[0].isAggregateRegion,
      } satisfies CanonicalRegionSelection
    })
    .sort((a, b) => {
      if (a.isAggregateRegion !== b.isAggregateRegion) {
        return a.isAggregateRegion ? 1 : -1
      }

      if (a.primary.price !== b.primary.price) {
        return b.primary.price - a.primary.price
      }

      return a.region.localeCompare(b.region)
    })
}

export function pickSummaryRegionSelections(selections: CanonicalRegionSelection[]) {
  const specific = selections.filter(selection => !selection.isAggregateRegion)
  return specific.length > 0 ? specific : selections
}

export function toRegionPrices(selections: CanonicalRegionSelection[]): RegionPrice[] {
  return selections.map(selection => ({
    region: selection.region,
    price: selection.primary.price,
    change: selection.primary.change,
    changePct: selection.primary.changePct,
    source: selection.primary.source,
    hasConflict: selection.hasConflict,
    conflictPct: selection.conflictPct,
  }))
}
