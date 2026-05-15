import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { failedSource, finalizeSourceBatch, foldText, roundNumber, USER_AGENT } from './common.js'
import { matchRetailCommodity, parseQuantityKgFromText } from './retailCommodityMatcher.js'
import type { CrawledPriceItem, CrawlerResult } from './types.js'
import { retryTransient } from '../transientNetwork.js'

type CoopAddressSuggestion = {
  fullAddress?: string
  provinceCode?: string
  lat?: number
  long?: number
}

type CoopTerminal = {
  terminalName?: string
  terminalCode?: string
  terminalId?: number
  fullAddress?: string
  provinceCode?: string
}

type CoopApiProduct = {
  sku?: string
  productId?: number
  name?: string
  canonical?: string
  uomName?: string
  latestPrice?: string | number
  supplierRetailPrice?: string | number
}

type CoopSearchResponse = {
  data?: {
    products?: CoopApiProduct[]
    page?: number
    pageSize?: number
    total?: number
  }
}

type CoopAddressSuggestResponse = {
  data?: {
    addresses?: CoopAddressSuggestion[]
  }
}

type CoopTerminalLookupResponse = {
  data?: {
    terminals?: CoopTerminal[]
  }
}

type CoopResolvedRegion = {
  code: string
  nameVi: string
  terminalId: number
  terminalCode: string
  terminalName: string
  terminalAddress: string
  provinceCode: string | null
}

type CoopRegionSeed = {
  code: string
  nameVi: string
  address: string
}

type CoopFixturePayload = {
  regions: Array<{
    code: string
    regionName: string
    terminalId: number
    terminalCode: string
    terminalName: string
    provinceCode?: string | null
    fullAddress: string
    categories: Record<string, CoopApiProduct[]>
  }>
}

type CoopCategoryTarget = {
  slug: string
  label: string
}

export type CrawlCoopOptions = {
  fixturePath?: string | null
  regionCodes?: string[] | null
  categorySlugs?: string[] | null
  maxPagesPerCategory?: number
}

const COOP_HOME_URL = 'https://cooponline.vn/'
const COOP_DISCOVERY_URL = 'https://discovery.tekoapis.com/api/v2/search-skus-v2'
const COOP_ADDRESS_SUGGEST_URL = 'https://location.tekoapis.com/api/v2/location/addresses/suggest'
const COOP_TERMINAL_LOOKUP_URL = 'https://consumer-bff.tekoapis.com/api/v1/terminals-by-address'
const COOP_PLATFORM_ID = 2295
const COOP_PAGE_SIZE = 40

const COOP_REGION_SEEDS: CoopRegionSeed[] = [
  {
    code: 'HCM',
    nameVi: 'TP. Ho Chi Minh',
    address: '168 Nguyen Dinh Chieu, Phuong Xuan Hoa, Thanh pho Ho Chi Minh',
  },
  {
    code: 'HNI',
    nameVi: 'Ha Noi',
    address: 'Trang Tien Hoan Kiem Ha Noi',
  },
  {
    code: 'DNG',
    nameVi: 'Da Nang',
    address: '1 Bach Dang Hai Chau Da Nang',
  },
]

const COOP_CATEGORY_TARGETS: CoopCategoryTarget[] = [
  { slug: '/c/rau-cu', label: 'Rau cu' },
  { slug: '/c/trai-cay', label: 'Trai cay' },
  { slug: '/c/thit', label: 'Thit' },
  { slug: '/c/thuy-hai-san', label: 'Thuy hai san' },
]

function getEnabledRegionCodes(options: CrawlCoopOptions) {
  const explicit = options.regionCodes?.map(code => code.trim().toUpperCase()).filter(Boolean)
  if (explicit && explicit.length > 0) {
    return explicit
  }

  const envValue = process.env.COOP_ENABLED_REGIONS?.trim()
  if (!envValue) {
    return ['HCM', 'HNI', 'DNG']
  }

  return envValue
    .split(',')
    .map(code => code.trim().toUpperCase())
    .filter(Boolean)
}

