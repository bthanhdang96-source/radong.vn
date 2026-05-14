import { access, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import {
  closeBhxApiSession,
  fetchBhxCategoryProducts,
  launchBhxApiSession,
  type BhxApiSession,
  type BhxResolvedRegion,
} from './bhxBrowser.js'
import { failedSource, finalizeSourceBatch, foldText, roundNumber } from './common.js'
import { matchRetailCommodity, parseQuantityKgFromText } from './retailCommodityMatcher.js'
import type { CrawledPriceItem, CrawlerResult } from './types.js'

type BhxApiPriceOption = {
  price?: number
  netUnitValue?: number
}

type BhxApiProduct = {
  id?: number
  name?: string
  fullName?: string
  url?: string
  unit?: string
  canonical?: string
  productCode?: string
  brandName?: string
  isNetUnit?: boolean
  category?: {
    name?: string
    url?: string
  }
  productPrices?: BhxApiPriceOption[]
}

type BhxRegionSeed = {
  code: string
  displayName: string
  provinceLookup: string
  fallback?: Omit<BhxResolvedRegion, 'code' | 'nameVi'>
}

type BhxLocationResponse = {
  data?: {
    provinces?: Array<{
      id?: number
      name?: string
      wards?: Array<{
        id?: number
        name?: string
        storeInfos?: Array<{
          id?: number
        }>
      }>
    }>
  }
}

type BhxFixturePayload = {
  regions: Array<{
    code: string
    regionName: string
    provinceId: number
    wardId: number
    storeId: number
    categories: Record<string, BhxApiProduct[]>
  }>
}

type BhxCategoryTarget = {
  categoryUrl: string
  label: string
}

export type CrawlBhxOptions = {
  fixturePath?: string | null
  regionCodes?: string[] | null
  categoryUrls?: string[] | null
  maxProductsPerCategory?: number
}

const BHX_HOME_URL = 'https://www.bachhoaxanh.com/'
const BHX_LOCATION_API_URL = 'https://api.bachhoaxanh.com/gw/LocationV3/GetFull'
const BHX_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
const BHX_CATEGORY_TARGETS: BhxCategoryTarget[] = [
  { categoryUrl: 'trai-cay-tuoi-ngon', label: 'Trai cay' },
  { categoryUrl: 'rau-sach', label: 'Rau la' },
  { categoryUrl: 'cu', label: 'Cu qua' },
  { categoryUrl: 'thit-heo', label: 'Thit heo' },
  { categoryUrl: 'ca-tom-muc-ech', label: 'Ca tom muc ech' },
]

const BHX_REGION_SEEDS: BhxRegionSeed[] = [
  {
    code: 'HCM',
    displayName: 'TP. Ho Chi Minh',
    provinceLookup: 'thanh pho ho chi minh',
    fallback: { provinceId: 1027, wardId: 0, storeId: 2546 },
  },
  { code: 'DNG', displayName: 'Da Nang', provinceLookup: 'thanh pho da nang', fallback: { provinceId: 1020, wardId: 101383, storeId: 14947 } },
  { code: 'CTO', displayName: 'Can Tho', provinceLookup: 'thanh pho can tho', fallback: { provinceId: 1032, wardId: 100097, storeId: 9495 } },
  { code: 'DNI', displayName: 'Dong Nai', provinceLookup: 'tinh dong nai', fallback: { provinceId: 1026, wardId: 100759, storeId: 6363 } },
  { code: 'BNI', displayName: 'Bac Ninh', provinceLookup: 'tinh bac ninh', fallback: { provinceId: 1010, wardId: 102459, storeId: 30216 } },
]

function getEnabledRegionCodes(options: CrawlBhxOptions) {
  const explicit = options.regionCodes?.map(code => code.trim().toUpperCase()).filter(Boolean)
  if (explicit && explicit.length > 0) {
    return explicit
  }

  const envValue = process.env.BHX_ENABLED_REGIONS?.trim()
  if (!envValue) {
    return ['HCM']
  }

  return envValue
    .split(',')
    .map(code => code.trim().toUpperCase())
    .filter(Boolean)
}

function getCategoryTargets(options: CrawlBhxOptions) {
  const explicit = options.categoryUrls?.map(value => value.trim()).filter(Boolean)
  if (!explicit || explicit.length === 0) {
    return BHX_CATEGORY_TARGETS
  }

  const enabled = new Set(explicit)
  return BHX_CATEGORY_TARGETS.filter(target => enabled.has(target.categoryUrl))
}

function getMaxProductsPerCategory(options: CrawlBhxOptions) {
  const value = options.maxProductsPerCategory ?? Number(process.env.BHX_MAX_PRODUCTS_PER_CATEGORY ?? '12')
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 30) : 12
}

