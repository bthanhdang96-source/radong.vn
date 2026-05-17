import type { PricePageScopeType } from './types.js'
import {
  getCategoryFallbackImage,
  getCommodityImageCatalogEntry,
  getDefaultCommodityImage,
  type CommodityImageVariant,
  type ResolvedCommodityImage,
} from './commodityImageCatalog.js'

export type CommodityImagePageKind = 'location_price_page' | 'commodity_price_page' | 'feed_card'

export type ResolveCommodityImageOptions = {
  commoditySlug: string
  commodityDisplayName?: string | null
  category?: string | null
  locationSlug?: string | null
  locationLabel?: string | null
  scopeType?: PricePageScopeType | null
  pageKind: CommodityImagePageKind
}

function fallbackCommodityLabel(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildImageAlt(variant: CommodityImageVariant, options: ResolveCommodityImageOptions) {
  const commodityLabel = options.commodityDisplayName?.trim() || fallbackCommodityLabel(options.commoditySlug)
  if (options.pageKind === 'commodity_price_page') {
    return `${variant.altBase}, minh họa cho giá ${commodityLabel}`
  }

  if (options.locationLabel?.trim()) {
    return `${variant.altBase}, minh họa cho giá ${commodityLabel} tại ${options.locationLabel.trim()}`
  }

  return `${variant.altBase}, minh họa cho giá ${commodityLabel}`
}

function pickVariantIndex(options: ResolveCommodityImageOptions, variantCount: number) {
  if (variantCount <= 1 || options.pageKind === 'commodity_price_page') {
    return 0
  }

  const seed = options.locationSlug?.trim() || options.locationLabel?.trim() || options.scopeType || options.commoditySlug
  return stableHash(`${options.commoditySlug}::${seed}`) % variantCount
}

export function stableHash(input: string) {
  let hash = 5381
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0
  }
  return hash >>> 0
}

export function resolveCommodityImage(options: ResolveCommodityImageOptions): ResolvedCommodityImage {
  const exact = getCommodityImageCatalogEntry(options.commoditySlug)
  if (exact && exact.variants.length > 0) {
    const variantIndex = pickVariantIndex(options, exact.variants.length)
    const variant = exact.variants[variantIndex] ?? exact.variants[0]
    return {
      url: variant.url,
      alt: buildImageAlt(variant, {
        ...options,
        commodityDisplayName: options.commodityDisplayName ?? exact.displayName,
      }),
      variantIndex,
      source: 'commodity',
    }
  }

  const categoryFallback = getCategoryFallbackImage(options.category)
  if (categoryFallback) {
    return {
      url: categoryFallback.url,
      alt: buildImageAlt(categoryFallback, options),
      variantIndex: 0,
      source: 'category_fallback',
    }
  }

  const defaultFallback = getDefaultCommodityImage()
  return {
    url: defaultFallback.url,
    alt: buildImageAlt(defaultFallback, options),
    variantIndex: 0,
    source: 'default_fallback',
  }
}