function normalizeCategorySlug(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (trimmed.startsWith('/c/')) {
    return trimmed
  }

  return `/c/${trimmed.replace(/^\/+/, '')}`
}

function getCategoryTargets(options: CrawlCoopOptions) {
  const explicit = options.categorySlugs?.map(normalizeCategorySlug).filter(Boolean)
  if (explicit && explicit.length > 0) {
    const enabled = new Set(explicit)
    return COOP_CATEGORY_TARGETS.filter(target => enabled.has(target.slug))
  }

  const envValue = process.env.COOP_ENABLED_CATEGORIES?.trim()
  if (!envValue) {
    return COOP_CATEGORY_TARGETS
  }

  const enabled = new Set(
    envValue
      .split(',')
      .map(normalizeCategorySlug)
      .filter(Boolean),
  )
  return COOP_CATEGORY_TARGETS.filter(target => enabled.has(target.slug))
}

function getMaxPagesPerCategory(options: CrawlCoopOptions) {
  const value = options.maxPagesPerCategory ?? Number(process.env.COOP_MAX_PAGES_PER_CATEGORY ?? '2')
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 10) : 2
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  return retryTransient(async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json',
          'user-agent': USER_AGENT,
          ...(init?.headers ?? {}),
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`)
      }

      return (await response.json()) as T
    } finally {
      clearTimeout(timeout)
    }
  })
}

async function loadFixture(path: string) {
  const candidates = [resolve(path)]
  if (path.startsWith('server/')) {
    candidates.push(resolve(path.slice('server/'.length)))
  } else {
    candidates.push(resolve('server', path))
  }

  let resolvedPath = candidates[0]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      resolvedPath = candidate
      break
    } catch {
      continue
    }
  }

  const content = await readFile(resolvedPath, 'utf8')
  return JSON.parse(content) as CoopFixturePayload
}

async function resolveAddress(seed: CoopRegionSeed) {
  const params = new URLSearchParams({
    inputAddress: seed.address,
  })
  const response = await fetchJson<CoopAddressSuggestResponse>(`${COOP_ADDRESS_SUGGEST_URL}?${params.toString()}`, {
    headers: {
      accept: 'application/json, text/plain, */*',
    },
  })
  const suggestion = response.data?.addresses?.[0]
  if (!suggestion?.fullAddress || typeof suggestion.lat !== 'number' || typeof suggestion.long !== 'number') {
    throw new Error(`Unable to resolve address suggestion for ${seed.code}`)
  }

  return suggestion
}

async function resolveTerminal(seed: CoopRegionSeed) {
  const suggestion = await resolveAddress(seed)
  const fullAddress = suggestion.fullAddress
  const latitude = suggestion.lat
  const longitude = suggestion.long

  if (!fullAddress || typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new Error(`Address suggestion for ${seed.code} is missing coordinates`)
  }

  const params = new URLSearchParams({
    platformId: String(COOP_PLATFORM_ID),
    fullAddress,
    lat: String(latitude),
    long: String(longitude),
  })
  const response = await fetchJson<CoopTerminalLookupResponse>(`${COOP_TERMINAL_LOOKUP_URL}?${params.toString()}`, {
    headers: {
      accept: 'application/json, text/plain, */*',
    },
  })
  const terminal = response.data?.terminals?.[0]
  if (!terminal?.terminalId || !terminal.terminalCode || !terminal.terminalName || !terminal.fullAddress) {
    throw new Error(`Unable to resolve terminal for ${seed.code}`)
  }

  return {
    code: seed.code,
    nameVi: seed.nameVi,
    terminalId: terminal.terminalId,
    terminalCode: terminal.terminalCode,
    terminalName: terminal.terminalName,
    terminalAddress: terminal.fullAddress,
    provinceCode: terminal.provinceCode ?? suggestion.provinceCode ?? null,
  } satisfies CoopResolvedRegion
}

async function resolveCoopRegions(regionCodes: string[]) {
  const seeds = regionCodes
    .map(code => COOP_REGION_SEEDS.find(seed => seed.code === code))
    .filter((seed): seed is CoopRegionSeed => Boolean(seed))
  const resolved: CoopResolvedRegion[] = []
  const resolutionErrors: string[] = []

  for (const seed of seeds) {
    try {
      resolved.push(await resolveTerminal(seed))
    } catch (error) {
      resolutionErrors.push(`${seed.code}: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  return {
    regions: resolved,
    resolutionErrors,
  }
}

