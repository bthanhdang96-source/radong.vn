import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

const DEFAULT_STORAGE_STATE_PATH = '.runtime/shopee-storage-state.json'
const DEFAULT_TTL_MINUTES = 360
const DEFAULT_TIMEOUT_MS = 45_000
const SHOPEE_HOME_URL = 'https://shopee.vn/'
const SHOPEE_SEARCH_PAGE_URL = 'https://shopee.vn/search'
const SHOPEE_SEARCH_API_PATH = '/api/v4/search/search_items'

type BrowserBundle = {
  browser: Browser
  context: BrowserContext
  page: Page
}

type ProxySettings = {
  server: string
  username?: string
  password?: string
}

export type ShopeeSessionMetadata = {
  statePath: string
  refreshedAt: string | null
  expiresAt: string | null
  checkedAt: string
  headless: boolean
  status: 'healthy' | 'refresh_failed' | 'blocked' | 'missing'
  keyword: string | null
  sampleCount: number
  responseStatus: number | null
  message: string | null
}

type RefreshShopeeSessionOptions = {
  force?: boolean
  headless?: boolean
  keyword?: string
  manualWaitMs?: number
}

type EnsureShopeeSessionOptions = RefreshShopeeSessionOptions

type FetchPayloadResult<T> = {
  status: number
  bodyText: string
  data: T
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

class ShopeeSessionError extends Error {
  status: number | null
  blocked: boolean

  constructor(message: string, options?: { status?: number | null; blocked?: boolean }) {
    super(message)
    this.name = 'ShopeeSessionError'
    this.status = options?.status ?? null
    this.blocked = options?.blocked ?? false
  }
}

function toAbsolutePath(pathValue: string) {
  if (isAbsolute(pathValue)) {
    return pathValue
  }

  const normalized = pathValue.replace(/\\/g, '/')
  const normalizedCwd = process.cwd().replace(/\\/g, '/').toLowerCase()
  if (normalized.startsWith('server/') && normalizedCwd.endsWith('/server')) {
    return resolve(process.cwd(), normalized.slice('server/'.length))
  }

  return resolve(process.cwd(), pathValue)
}

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (!value) {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') {
    return true
  }

  if (normalized === 'false') {
    return false
  }

  return defaultValue
}

function getProxySettings(): ProxySettings | undefined {
  const server = process.env.SHOPEE_PROXY_SERVER?.trim()
  if (!server) {
    return undefined
  }

  const username = process.env.SHOPEE_PROXY_USERNAME?.trim()
  const password = process.env.SHOPEE_PROXY_PASSWORD?.trim()
  return {
    server,
    username: username || undefined,
    password: password || undefined,
  }
}

export function getShopeeStorageStatePath() {
  return toAbsolutePath(process.env.SHOPEE_STORAGE_STATE_PATH?.trim() || DEFAULT_STORAGE_STATE_PATH)
}

export function getShopeeSessionMetadataPath() {
  return `${getShopeeStorageStatePath()}.meta.json`
}

export function getShopeeSessionTtlMinutes() {
  const configured = Number(process.env.SHOPEE_SESSION_MIN_TTL_MINUTES ?? String(DEFAULT_TTL_MINUTES))
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_TTL_MINUTES
}

export function getShopeeRefreshHeadlessDefault() {
  return parseBoolean(process.env.SHOPEE_REFRESH_HEADLESS, true)
}

export function getShopeeManualWaitMs() {
  const configured = Number(process.env.SHOPEE_REFRESH_MANUAL_WAIT_MS ?? '60000')
  return Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : 60_000
}

async function exists(pathValue: string) {
  try {
    await access(pathValue)
    return true
  } catch {
    return false
  }
}

async function ensureRuntimeDirectory(pathValue: string) {
  await mkdir(dirname(pathValue), { recursive: true })
}

async function writeJsonAtomic(pathValue: string, value: unknown) {
  const tempPath = `${pathValue}.tmp`
  await ensureRuntimeDirectory(pathValue)
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, pathValue)
}

