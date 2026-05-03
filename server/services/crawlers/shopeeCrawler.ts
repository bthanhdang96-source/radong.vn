import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { failedSource, finalizeSourceBatch, foldText, roundNumber } from './common.js'
import { ensureFreshShopeeSession, readShopeeSessionMetadata, refreshShopeeSession, runShopeeBrowserSearch } from './shopeeSession.js'
import type { CrawledPriceItem, CrawlerResult } from './types.js'

const SHOPEE_HOME_URL = 'https://shopee.vn/'

type ShopeeTarget = {
  keyword: string
  commoditySlug: string
  commodityName: string
  category: string
}

type ShopeeApiItem = {
  item_basic?: {
    name?: string
    price?: number
    price_min?: number
    price_max?: number
    historical_sold?: number
    shop_location?: string
    itemid?: number
    shopid?: number
    is_ad?: boolean
    item_rating?: {
      rating_star?: number
    }
  }
}

type ShopeeFixturePayload = Record<string, ShopeeApiItem[]>

export type CrawlShopeeOptions = {
  fixturePath?: string | null
  enabledSlugs?: string[] | null
  maxPages?: number
  minSold?: number
  minRating?: number
  forceSessionRefresh?: boolean
}

const SHOPEE_TARGETS: ShopeeTarget[] = [
  {
    keyword: 'ca phe robusta',
    commoditySlug: 'ca-phe-robusta',
    commodityName: 'Ca phe Robusta',
    category: 'Cay cong nghiep',
  },
  {
    keyword: 'gao st25',
    commoditySlug: 'gao-noi-dia',
    commodityName: 'Lua gao DBSCL',
    category: 'Luong thuc',
  },
  {
    keyword: 'ho tieu den',
    commoditySlug: 'ho-tieu',
    commodityName: 'Ho tieu',
    category: 'Cay cong nghiep',
  },
  {
    keyword: 'ca tra phi le',
    commoditySlug: 'ca-tra',
    commodityName: 'Ca tra',
    category: 'Thuy san',
  },
  {
    keyword: 'tom the tuoi',
    commoditySlug: 'shrimp',
    commodityName: 'Tom',
    category: 'Thuy san',
  },
  {
    keyword: 'hat dieu tuoi',
    commoditySlug: 'cashew',
    commodityName: 'Hat dieu',
    category: 'Cay cong nghiep',
  },
]

const SHOPEE_EXCLUDE_KEYWORDS = [
  'say kho',
  'dong lanh',
  'freeze',
  'che bien',
  'dong hop',
  'banh',
  'keo',
  'mut',
  'xi ro',
  'tinh dau',
  'chiet xuat',
  'hat giong',
  'phan bon',
  'thuoc tru sau',
  'giong cay',
  'tra',
  'nuoc ep',
  'sinh to',
  'bot',
  'kem',
  'sua',
  'set qua',
  'hop qua',
  'combo',
  'gio qua',
  'tui 50g',
  'tui 100g',
]

const SHOPEE_PRICE_BOUNDS: Record<string, { min: number; max: number }> = {
  'ca-phe-robusta': { min: 40_000, max: 300_000 },
  'gao-noi-dia': { min: 15_000, max: 60_000 },
  'ho-tieu': { min: 80_000, max: 400_000 },
  cashew: { min: 100_000, max: 500_000 },
  'ca-tra': { min: 50_000, max: 150_000 },
  shrimp: { min: 100_000, max: 800_000 },
}

function getEnabledSlugs(options: CrawlShopeeOptions) {
  const explicit = options.enabledSlugs?.filter(Boolean)
  if (explicit && explicit.length > 0) {
    return new Set(explicit)
  }

  const value = process.env.SHOPEE_ENABLED_SLUGS?.trim()
  if (!value) {
    return new Set(SHOPEE_TARGETS.map(target => target.commoditySlug))
  }

  return new Set(
    value
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean),
  )
}