function parsePriceValue(value: string | number | undefined) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.]/g, ''))
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return null
}

function getQuantityKg(product: CoopApiProduct) {
  if (foldText(product.uomName ?? '') === 'kg') {
    return 1
  }

  const candidates = [product.name, product.canonical]
  for (const candidate of candidates) {
    const quantity = parseQuantityKgFromText(candidate)
    if (quantity && Number.isFinite(quantity) && quantity > 0) {
      return quantity
    }
  }

  return null
}

function toCrawledItem(product: CoopApiProduct, region: CoopResolvedRegion, categorySlug: string): CrawledPriceItem | null {
  const productName = product.name?.trim() ?? ''
  if (!productName) {
    return null
  }

  const commodity = matchRetailCommodity(productName)
  if (!commodity) {
    return null
  }

  const priceOriginalVnd = parsePriceValue(product.latestPrice ?? product.supplierRetailPrice)
  if (!priceOriginalVnd) {
    return null
  }

  const quantityKg = getQuantityKg(product)
  if (!quantityKg) {
    return null
  }

  const sku = product.sku?.trim()
  const productId = product.productId
  if (!sku || !productId) {
    return null
  }

  const listingUrl = product.canonical ? `https://cooponline.vn/${product.canonical}` : null

  return {
    commodity: commodity.slug,
    commodityName: commodity.commodityName,
    category: commodity.category,
    region: region.nameVi,
    price: roundNumber(priceOriginalVnd / quantityKg),
    unit: 'VND/kg',
    change: null,
    changePct: null,
    timestamp: new Date().toISOString(),
    source: 'coop',
    priceType: 'retail',
    marketName: region.terminalName,
    articleTitle: productName,
    countryCode: 'VNM',
    dedupeKey: `coop:${region.code}:${region.terminalId}:${sku}:${quantityKg}`,
    previousPrice: null,
    extra: {
      categorySlug,
      regionCode: region.code,
      terminalCode: region.terminalCode,
      terminalId: region.terminalId,
      terminalAddress: region.terminalAddress,
      provinceCode: region.provinceCode,
      sku,
      productId,
      quantityKg,
      priceOriginalVnd,
      canonical: product.canonical ?? null,
      uomName: product.uomName ?? null,
      listingUrl,
      sourceFormat: 'teko_discovery_api',
    },
  }
}

async function fetchCategoryPage(region: CoopResolvedRegion, categorySlug: string, page: number) {
  const response = await fetchJson<CoopSearchResponse>(COOP_DISCOVERY_URL, {
    method: 'POST',
    body: JSON.stringify({
      terminalId: region.terminalId,
      page,
      pageSize: COOP_PAGE_SIZE,
      slug: categorySlug,
      filter: {},
      sorting: {
        sort: 'SORT_BY_UNSPECIFIED',
        order: 'ORDER_BY_UNSPECIFIED',
      },
      returnFilterable: [],
      isNeedFeaturedProducts: true,
    }),
  })

  return response.data?.products ?? []
}

async function crawlRegionCategory(
  region: CoopResolvedRegion,
  categorySlug: string,
  maxPagesPerCategory: number,
  warnings: string[],
) {
  const items: CrawledPriceItem[] = []
  for (let page = 1; page <= maxPagesPerCategory; page += 1) {
    try {
      const products = await fetchCategoryPage(region, categorySlug, page)
      if (products.length === 0) {
        break
      }

      items.push(
        ...products
          .map(product => toCrawledItem(product, region, categorySlug))
          .filter((item): item is CrawledPriceItem => item !== null),
      )

      if (products.length < COOP_PAGE_SIZE) {
        break
      }
    } catch (error) {
      warnings.push(`${region.code}/${categorySlug}/page-${page}: ${error instanceof Error ? error.message : 'unknown error'}`)
      break
    }
  }

  return items
}

