import { chromium, type Browser, type BrowserContext } from 'playwright'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { retryTransient } from '../transientNetwork.js'

export type BhxResolvedRegion = {
  code: string
  nameVi: string
  provinceId: number
  wardId: number
  storeId: number
}

export type BhxApiSession = {
  browser: Browser
  context: BrowserContext
  headers: Record<string, string>
}

type BhxCategoryResponse = {
  products: Record<string, unknown>[]
  requestUrl: string
}

type BhxCategoryPayload = {
  code?: number
  data?: {
    products?: Record<string, unknown>[]
  }
}

const BHX_SITE_URL = 'https://www.bachhoaxanh.com'
const BHX_BOOTSTRAP_CATEGORY_URL = 'trai-cay-tuoi-ngon'
const BHX_CATEGORY_TIMEOUT_MS = 30_000
const BHX_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
const PLAYWRIGHT_INSTALL_TIMEOUT_MS = 6 * 60 * 1000

let playwrightInstallAttempted = false
let playwrightInstallPromise: Promise<boolean> | null = null

function getBootstrapPageUrl() {
  return `${BHX_SITE_URL}/${BHX_BOOTSTRAP_CATEGORY_URL}`
}

function buildCategoryRequestUrl(region: BhxResolvedRegion, categoryUrl: string, pageSize: number) {
  const url = new URL('https://api.bachhoaxanh.com/gw/Category/V2/GetCate')
  url.searchParams.set('provinceId', String(region.provinceId))
  url.searchParams.set('wardId', String(region.wardId))
  url.searchParams.set('districtId', '0')
  url.searchParams.set('storeId', String(region.storeId))
  url.searchParams.set('categoryUrl', categoryUrl)
  url.searchParams.set('isMobile', 'true')
  url.searchParams.set('isV2', 'true')
  url.searchParams.set('pageSize', String(pageSize))
  return url.toString()
}

function buildRequestHeaders(baseHeaders: Record<string, string>, categoryUrl: string) {
  return {
    ...baseHeaders,
    accept: 'application/json, text/plain, */*',
    referer: `${BHX_SITE_URL}/${categoryUrl}`,
    'referer-url': `${BHX_SITE_URL}/${categoryUrl}`,
    'user-agent': BHX_USER_AGENT,
  }
}

function isUnauthorizedPayload(payload: unknown) {
  return typeof payload === 'string' && payload.toLowerCase().includes('unauthorized client')
}

function isMissingPlaywrightBrowserError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes('browsertype.launch') && message.includes("executable doesn't exist")
}

function resolvePlaywrightInstallCwd() {
  const cwd = process.cwd()
  if (existsSync(join(cwd, 'package.json'))) {
    return cwd
  }

  const serverDir = join(cwd, 'server')
  if (existsSync(join(serverDir, 'package.json'))) {
    return serverDir
  }

  return cwd
}

async function installPlaywrightChromium() {
  if (playwrightInstallPromise) {
    return playwrightInstallPromise
  }

  if (playwrightInstallAttempted) {
    return false
  }

  playwrightInstallAttempted = true
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const args = ['playwright', 'install', 'chromium']
  const cwd = resolvePlaywrightInstallCwd()

  playwrightInstallPromise = new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
    }, PLAYWRIGHT_INSTALL_TIMEOUT_MS)

    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })

    child.on('error', () => {
      clearTimeout(timeout)
      resolve(false)
    })

    child.on('close', code => {
      clearTimeout(timeout)
      const ok = code === 0
      if (!ok) {
        const tail = `${stdout}\n${stderr}`.trim().split('\n').slice(-8).join('\n')
        console.error('[BHX Browser] Playwright Chromium install failed:', tail || `exit code ${code ?? 'unknown'}`)
      } else {
        console.log('[BHX Browser] Playwright Chromium installed successfully')
      }
      resolve(ok)
    })
  }).finally(() => {
    playwrightInstallPromise = null
  })

  return playwrightInstallPromise
}

async function bootstrapBhxHeaders(context: BrowserContext) {
  const page = await context.newPage()
  const headersPromise = new Promise<Record<string, string>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for BHX API request headers')), 45_000)
    const handler = (request: import('playwright').Request) => {
      const requestUrl = request.url()
      if (!requestUrl.startsWith('https://api.bachhoaxanh.com/gw/')) {
        return
      }

      const headers = request.headers()
      const hasAuthorization = typeof headers.authorization === 'string' && headers.authorization.length > 0
      const hasApiKey = typeof headers.xapikey === 'string' && headers.xapikey.length > 0
        || typeof headers['x-api-key'] === 'string' && headers['x-api-key'].length > 0

      if (!hasAuthorization || !hasApiKey) {
        return
      }

      clearTimeout(timeout)
      page.off('request', handler)
      resolve(headers)
    }

    page.on('request', handler)
  })

  try {
    await page.goto(getBootstrapPageUrl(), {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    return await headersPromise
  } finally {
    if (!page.isClosed()) {
      await page.close().catch(() => undefined)
    }
  }
}

export async function launchBhxApiSession(): Promise<BhxApiSession> {
  try {
    const browser = await chromium.launch({
      headless: true,
    })
    const context = await browser.newContext({
      userAgent: BHX_USER_AGENT,
    })

    try {
      const headers = await bootstrapBhxHeaders(context)
      return {
        browser,
        context,
        headers,
      }
    } catch (error) {
      await context.close().catch(() => undefined)
      await browser.close().catch(() => undefined)
      throw error
    }
  } catch (error) {
    if (isMissingPlaywrightBrowserError(error) && await installPlaywrightChromium()) {
      const browser = await chromium.launch({
        headless: true,
      })
      const context = await browser.newContext({
        userAgent: BHX_USER_AGENT,
      })

      try {
        const headers = await bootstrapBhxHeaders(context)
        return {
          browser,
          context,
          headers,
        }
      } catch (retryError) {
        await context.close().catch(() => undefined)
        await browser.close().catch(() => undefined)
        throw retryError
      }
    }

    throw error
  }
}

export async function closeBhxApiSession(session: BhxApiSession | null | undefined) {
  if (!session) {
    return
  }

  await session.context.close().catch(() => undefined)
  await session.browser.close().catch(() => undefined)
}

export async function fetchBhxCategoryProducts(
  session: BhxApiSession,
  region: BhxResolvedRegion,
  categoryUrl: string,
  pageSize = 12,
): Promise<BhxCategoryResponse> {
  const requestUrl = buildCategoryRequestUrl(region, categoryUrl, pageSize)

  return retryTransient(async () => {
    const response = await session.context.request.get(requestUrl, {
      headers: buildRequestHeaders(session.headers, categoryUrl),
      timeout: BHX_CATEGORY_TIMEOUT_MS,
    })

    const bodyText = await response.text()
    if (!response.ok()) {
      throw new Error(`BHX category request failed with ${response.status()} for ${categoryUrl}`)
    }

    if (isUnauthorizedPayload(bodyText)) {
      throw new Error(`BHX category request returned unauthorized payload for ${categoryUrl}`)
    }

    const payload = JSON.parse(bodyText) as BhxCategoryPayload
    return {
      products: Array.isArray(payload?.data?.products) ? payload.data.products : [],
      requestUrl,
    }
  })
}