function getMaxPages(options: CrawlShopeeOptions) {
  const value = options.maxPages ?? Number(process.env.SHOPEE_MAX_PAGES ?? '2')
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 5) : 2
}

function getMinSold(options: CrawlShopeeOptions) {
  const value = options.minSold ?? Number(process.env.SHOPEE_MIN_SOLD ?? '5')
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 5
}

function getMinRating(options: CrawlShopeeOptions) {
  const value = options.minRating ?? Number(process.env.SHOPEE_MIN_RATING ?? '4')
  return Number.isFinite(value) && value >= 0 ? value : 4
}

function priceFromApi(item: ShopeeApiItem['item_basic']) {
  const rawValue = item?.price_min ?? item?.price ?? item?.price_max ?? 0
  return rawValue > 0 ? rawValue / 100_000 : 0
}

function isExcludedName(name: string) {
  const folded = foldText(name)
  return SHOPEE_EXCLUDE_KEYWORDS.some(keyword => folded.includes(keyword))
}

function parseQuantityKg(name: string) {
  const folded = foldText(name)
  const multiKg = folded.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*kg/)
  if (multiKg) {
    return Number(multiKg[1].replace(',', '.')) * Number(multiKg[2].replace(',', '.'))
  }

  const multiGram = folded.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*(g|gr|gram)\b/)
  if (multiGram) {
    return Number(multiGram[1].replace(',', '.')) * Number(multiGram[2].replace(',', '.')) / 1000
  }

  const kgMatch = folded.match(/(\d+(?:[.,]\d+)?)\s*kg\b/)
  if (kgMatch) {
    return Number(kgMatch[1].replace(',', '.'))
  }

  const gramMatch = folded.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|gram)\b/)
  if (gramMatch) {
    return Number(gramMatch[1].replace(',', '.')) / 1000
  }

  if (folded.includes('/kg') || folded.includes('1kg')) {
    return 1
  }

  return null
}

function toPricePerKg(priceVnd: number, name: string) {
  const quantityKg = parseQuantityKg(name)
  if (!quantityKg || !Number.isFinite(quantityKg) || quantityKg <= 0) {
    return null
  }

  return roundNumber(priceVnd / quantityKg)
}

async function fetchShopeeSearch(keyword: string, maxPages: number, forceSessionRefresh = false) {
  try {
    await ensureFreshShopeeSession({
      keyword,
      force: forceSessionRefresh,
    })
    return await runShopeeBrowserSearch(keyword, maxPages)
  } catch (error) {
    if (!forceSessionRefresh) {
      await refreshShopeeSession({
        force: true,
        keyword,
      })
      return runShopeeBrowserSearch(keyword, maxPages)
    }

    throw error
  }
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
  return JSON.parse(content) as ShopeeFixturePayload
}

function toCrawledItem(rawItem: ShopeeApiItem, target: ShopeeTarget, keyword: string, minSold: number, minRating: number): CrawledPriceItem | null {
  const item = rawItem.item_basic
  const name = item?.name?.trim() ?? ''
  if (!name || item?.is_ad) {
    return null
  }

  if (isExcludedName(name)) {
    return null
  }

  const priceVnd = priceFromApi(item)
  if (!Number.isFinite(priceVnd) || priceVnd <= 0) {
    return null
  }

  const soldCount = item?.historical_sold ?? 0
  const rating = item?.item_rating?.rating_star ?? 0
  if (soldCount < minSold) {
    return null
  }

  if (rating > 0 && rating < minRating) {
    return null
  }

  const pricePerKg = toPricePerKg(priceVnd, name)
  if (!pricePerKg) {
    return null
  }

  const bounds = SHOPEE_PRICE_BOUNDS[target.commoditySlug]
  if (bounds && (pricePerKg < bounds.min || pricePerKg > bounds.max)) {
    return null
  }

  const shopId = item?.shopid
  const itemId = item?.itemid
  if (!shopId || !itemId) {
    return null
  }

  const region = item?.shop_location?.trim() || 'Viet Nam'
  const timestamp = new Date().toISOString()

  return {
    commodity: target.commoditySlug,
    commodityName: target.commodityName,
    category: target.category,
    region,
    price: pricePerKg,
    unit: 'VND/kg',
    change: null,
    changePct: null,
    timestamp,
    source: 'shopee',
    priceType: 'retail',
    marketName: region,
    articleTitle: name,
    countryCode: 'VNM',
    dedupeKey: `shopee:${shopId}:${itemId}`,
    previousPrice: null,
    extra: {
      keyword,
      soldCount,
      rating,
      itemId,
      shopId,
      sourceFormat: 'search_api',
      listingUrl: `https://shopee.vn/product/${shopId}/${itemId}`,
      priceOriginalVnd: priceVnd,
      quantityKg: parseQuantityKg(name),
    },
  }
}