function sleep(ms: number) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms))
}

function getBhxApiCredentials() {
  return {
    bearerToken: process.env.BHX_API_BEARER_TOKEN?.trim() ?? '',
    apiKey: process.env.BHX_API_X_API_KEY?.trim() ?? '',
  }
}

export function hasBhxApiCredentials() {
  const credentials = getBhxApiCredentials()
  return credentials.bearerToken.length > 0 && credentials.apiKey.length > 0
}

function hasBhxSessionCredentials(headers: Record<string, string> | null | undefined) {
  if (!headers) {
    return false
  }

  return Boolean(headers.authorization && (headers.xapikey || headers['x-api-key']))
}

export function getBhxLocationAuthSource(headers: Record<string, string> | null | undefined) {
  if (hasBhxApiCredentials()) {
    return 'env'
  }

  if (hasBhxSessionCredentials(headers)) {
    return 'browser_headers'
  }

  return null
}

function buildBhxLocationHeaders(sessionHeaders?: Record<string, string> | null) {
  const credentials = getBhxApiCredentials()
  const authSource = getBhxLocationAuthSource(sessionHeaders)

  if (!authSource) {
    throw new Error('BHX live auth is not configured')
  }

  return {
    accept: 'application/json, text/plain, */*',
    authorization:
      authSource === 'env'
        ? `Bearer ${credentials.bearerToken}`
        : sessionHeaders?.authorization ?? '',
    deviceid: sessionHeaders?.deviceid ?? randomUUID(),
    platform: sessionHeaders?.platform ?? 'webnew',
    reversehost: sessionHeaders?.reversehost ?? 'http://bhxapi.live',
    referer: BHX_HOME_URL,
    'referer-url': BHX_HOME_URL,
    'user-agent': sessionHeaders?.['user-agent'] ?? BHX_USER_AGENT,
    xapikey:
      authSource === 'env'
        ? credentials.apiKey
        : sessionHeaders?.xapikey ?? sessionHeaders?.['x-api-key'] ?? '',
    'customer-id': sessionHeaders?.['customer-id'] ?? '',
  }
}

async function fetchBhxLocations(session?: BhxApiSession | null) {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      const response = await fetch(BHX_LOCATION_API_URL, {
        headers: buildBhxLocationHeaders(session?.headers),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`BHX location request failed with ${response.status}`)
      }

      return (await response.json()) as BhxLocationResponse
    } catch (error) {
      lastError = error
      if (attempt < 3) {
        await sleep(attempt * 500)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to load BHX locations')
}

function toLookupKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0111\u0110]/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

