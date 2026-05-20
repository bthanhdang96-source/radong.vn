import { COCONUT_COMMODITY_SLUG, getDisplayUnit } from '../coconutPricing.js'
import { foldText, roundNumber } from './common.js'
import { parseQuantityKgFromText } from './retailCommodityMatcher.js'

export type RetailUnitPricing = {
  price: number
  unit: string
  unitRaw: string
  normalizedUnitKey: 'kg' | 'trai' | 'chuc'
  unitQuantity: number | null
  extra: Record<string, unknown>
}

function parseCountValue(value: string) {
  const normalized = value.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseCoconutCount(productText: string) {
  const folded = foldText(productText)
  const chucMatch = folded.match(/(\d+(?:[.,]\d+)?)\s*chuc\b/)
  if (chucMatch) {
    const chucCount = parseCountValue(chucMatch[1])
    if (chucCount) {
      return {
        normalizedUnitKey: 'chuc' as const,
        priceDivisor: chucCount,
        unitQuantity: chucCount,
        sourceUnitRaw: `${chucCount} chuc`,
      }
    }
  }

  const fruitMatch = folded.match(/(\d+(?:[.,]\d+)?)\s*(trai|qua)\b/)
  if (!fruitMatch) {
    return null
  }

  const fruitCount = parseCountValue(fruitMatch[1])
  if (!fruitCount) {
    return null
  }

  if (fruitCount >= 10 && fruitCount % 10 === 0) {
    const chucCount = fruitCount / 10
    return {
      normalizedUnitKey: 'chuc' as const,
      priceDivisor: chucCount,
      unitQuantity: chucCount,
      sourceUnitRaw: `${fruitCount} trai`,
    }
  }

  return {
    normalizedUnitKey: 'trai' as const,
    priceDivisor: fruitCount,
    unitQuantity: fruitCount,
    sourceUnitRaw: `${fruitCount} trai`,
  }
}

export function parseRetailUnitPricing(
  commoditySlug: string,
  priceOriginalVnd: number,
  ...candidates: Array<string | null | undefined>
): RetailUnitPricing | null {
  if (!Number.isFinite(priceOriginalVnd) || priceOriginalVnd <= 0) {
    return null
  }

  const textCandidates = candidates.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  const combinedText = textCandidates.join(' ')

  if (commoditySlug === COCONUT_COMMODITY_SLUG) {
    const coconutCount = parseCoconutCount(combinedText)
    if (coconutCount) {
      const price = roundNumber(priceOriginalVnd / coconutCount.priceDivisor)
      return {
        price,
        unit: getDisplayUnit(coconutCount.normalizedUnitKey, null),
        unitRaw: coconutCount.sourceUnitRaw,
        normalizedUnitKey: coconutCount.normalizedUnitKey,
        unitQuantity: coconutCount.unitQuantity,
        extra: {
          priceOriginalVnd,
          conversionMethod: coconutCount.normalizedUnitKey === 'chuc' ? 'bundle_to_chuc' : 'bundle_to_trai',
        },
      }
    }
  }

  for (const candidate of textCandidates) {
    const quantityKg = parseQuantityKgFromText(candidate)
    if (!quantityKg || !Number.isFinite(quantityKg) || quantityKg <= 0) {
      continue
    }

    return {
      price: roundNumber(priceOriginalVnd / quantityKg),
      unit: 'VND/kg',
      unitRaw: candidate,
      normalizedUnitKey: 'kg',
      unitQuantity: quantityKg,
      extra: {
        priceOriginalVnd,
        quantityKg,
        conversionMethod: 'weight_to_kg',
      },
    }
  }

  return null
}