function getCoverage(items: CrawledPriceItem[], enabledSlugs: Set<string>) {
  const covered = [...new Set(items.map(item => item.commodity))]
  return covered.length > 0 ? covered : [...enabledSlugs]
}

export async function crawlShopee(options: CrawlShopeeOptions = {}): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString()
  const enabledSlugs = getEnabledSlugs(options)
  const targets = SHOPEE_TARGETS.filter(target => enabledSlugs.has(target.commoditySlug))
  const minSold = getMinSold(options)
  const minRating = getMinRating(options)
  const maxPages = getMaxPages(options)
  const fixturePath = options.fixturePath ?? null
  const forceSessionRefresh = options.forceSessionRefresh ?? false

  try {
    const fixturePayload = fixturePath ? await loadFixture(fixturePath) : null
    const rawByKeyword = new Map<string, ShopeeApiItem[]>()

    for (const target of targets) {
      const rawItems = fixturePayload?.[target.keyword] ?? (await fetchShopeeSearch(target.keyword, maxPages, forceSessionRefresh))
      rawByKeyword.set(target.keyword, rawItems)
    }

    const sessionMetadata = fixturePayload ? null : await readShopeeSessionMetadata()

    const items = targets.flatMap(target =>
      (rawByKeyword.get(target.keyword) ?? [])
        .map(rawItem => toCrawledItem(rawItem, target, target.keyword, minSold, minRating))
        .filter((item): item is CrawledPriceItem => item !== null),
    )

    return finalizeSourceBatch(
      'shopee',
      'shopee.vn - Browser retail',
      SHOPEE_HOME_URL,
      fetchedAt,
      getCoverage(items, enabledSlugs),
      items,
      SHOPEE_HOME_URL,
      {
        fixturePath,
        sourceMode: fixturePath ? 'fixture' : 'browser_live',
        enabledSlugs: [...enabledSlugs],
        minSold,
        minRating,
        maxPages,
        coverageMode: 'listing_search_api',
        sessionStatus: sessionMetadata?.status ?? null,
        sessionRefreshedAt: sessionMetadata?.refreshedAt ?? null,
        sessionExpiresAt: sessionMetadata?.expiresAt ?? null,
      },
    )
  } catch (error) {
    const sessionMetadata = fixturePath ? null : await readShopeeSessionMetadata()
    return failedSource(
      'shopee',
      'shopee.vn - Browser retail',
      SHOPEE_HOME_URL,
      fetchedAt,
      targets.map(target => target.commoditySlug),
      error,
      SHOPEE_HOME_URL,
      {
        fixturePath,
        sourceMode: fixturePath ? 'fixture' : 'browser_live',
        enabledSlugs: [...enabledSlugs],
        minSold,
        minRating,
        maxPages,
        coverageMode: 'listing_search_api',
        blockedReason: error instanceof Error ? error.message : 'Unknown error',
        sessionStatus: sessionMetadata?.status ?? null,
        sessionRefreshedAt: sessionMetadata?.refreshedAt ?? null,
        sessionExpiresAt: sessionMetadata?.expiresAt ?? null,
      },
    )
  }
}