function getCoverage(items: CrawledPriceItem[], categoryTargets: CoopCategoryTarget[]) {
  const coverage = [...new Set(items.map(item => item.commodity))]
  return coverage.length > 0 ? coverage : categoryTargets.map(target => target.slug)
}

export async function crawlCoop(options: CrawlCoopOptions = {}): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString()
  const fixturePath = options.fixturePath ?? null
  const regionCodes = getEnabledRegionCodes(options)
  const categoryTargets = getCategoryTargets(options)
  const maxPagesPerCategory = getMaxPagesPerCategory(options)

  try {
    const fixture = fixturePath ? await loadFixture(fixturePath) : null
    const resolution = fixture
      ? {
          regions: fixture.regions
            .filter(region => regionCodes.includes(region.code))
            .map(
              region =>
                ({
                  code: region.code,
                  nameVi: region.regionName,
                  terminalId: region.terminalId,
                  terminalCode: region.terminalCode,
                  terminalName: region.terminalName,
                  terminalAddress: region.fullAddress,
                  provinceCode: region.provinceCode ?? null,
                }) satisfies CoopResolvedRegion,
            ),
          resolutionErrors: [] as string[],
        }
      : await resolveCoopRegions(regionCodes)

    const items: CrawledPriceItem[] = []
    const warnings = [...resolution.resolutionErrors]

    if (fixture) {
      const fixtureRegionMap = new Map(
        fixture.regions.map(region => [
          region.code,
          {
            regionName: region.regionName,
            categories: region.categories,
          },
        ]),
      )

      for (const region of resolution.regions) {
        const fixtureRegion = fixtureRegionMap.get(region.code)
        for (const category of categoryTargets) {
          const products = fixtureRegion?.categories?.[category.slug] ?? []
          items.push(
            ...products
              .map(product => toCrawledItem(product, region, category.slug))
              .filter((item): item is CrawledPriceItem => item !== null),
          )
        }
      }
    } else {
      for (const region of resolution.regions) {
        for (const category of categoryTargets) {
          items.push(...(await crawlRegionCategory(region, category.slug, maxPagesPerCategory, warnings)))
        }
      }
    }

    return finalizeSourceBatch(
      'coop',
      'cooponline.vn - Retail',
      COOP_HOME_URL,
      fetchedAt,
      getCoverage(items, categoryTargets),
      items,
      COOP_HOME_URL,
      {
        fixturePath,
        sourceMode: fixture ? 'fixture' : 'api_live',
        regionCodes,
        resolvedRegionCodes: resolution.regions.map(region => region.code),
        categorySlugs: categoryTargets.map(target => target.slug),
        maxPagesPerCategory,
        pageSize: COOP_PAGE_SIZE,
        platformId: COOP_PLATFORM_ID,
        terminals: resolution.regions.map(region => ({
          regionCode: region.code,
          regionName: region.nameVi,
          terminalId: region.terminalId,
          terminalCode: region.terminalCode,
          terminalName: region.terminalName,
          provinceCode: region.provinceCode,
        })),
        warnings,
      },
    )
  } catch (error) {
    return failedSource(
      'coop',
      'cooponline.vn - Retail',
      COOP_HOME_URL,
      fetchedAt,
      categoryTargets.map(target => target.slug),
      error,
      COOP_HOME_URL,
      {
        fixturePath,
        sourceMode: fixturePath ? 'fixture' : 'api_live',
        regionCodes,
        categorySlugs: categoryTargets.map(target => target.slug),
        maxPagesPerCategory,
        pageSize: COOP_PAGE_SIZE,
        platformId: COOP_PLATFORM_ID,
      },
    )
  }
}