async function writeStorageStateAtomic(context: BrowserContext, pathValue: string) {
  const tempPath = `${pathValue}.tmp`
  await ensureRuntimeDirectory(pathValue)
  await context.storageState({ path: tempPath })
  await rename(tempPath, pathValue)
}

function buildExpiryIso(refreshedAt: string) {
  const expiry = new Date(refreshedAt)
  expiry.setMinutes(expiry.getMinutes() + getShopeeSessionTtlMinutes())
  return expiry.toISOString()
}

function buildMissingMetadata(message: string): ShopeeSessionMetadata {
  return {
    statePath: getShopeeStorageStatePath(),
    refreshedAt: null,
    expiresAt: null,
    checkedAt: new Date().toISOString(),
    headless: getShopeeRefreshHeadlessDefault(),
    status: 'missing',
    keyword: null,
    sampleCount: 0,
    responseStatus: null,
    message,
  }
}

export async function readShopeeSessionMetadata() {
  const metadataPath = getShopeeSessionMetadataPath()
  if (!(await exists(metadataPath))) {
    return buildMissingMetadata('Shopee session metadata not found')
  }

  try {
    const raw = await readFile(metadataPath, 'utf8')
    const parsed = JSON.parse(raw) as ShopeeSessionMetadata
    return {
      ...parsed,
      statePath: parsed.statePath || getShopeeStorageStatePath(),
      checkedAt: new Date().toISOString(),
    }
  } catch (error) {
    return buildMissingMetadata(error instanceof Error ? error.message : 'Unable to read Shopee session metadata')
  }
}

async function getStorageStateStat() {
  try {
    return await stat(getShopeeStorageStatePath())
  } catch {
    return null
  }
}

export async function hasFreshShopeeSession() {
  const metadata = await readShopeeSessionMetadata()
  const storageStateStat = await getStorageStateStat()
  if (!storageStateStat || metadata.status !== 'healthy' || !metadata.expiresAt) {
    return false
  }

  return new Date(metadata.expiresAt).getTime() > Date.now()
}

async function openShopeeBrowserBundle(headless: boolean): Promise<BrowserBundle> {
  const browser = await chromium.launch({
    headless,
    proxy: getProxySettings(),
  })

  const storageStatePath = getShopeeStorageStatePath()
  const context = await browser.newContext({
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    storageState: (await exists(storageStatePath)) ? storageStatePath : undefined,
  })
  const page = await context.newPage()

  page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS)
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS)

  return { browser, context, page }
}

function buildSearchPageUrl(keyword: string, pageNumber: number) {
  const url = new URL(SHOPEE_SEARCH_PAGE_URL)
  url.searchParams.set('keyword', keyword)
  if (pageNumber > 0) {
    url.searchParams.set('page', String(pageNumber))
  }

  return url.toString()
}

async function captureSearchPayload<T>(page: Page, keyword: string, pageNumber: number): Promise<FetchPayloadResult<T>> {
  const expectedNewest = String(pageNumber * 60)
  const responsePromise = page.waitForResponse(response => {
    if (!response.url().includes(SHOPEE_SEARCH_API_PATH)) {
      return false
    }

    const url = new URL(response.url())
    return url.searchParams.get('keyword') === keyword && (url.searchParams.get('newest') ?? '0') === expectedNewest
  })

  await page.goto(buildSearchPageUrl(keyword, pageNumber), {
    waitUntil: 'domcontentloaded',
  })

  if (page.url().includes('/verify/traffic/error')) {
    throw new ShopeeSessionError(`Shopee traffic verification blocked the browser session at ${page.url()}`, {
      blocked: true,
    })
  }

  const response = await responsePromise
  const bodyText = await response.text()
  if (!response.ok()) {
    throw new ShopeeSessionError(`Shopee browser search failed with ${response.status()}: ${bodyText.slice(0, 240)}`, {
      status: response.status(),
      blocked: response.status() === 403,
    })
  }

  const parsed = JSON.parse(bodyText) as Record<string, unknown>
  const errorCode =
    (typeof parsed.error === 'number' ? parsed.error : null) ??
    (typeof parsed['3'] === 'number' ? parsed['3'] : null)
  if (errorCode && errorCode !== 0) {
    throw new ShopeeSessionError(
      `Shopee browser search returned blocked payload error ${errorCode}: ${bodyText.slice(0, 240)}`,
      {
        status: response.status(),
        blocked: true,
      },
    )
  }

  return {
    status: response.status(),
    bodyText,
    data: parsed as T,
  }
}

