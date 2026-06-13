import type { Request, Response } from 'express'

type CacheEntry<T> = {
  payload: T
  cachedAt: number
  expiresAt: number
  staleUntil: number
}

export type CacheBuildResult<T> = {
  payload: T
  cacheable?: boolean
}

export type CacheLookupResult<T> = {
  payload: T
  cacheStatus: 'hit' | 'miss' | 'stale'
  cached: boolean
  shared: boolean
}

export type CacheOptions = {
  ttlMs: number
  staleMs: number
}

export type CachedJsonOptions = {
  label: string
  ttlSeconds: number
  staleSeconds?: number
  warnAfterMs?: number
}

const DEFAULT_STALE_SECONDS = 600
const publicJsonCache = new Map<string, PublicJsonResponseCache<unknown>>()

export class PublicJsonResponseCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>()
  private readonly inFlight = new Map<string, Promise<CacheBuildResult<T>>>()

  constructor(private readonly now: () => number = () => Date.now()) {}

  clear() {
    this.entries.clear()
    this.inFlight.clear()
  }

  get(key: string) {
    const entry = this.entries.get(key)
    if (!entry) {
      return null
    }

    const timestamp = this.now()
    if (entry.expiresAt > timestamp) {
      return { status: 'hit' as const, entry }
    }

    if (entry.staleUntil > timestamp) {
      return { status: 'stale' as const, entry }
    }

    this.entries.delete(key)
    return null
  }

  async getOrCreate(
    key: string,
    options: CacheOptions,
    build: () => Promise<CacheBuildResult<T>>,
  ): Promise<CacheLookupResult<T>> {
    const cached = this.get(key)
    if (cached?.status === 'hit') {
      return {
        payload: cached.entry.payload,
        cacheStatus: 'hit',
        cached: true,
        shared: false,
      }
    }

    const existingBuild = this.inFlight.get(key)
    if (existingBuild) {
      try {
        const result = await existingBuild
        const refreshed = this.get(key)
        return {
          payload: refreshed?.entry.payload ?? result.payload,
          cacheStatus: refreshed?.status === 'hit' ? 'hit' : 'miss',
          cached: refreshed !== null,
          shared: true,
        }
      } catch (error) {
        if (cached?.status === 'stale') {
          return {
            payload: cached.entry.payload,
            cacheStatus: 'stale',
            cached: true,
            shared: true,
          }
        }

        throw error
      }
    }

    const buildPromise = build()
    this.inFlight.set(key, buildPromise)

    try {
      const result = await buildPromise
      if (result.cacheable === false) {
        return {
          payload: result.payload,
          cacheStatus: 'miss',
          cached: false,
          shared: false,
        }
      }

      const timestamp = this.now()
      this.entries.set(key, {
        payload: result.payload,
        cachedAt: timestamp,
        expiresAt: timestamp + options.ttlMs,
        staleUntil: timestamp + options.ttlMs + options.staleMs,
      })

      return {
        payload: result.payload,
        cacheStatus: 'miss',
        cached: true,
        shared: false,
      }
    } catch (error) {
      if (cached?.status === 'stale') {
        return {
          payload: cached.entry.payload,
          cacheStatus: 'stale',
          cached: true,
          shared: false,
        }
      }

      throw error
    } finally {
      this.inFlight.delete(key)
    }
  }
}

function getRouteCache(label: string) {
  const cache = publicJsonCache.get(label)
  if (cache) {
    return cache
  }

  const created = new PublicJsonResponseCache<unknown>()
  publicJsonCache.set(label, created)
  return created
}

function isCacheEligibleRequest(req: Request) {
  return (
    req.method === 'GET' &&
    !req.headers.authorization &&
    !req.headers['x-admin-key'] &&
    !req.headers['x-admin-api-key'] &&
    !req.headers['x-anti-scrape-internal-key']
  )
}

export function getPublicCacheKey(req: Request) {
  const url = new URL(req.originalUrl, 'http://nongsanvn.local')
  const sortedParams = [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyCompare = leftKey.localeCompare(rightKey)
      return keyCompare || leftValue.localeCompare(rightValue)
    })

  const query = new URLSearchParams(sortedParams).toString()
  return `${req.method.toUpperCase()} ${url.pathname}${query ? `?${query}` : ''}`
}

function setCacheHeaders(res: Response, ttlSeconds: number, cacheStatus: CacheLookupResult<unknown>['cacheStatus']) {
  res.setHeader('Cache-Control', `public, max-age=30, s-maxage=${ttlSeconds}, stale-while-revalidate=600`)
  if (cacheStatus === 'stale') {
    res.setHeader('Warning', '110 - "Response is stale"')
  }
}

function setServerTiming(
  res: Response,
  cacheStatus: CacheLookupResult<unknown>['cacheStatus'] | 'skip',
  startedAt: number,
) {
  const totalMs = Math.max(0, Date.now() - startedAt)
  res.setHeader('Server-Timing', `cache;desc="${cacheStatus}", total;dur=${totalMs.toFixed(1)}`)
  return totalMs
}

export async function sendCachedJson<T>(
  req: Request,
  res: Response,
  options: CachedJsonOptions,
  buildPayload: () => Promise<T>,
) {
  const startedAt = Date.now()
  const staleSeconds = options.staleSeconds ?? DEFAULT_STALE_SECONDS

  if (!isCacheEligibleRequest(req)) {
    const payload = await buildPayload()
    const totalMs = setServerTiming(res, 'skip', startedAt)
    if (options.warnAfterMs && totalMs > options.warnAfterMs) {
      console.warn(`[Public API] ${options.label} exceeded ${options.warnAfterMs}ms: ${Math.round(totalMs)}ms cache=skip url=${req.originalUrl}`)
    }
    res.json(payload)
    return
  }

  const cache = getRouteCache(options.label)
  const lookup = await cache.getOrCreate(getPublicCacheKey(req), {
    ttlMs: options.ttlSeconds * 1000,
    staleMs: staleSeconds * 1000,
  }, async () => ({
    payload: await buildPayload(),
  })) as CacheLookupResult<T>

  setCacheHeaders(res, options.ttlSeconds, lookup.cacheStatus)
  const totalMs = setServerTiming(res, lookup.cacheStatus, startedAt)
  if (options.warnAfterMs && totalMs > options.warnAfterMs) {
    console.warn(
      `[Public API] ${options.label} exceeded ${options.warnAfterMs}ms: ${Math.round(totalMs)}ms cache=${lookup.cacheStatus}${lookup.shared ? ':shared' : ''} url=${req.originalUrl}`,
    )
  }

  res.json(lookup.payload)
}
