import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { createClient } from 'redis'
import { hasValidAdminApiKey } from './adminAuth.js'

export const ANTI_SCRAPE_INTERNAL_HEADER = 'x-anti-scrape-internal-key'

export type AntiScrapeBucket = 'html-detail' | 'json-detail' | 'json-list' | 'bulk'

type WindowLimit = {
  minute: number
  hour: number
}

type CounterResult = {
  count: number
  resetAt: number
}

export type AntiScrapeStore = {
  increment(key: string, windowMs: number): Promise<CounterResult>
}

type AntiScrapeOptions = {
  enabled?: boolean
  store?: AntiScrapeStore
  limits?: Partial<Record<AntiScrapeBucket, WindowLimit>>
  blockedUaPattern?: RegExp | null
  allowedIps?: Set<string>
  blockedIps?: Set<string>
  internalKey?: string
  now?: () => number
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DEFAULT_LIMITS: Record<AntiScrapeBucket, WindowLimit> = {
  'html-detail': { minute: 60, hour: 600 },
  'json-detail': { minute: 40, hour: 400 },
  'json-list': { minute: 20, hour: 200 },
  bulk: { minute: 6, hour: 60 },
}
const DEFAULT_BLOCKED_UA_PATTERN = /\b(curl|wget|python-requests|scrapy|aiohttp|go-http-client|java|libwww-perl)\b/i
const PROTECTED_API_PREFIXES = [
  '/agri-weather',
  '/ai-articles',
  '/coffee',
  '/commodity-price-page-links',
  '/commodity-price-pages',
  '/content',
  '/exchange-rate',
  '/exchange-rates',
  '/export-registry',
  '/freight',
  '/news',
  '/price-page-links',
  '/price-pages',
  '/vn-price-chain',
  '/vn-prices',
  '/world-coffee',
  '/world-prices',
]

type RedisClientType = ReturnType<typeof createClient>

function getConfiguredInternalKey() {
  return process.env.ANTI_SCRAPE_INTERNAL_KEY?.trim() ?? ''
}

function isDisabledByEnv() {
  const value = process.env.ANTI_SCRAPE_ENABLED?.trim().toLowerCase()
  return value === 'false' || value === '0' || value === 'off'
}

function parseCsvSet(value: string | undefined) {
  return new Set(
    (value ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  )
}

function getEnvBlockedUaPattern() {
  const extra = process.env.ANTI_SCRAPE_BLOCKED_UA_REGEX?.trim()
  if (!extra) {
    return DEFAULT_BLOCKED_UA_PATTERN
  }

  try {
    return new RegExp(`${DEFAULT_BLOCKED_UA_PATTERN.source}|(?:${extra})`, 'i')
  } catch (error) {
    console.warn('[AntiScrape] Ignoring invalid ANTI_SCRAPE_BLOCKED_UA_REGEX:', error)
    return DEFAULT_BLOCKED_UA_PATTERN
  }
}

function hashValue(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function safeCompare(left: string, right: string) {
  if (!left || !right) {
    return false
  }

  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function firstHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return firstHeaderValue(value[0])
  }

  return typeof value === 'string' ? value.split(',')[0]?.trim() ?? '' : ''
}

function normalizeIp(value: string | undefined) {
  return (value ?? '').trim().replace(/^::ffff:/, '')
}

function getClientIp(req: Request) {
  return normalizeIp(
    firstHeaderValue(req.headers['cf-connecting-ip']) ||
      firstHeaderValue(req.headers['x-real-ip']) ||
      firstHeaderValue(req.headers['x-forwarded-for']) ||
      req.ip ||
      req.socket.remoteAddress ||
      '',
  )
}

function getPathname(req: Request) {
  return new URL(req.originalUrl || req.url, 'http://nongsanvn.local').pathname
}

function getLimitQuery(req: Request) {
  const raw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit
  const parsed = typeof raw === 'string' ? Number(raw) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function isProtectedApiPath(apiPath: string) {
  return PROTECTED_API_PREFIXES.some(prefix => apiPath === prefix || apiPath.startsWith(`${prefix}/`))
}

function isDetailApiPath(apiPath: string) {
  if (apiPath === '/news/article') {
    return true
  }

  return (
    apiPath.startsWith('/news/articles/') ||
    apiPath.startsWith('/ai-articles/') ||
    apiPath.startsWith('/price-pages/') ||
    apiPath.startsWith('/commodity-price-pages/')
  )
}

function hasBulkSignal(req: Request, apiPath: string) {
  const limit = getLimitQuery(req)
  const mapMode = Array.isArray(req.query.mapMode) ? req.query.mapMode[0] : req.query.mapMode

  return (
    apiPath.endsWith('/history') ||
    apiPath.endsWith('/runs') ||
    apiPath.includes('/sync-runs') ||
    mapMode === 'all' ||
    ((apiPath === '/price-pages' || apiPath === '/commodity-price-pages') && (limit ?? 0) > 400) ||
    (limit ?? 0) > 500
  )
}

export function classifyAntiScrapeBucket(req: Request): AntiScrapeBucket | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return null
  }

  const pathname = getPathname(req)
  if (pathname === '/robots.txt' || pathname === '/api/health') {
    return null
  }

  if (pathname.startsWith('/gia-nong-san/')) {
    return 'html-detail'
  }

  if (!pathname.startsWith('/api/')) {
    return null
  }

  const apiPath = pathname.slice('/api'.length)
  if (!isProtectedApiPath(apiPath)) {
    return null
  }

  if (hasBulkSignal(req, apiPath)) {
    return 'bulk'
  }

  return isDetailApiPath(apiPath) ? 'json-detail' : 'json-list'
}

export function hasValidAntiScrapeInternalKey(req: Request, internalKey = getConfiguredInternalKey()) {
  const provided = req.get(ANTI_SCRAPE_INTERNAL_HEADER)?.trim() ?? ''
  return safeCompare(provided, internalKey)
}

export class MemoryAntiScrapeStore implements AntiScrapeStore {
  private readonly entries = new Map<string, { count: number; resetAt: number }>()

  constructor(private readonly now: () => number = () => Date.now()) {}

  async increment(key: string, windowMs: number): Promise<CounterResult> {
    const timestamp = this.now()
    const windowStart = Math.floor(timestamp / windowMs) * windowMs
    const scopedKey = `${key}:${windowStart}`
    const existing = this.entries.get(scopedKey)
    const resetAt = windowStart + windowMs

    if (existing && existing.resetAt > timestamp) {
      existing.count += 1
      return { count: existing.count, resetAt: existing.resetAt }
    }

    this.cleanup(timestamp)
    this.entries.set(scopedKey, { count: 1, resetAt })
    return { count: 1, resetAt }
  }

  clear() {
    this.entries.clear()
  }

  private cleanup(timestamp: number) {
    for (const [key, value] of this.entries.entries()) {
      if (value.resetAt <= timestamp) {
        this.entries.delete(key)
      }
    }
  }
}

class RedisAntiScrapeStore implements AntiScrapeStore {
  private clientPromise: Promise<RedisClientType> | null = null

  constructor(
    private readonly redisUrl: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async increment(key: string, windowMs: number): Promise<CounterResult> {
    const timestamp = this.now()
    const windowStart = Math.floor(timestamp / windowMs) * windowMs
    const redisKey = `anti-scrape:${key}:${windowStart}`
    const client = await this.getClient()
    const count = await client.incr(redisKey)
    if (count === 1) {
      await client.pExpire(redisKey, windowMs)
    }

    return {
      count,
      resetAt: windowStart + windowMs,
    }
  }

  private async getClient() {
    if (!this.clientPromise) {
      const client = createClient({ url: this.redisUrl })
      client.on('error', error => {
        console.error('[AntiScrape] Redis error:', error)
      })
      this.clientPromise = client.connect().then(() => client)
    }

    return this.clientPromise
  }
}

export function createAntiScrapeStore(now: () => number = () => Date.now()): AntiScrapeStore {
  const redisUrl = process.env.REDIS_URL?.trim()
  return redisUrl ? new RedisAntiScrapeStore(redisUrl, now) : new MemoryAntiScrapeStore(now)
}

function wantsJson(req: Request) {
  const pathname = getPathname(req)
  const accept = req.get('accept') ?? ''
  return pathname.startsWith('/api/') || accept.includes('application/json') || !accept.includes('text/html')
}

function setRateHeaders(
  res: Response,
  bucket: AntiScrapeBucket,
  limit: number,
  count: number,
  resetAt: number,
) {
  res.setHeader('X-RateLimit-Bucket', bucket)
  res.setHeader('X-RateLimit-Limit', String(limit))
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)))
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)))
}