async function resolveBhxRegions(regionCodes: string[], session?: BhxApiSession | null) {
  const seeds = regionCodes
    .map(code => BHX_REGION_SEEDS.find(seed => seed.code === code))
    .filter((seed): seed is BhxRegionSeed => Boolean(seed))
  const resolved: BhxResolvedRegion[] = []
  const resolutionErrors: string[] = []

  try {
    const payload = await fetchBhxLocations(session)
    const provinces = payload.data?.provinces ?? []
    const provinceByName = new Map(
      provinces
        .filter(province => typeof province.name === 'string')
        .map(province => [toLookupKey(province.name ?? ''), province]),
    )

    for (const seed of seeds) {
      const province = provinceByName.get(seed.provinceLookup)
      const ward = province?.wards?.find(candidate => Array.isArray(candidate.storeInfos) && candidate.storeInfos.length > 0)
      const storeId = ward?.storeInfos?.[0]?.id

      if (province?.id && ward?.id && storeId) {
        resolved.push({
          code: seed.code,
          nameVi: seed.displayName,
          provinceId: province.id,
          wardId: ward.id,
          storeId,
        })
        continue
      }

      if (seed.fallback) {
        resolved.push({
          code: seed.code,
          nameVi: seed.displayName,
          provinceId: seed.fallback.provinceId,
          wardId: seed.fallback.wardId,
          storeId: seed.fallback.storeId,
        })
        resolutionErrors.push(`Using fallback location seed for ${seed.code}`)
        continue
      }

      resolutionErrors.push(`Unable to resolve BHX region ${seed.code}`)
    }
  } catch (error) {
    for (const seed of seeds) {
      if (seed.fallback) {
        resolved.push({
          code: seed.code,
          nameVi: seed.displayName,
          provinceId: seed.fallback.provinceId,
          wardId: seed.fallback.wardId,
          storeId: seed.fallback.storeId,
        })
      } else {
        resolutionErrors.push(`Unable to resolve BHX region ${seed.code}: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
    }
  }

  return {
    regions: resolved,
    resolutionErrors,
  }
}

function getQuantityKg(product: BhxApiProduct, priceOption: BhxApiPriceOption) {
  if (typeof priceOption.netUnitValue === 'number' && Number.isFinite(priceOption.netUnitValue) && priceOption.netUnitValue > 0) {
    return priceOption.netUnitValue
  }

  if (foldText(product.unit ?? '') === 'kg') {
    return 1
  }

  const candidates = [product.canonical, product.unit, product.fullName]
  for (const candidate of candidates) {
    const quantity = parseQuantityKgFromText(candidate)
    if (quantity && Number.isFinite(quantity) && quantity > 0) {
      return quantity
    }
  }

  return null
}

function getPricePerKg(product: BhxApiProduct) {
  for (const priceOption of product.productPrices ?? []) {
    const quantityKg = getQuantityKg(product, priceOption)
    if (!quantityKg || !priceOption.price || !Number.isFinite(priceOption.price) || priceOption.price <= 0) {
      continue
    }

    return {
      pricePerKg: roundNumber(priceOption.price / quantityKg),
      quantityKg,
      priceOriginalVnd: priceOption.price,
    }
  }

  return null
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
  return JSON.parse(content) as BhxFixturePayload
}

function toCrawledItem(product: BhxApiProduct, region: BhxResolvedRegion, categoryUrl: string): CrawledPriceItem | null {
  const productName = product.fullName?.trim() || product.name?.trim() || ''
  if (!productName) {
    return null
  }

  const commodity = matchRetailCommodity(productName)
  if (!commodity) {
    return null
  }

  const pricing = getPricePerKg(product)
  if (!pricing) {
    return null
  }

  const productId = product.id
  if (!productId) {
    return null
  }

  const listingUrl = typeof product.url === 'string' && product.url.length > 0 ? `https://www.bachhoaxanh.com${product.url}` : null

  return {
    commodity: commodity.slug,
    commodityName: commodity.commodityName,
    category: commodity.category,
    region: region.nameVi,
    price: pricing.pricePerKg,
    unit: 'VND/kg',
    change: null,
    changePct: null,
    timestamp: new Date().toISOString(),
    source: 'bhx',
    priceType: 'retail',
    marketName: 'Bach Hoa Xanh',
    articleTitle: productName,
    countryCode: 'VNM',
    dedupeKey: `bhx:${region.code}:${productId}:${pricing.quantityKg}`,
    previousPrice: null,
    extra: {
      categoryUrl,
      regionCode: region.code,
      productId,
      productCode: product.productCode ?? null,
      quantityKg: pricing.quantityKg,
      priceOriginalVnd: pricing.priceOriginalVnd,
      brandName: product.brandName ?? null,
      unitRaw: product.unit ?? null,
      canonical: product.canonical ?? null,
      listingUrl,
      sourceFormat: 'browser_request_context',
      provinceId: region.provinceId,
      wardId: region.wardId,
      storeId: region.storeId,
    },
  }
}

function getCoverage(items: CrawledPriceItem[]) {
  const coverage = [...new Set(items.map(item => item.commodity))]
  return coverage.length > 0 ? coverage : BHX_CATEGORY_TARGETS.map(target => target.categoryUrl)
}

export async function crawlBhx(options: CrawlBhxOptions = {}): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString()
  const fixturePath = options.fixturePath ?? null
  const regionCodes = getEnabledRegionCodes(options)
  const categoryTargets = getCategoryTargets(options)
  const maxProductsPerCategory = getMaxProductsPerCategory(options)

  try {
    const fixture = fixturePath ? await loadFixture(fixturePath) : null
    const session = fixture ? null : await launchBhxApiSession()
    const authSource = fixture ? 'fixture' : getBhxLocationAuthSource(session?.headers)
    const resolution = fixture
      ? {
          regions: fixture.regions
            .filter(region => regionCodes.includes(region.code))
            .map(
              region =>
                ({
                  code: region.code,
                  nameVi: region.regionName,
                  provinceId: region.provinceId,
                  wardId: region.wardId,
                  storeId: region.storeId,
                }) satisfies BhxResolvedRegion,
            ),
          resolutionErrors: [] as string[],
        }
      : await resolveBhxRegions(regionCodes, session)

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
          const products = fixtureRegion?.categories?.[category.categoryUrl] ?? []
          items.push(
            ...products
              .slice(0, maxProductsPerCategory)
              .map(product => toCrawledItem(product, region, category.categoryUrl))
              .filter((item): item is CrawledPriceItem => item !== null),
          )
        }
      }
    } else {
      if (!session) {
        throw new Error('BHX browser bootstrap session was not created')
      }

      try {
        for (const region of resolution.regions) {
          for (const category of categoryTargets) {
            try {
              const response = await fetchBhxCategoryProducts(session, region, category.categoryUrl, maxProductsPerCategory)
              const categoryItems = response.products
                .slice(0, maxProductsPerCategory)
                .map(product => toCrawledItem(product as BhxApiProduct, region, category.categoryUrl))
                .filter((item): item is CrawledPriceItem => item !== null)
              items.push(...categoryItems)
            } catch (error) {
              warnings.push(
                `${region.code}/${category.categoryUrl}: ${error instanceof Error ? error.message : 'Unknown browser error'}`,
              )
            }
          }
        }
      } finally {
        await closeBhxApiSession(session)
      }
    }

    return finalizeSourceBatch(
      'bhx',
      'bachhoaxanh.com - Retail',
      BHX_HOME_URL,
      fetchedAt,
      getCoverage(items),
      items,
      BHX_HOME_URL,
      {
        fixturePath,
        sourceMode: fixture ? 'fixture' : 'browser_request_context',
        regionCodes,
        resolvedRegionCodes: resolution.regions.map(region => region.code),
        categoryUrls: categoryTargets.map(target => target.categoryUrl),
        locationAuthSource: authSource,
        maxProductsPerCategory,
        warnings,
      },
    )
  } catch (error) {
    return failedSource(
      'bhx',
      'bachhoaxanh.com - Retail',
      BHX_HOME_URL,
      fetchedAt,
      categoryTargets.map(target => target.categoryUrl),
      error,
      BHX_HOME_URL,
      {
        fixturePath,
        sourceMode: fixturePath ? 'fixture' : 'browser_request_context',
        regionCodes,
        categoryUrls: categoryTargets.map(target => target.categoryUrl),
        maxProductsPerCategory,
      },
    )
  }
}
