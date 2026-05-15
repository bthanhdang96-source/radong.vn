import crypto from 'node:crypto'
import { load } from 'cheerio'
import { retryTransient } from '../transientNetwork.js'
import type { NewsCursorPayload } from './types.js'

const REQUEST_HEADERS = {
  'accept-language': 'vi,en-US;q=0.9,en;q=0.8',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
}

export async function fetchText(url: string) {
  return retryTransient(async () => {
    const response = await fetch(url, { headers: REQUEST_HEADERS })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`)
    }

    return response.text()
  })
}

export function resolveUrl(baseUrl: string, url: string) {
  return new URL(url, baseUrl).toString()
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function stripHtml(html: string) {
  return load(`<div>${html}</div>`)('body').text().replace(/\s+/g, ' ').trim()
}

export function decodeHtmlEntities(value: string) {
  return load(`<span>${value}</span>`)('span').text().trim()
}

export function makeSlug(input: string) {
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || `tin-${crypto.randomUUID().slice(0, 8)}`
}

export function makeFingerprint(parts: Array<string | null | undefined>) {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join('::')).digest('hex')
}

export function normalizeWhitespace(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

export function parseLooseDate(value: string | null | undefined, fallback = new Date().toISOString()) {
  if (!value) {
    return fallback
  }

  const dateFirstMatch = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  const timeFirstMatch = value.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  const normalizedBase = dateFirstMatch
    ? `${dateFirstMatch[3]}-${dateFirstMatch[2].padStart(2, '0')}-${dateFirstMatch[1].padStart(2, '0')}T${(dateFirstMatch[4] ?? '00').padStart(2, '0')}:${dateFirstMatch[5] ?? '00'}:${dateFirstMatch[6] ?? '00'}`
    : timeFirstMatch
      ? `${timeFirstMatch[6]}-${timeFirstMatch[5].padStart(2, '0')}-${timeFirstMatch[4].padStart(2, '0')}T${timeFirstMatch[1].padStart(2, '0')}:${timeFirstMatch[2]}:${timeFirstMatch[3] ?? '00'}`
      : value

  const normalized = normalizedBase
    .replace(/GMT([+-]\d{1,2})/i, 'GMT$1:00')
    .replace(/\bICT\b/i, '+07:00')

  const parsed = new Date(normalized)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString()
  }

  return fallback
}

export function toPlainExcerpt(text: string, maxLength = 220) {
  const normalized = normalizeWhitespace(text)
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

export function encodeCursor(payload: NewsCursorPayload) {
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url')
}

export function decodeCursor(cursor: string | undefined) {
  if (!cursor) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as NewsCursorPayload
  } catch {
    return null
  }
}