function sendForbidden(req: Request, res: Response, bucket: AntiScrapeBucket, message = 'Forbidden') {
  res.setHeader('X-RateLimit-Bucket', bucket)
  if (wantsJson(req)) {
    res.status(403).json({ success: false, error: message, bucket })
    return
  }

  res.status(403).type('text/html; charset=utf-8').send('<!doctype html><title>Forbidden</title><h1>Forbidden</h1>')
}

function sendTooManyRequests(
  req: Request,
  res: Response,
  bucket: AntiScrapeBucket,
  retryAfterSeconds: number,
) {
  res.setHeader('Retry-After', String(retryAfterSeconds))
  if (wantsJson(req)) {
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      retryAfterSeconds,
      bucket,
    })
    return
  }

  res
    .status(429)
    .type('text/html; charset=utf-8')
    .send('<!doctype html><title>Too many requests</title><h1>Too many requests</h1>')
}

function truncateLogValue(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`
}

function logAntiScrapeEvent(
  req: Request,
  action: 'blocked_ip' | 'blocked_ua' | 'rate_limited',
  bucket: AntiScrapeBucket,
  clientIp: string,
) {
  console.warn(
    `[AntiScrape] action=${action} bucket=${bucket} ipHash=${hashValue(clientIp)} path=${getPathname(req)} ua="${truncateLogValue(req.get('user-agent') ?? '', 120)}" referer="${truncateLogValue(req.get('referer') ?? '', 160)}"`,
  )
}

function getIdentityKey(req: Request, bucket: AntiScrapeBucket, clientIp: string) {
  const userAgent = req.get('user-agent') ?? ''
  return `${bucket}:${hashValue(clientIp)}:${hashValue(userAgent)}`
}

export function createAntiScrapeMiddleware(options: AntiScrapeOptions = {}) {
  const now = options.now ?? (() => Date.now())
  const store = options.store ?? createAntiScrapeStore(now)
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  const blockedUaPattern = options.blockedUaPattern === undefined ? getEnvBlockedUaPattern() : options.blockedUaPattern
  const allowedIps = options.allowedIps ?? parseCsvSet(process.env.ANTI_SCRAPE_ALLOWED_IPS)
  const blockedIps = options.blockedIps ?? parseCsvSet(process.env.ANTI_SCRAPE_BLOCKED_IPS)
  const internalKey = options.internalKey ?? getConfiguredInternalKey()
  const enabled = options.enabled ?? !isDisabledByEnv()

  return async function antiScrapeMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!enabled || hasValidAdminApiKey(req) || hasValidAntiScrapeInternalKey(req, internalKey)) {
      next()
      return
    }

    const bucket = classifyAntiScrapeBucket(req)
    if (!bucket) {
      next()
      return
    }

    const clientIp = getClientIp(req)
    if (allowedIps.has(clientIp)) {
      next()
      return
    }

    if (blockedIps.has(clientIp)) {
      logAntiScrapeEvent(req, 'blocked_ip', bucket, clientIp)
      sendForbidden(req, res, bucket)
      return
    }

    const userAgent = req.get('user-agent') ?? ''
    if (blockedUaPattern?.test(userAgent)) {
      logAntiScrapeEvent(req, 'blocked_ua', bucket, clientIp)
      sendForbidden(req, res, bucket)
      return
    }

    try {
      const identityKey = getIdentityKey(req, bucket, clientIp)
      const bucketLimit = limits[bucket]
      const [minute, hour] = await Promise.all([
        store.increment(`${identityKey}:minute`, MINUTE_MS),
        store.increment(`${identityKey}:hour`, HOUR_MS),
      ])

      if (minute.count > bucketLimit.minute) {
        const retryAfterSeconds = Math.max(1, Math.ceil((minute.resetAt - now()) / 1000))
        setRateHeaders(res, bucket, bucketLimit.minute, minute.count, minute.resetAt)
        logAntiScrapeEvent(req, 'rate_limited', bucket, clientIp)
        sendTooManyRequests(req, res, bucket, retryAfterSeconds)
        return
      }

      if (hour.count > bucketLimit.hour) {
        const retryAfterSeconds = Math.max(1, Math.ceil((hour.resetAt - now()) / 1000))
        setRateHeaders(res, bucket, bucketLimit.hour, hour.count, hour.resetAt)
        logAntiScrapeEvent(req, 'rate_limited', bucket, clientIp)
        sendTooManyRequests(req, res, bucket, retryAfterSeconds)
        return
      }

      setRateHeaders(res, bucket, bucketLimit.minute, minute.count, minute.resetAt)
      next()
    } catch (error) {
      console.warn('[AntiScrape] Limiter failed open:', error)
      next()
    }
  }
}