async function warmHomePage(page: Page) {
  await page.goto(SHOPEE_HOME_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1_500)
}

export async function refreshShopeeSession(options: RefreshShopeeSessionOptions = {}) {
  const statePath = getShopeeStorageStatePath()
  const metadataPath = getShopeeSessionMetadataPath()
  const headless = options.headless ?? getShopeeRefreshHeadlessDefault()
  const keyword = options.keyword?.trim() || 'ca phe robusta'
  const manualWaitMs = options.manualWaitMs ?? getShopeeManualWaitMs()
  let bundle: BrowserBundle | null = null

  try {
    bundle = await openShopeeBrowserBundle(headless)
    await warmHomePage(bundle.page)
    let searchPayload: FetchPayloadResult<{ items?: ShopeeApiItem[] }>
    try {
      searchPayload = await captureSearchPayload<{ items?: ShopeeApiItem[] }>(bundle.page, keyword, 0)
    } catch (error) {
      if (!headless && manualWaitMs > 0) {
        await bundle.page.waitForTimeout(manualWaitMs)
        searchPayload = await captureSearchPayload<{ items?: ShopeeApiItem[] }>(bundle.page, keyword, 0)
      } else {
        throw error
      }
    }

    const sampleCount = searchPayload.data.items?.length ?? 0
    if (sampleCount === 0) {
      throw new ShopeeSessionError('Shopee browser session did not return any items during refresh health-check', {
        status: searchPayload.status,
      })
    }

    const refreshedAt = new Date().toISOString()
    await writeStorageStateAtomic(bundle.context, statePath)
    const metadata: ShopeeSessionMetadata = {
      statePath,
      refreshedAt,
      expiresAt: buildExpiryIso(refreshedAt),
      checkedAt: refreshedAt,
      headless,
      status: 'healthy',
      keyword,
      sampleCount,
      responseStatus: searchPayload.status,
      message: null,
    }
    await writeJsonAtomic(metadataPath, metadata)
    return metadata
  } catch (error) {
    const metadata: ShopeeSessionMetadata = {
      statePath,
      refreshedAt: null,
      expiresAt: null,
      checkedAt: new Date().toISOString(),
      headless,
      status: error instanceof ShopeeSessionError && error.blocked ? 'blocked' : 'refresh_failed',
      keyword,
      sampleCount: 0,
      responseStatus: error instanceof ShopeeSessionError ? error.status : null,
      message: error instanceof Error ? error.message : 'Unknown Shopee refresh error',
    }
    await writeJsonAtomic(metadataPath, metadata)
    throw error
  } finally {
    await bundle?.browser.close()
  }
}

export async function ensureFreshShopeeSession(options: EnsureShopeeSessionOptions = {}) {
  if (!options.force && (await hasFreshShopeeSession())) {
    return readShopeeSessionMetadata()
  }

  return refreshShopeeSession(options)
}

export async function withShopeeBrowserSession<T>(handler: (page: Page) => Promise<T>, options?: { headless?: boolean }) {
  const bundle = await openShopeeBrowserBundle(options?.headless ?? true)
  try {
    return await handler(bundle.page)
  } finally {
    await bundle.browser.close()
  }
}

export async function runShopeeBrowserSearch(keyword: string, maxPages: number) {
  return withShopeeBrowserSession(async page => {
    const items: ShopeeApiItem[] = []

    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      const payload = await captureSearchPayload<{ items?: ShopeeApiItem[] }>(page, keyword, pageNumber)
      const pageItems = payload.data.items ?? []
      if (pageItems.length === 0) {
        break
      }

      items.push(...pageItems)
      await page.waitForTimeout(1_250)
    }

    return items
  })
}

export async function removeShopeeSessionState() {
  const targets = [getShopeeStorageStatePath(), getShopeeSessionMetadataPath()]
  for (const pathValue of targets) {
    await rm(pathValue, { force: true })
  }
}
