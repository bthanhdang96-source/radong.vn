import { chromium, type Browser } from 'playwright'

export type BhxResolvedRegion = {
  code: string
  nameVi: string
  provinceId: number
  wardId: number
  storeId: number
}

type BhxCategoryResponse = {
  products: Record<string, unknown>[]
  requestUrl: string
}

const BHX_SITE_URL = 'https://www.bachhoaxanh.com'
const BHX_CATEGORY_TIMEOUT_MS = 45_000
const BHX_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

function rewriteCategoryRequestUrl(requestUrl: string, region: BhxResolvedRegion, categoryUrl: string, pageSize: number) {
  const url = new URL(requestUrl)
  url.searchParams.set('provinceId', String(region.provinceId))
  url.searchParams.set('ProvinceId', String(region.provinceId))
  url.searchParams.set('wardId', String(region.wardId))
  url.searchParams.set('WardId', String(region.wardId))
  url.searchParams.set('districtId', '0')
  url.searchParams.set('DistrictId', '0')
  url.searchParams.set('storeId', String(region.storeId))
  url.searchParams.set('StoreId', String(region.storeId))
  url.searchParams.set('categoryUrl', categoryUrl)
  url.searchParams.set('pageSize', String(pageSize))
  url.searchParams.set('isMobile', 'true')
  url.searchParams.set('isV2', 'true')
  return url.toString()
}

export async function launchBhxBrowser() {
  return chromium.launch({
    headless: true,
  })
}

export async function closeBhxBrowser(browser: Browser | null | undefined) {
  if (browser) {
    await browser.close()
  }
}

export async function captureBhxCategoryProducts(
  browser: Browser,
  region: BhxResolvedRegion,
  categoryUrl: string,
  pageSize = 12,
): Promise<BhxCategoryResponse> {
  const page = await browser.newPage({
    userAgent: BHX_USER_AGENT,
  })

  try {
    await page.route('**/gw/Category/V2/GetCate?*', async route => {
      const headers = route.request().headers()
      await route.continue({
        url: rewriteCategoryRequestUrl(route.request().url(), region, categoryUrl, pageSize),
        headers: {
          ...headers,
          referer: `${BHX_SITE_URL}/${categoryUrl}`,
          'referer-url': `${BHX_SITE_URL}/${categoryUrl}`,
        },
      })
    })

    const responsePromise = page.waitForResponse(
      response => response.url().includes('/gw/Category/V2/GetCate?') && response.status() === 200,
      { timeout: BHX_CATEGORY_TIMEOUT_MS },
    )

    await page.goto(`${BHX_SITE_URL}/${categoryUrl}`, {
      waitUntil: 'domcontentloaded',
      timeout: BHX_CATEGORY_TIMEOUT_MS,
    })

    const response = await responsePromise
    const payload = (await response.json()) as {
      data?: {
        products?: Record<string, unknown>[]
      }
    }

    return {
      products: Array.isArray(payload?.data?.products) ? payload.data.products : [],
      requestUrl: response.url(),
    }
  } finally {
    await page.close()
  }
}
