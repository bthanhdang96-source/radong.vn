function getApiBaseUrl() {
  const value = process.env.BACKEND_API_BASE_URL || process.env.PRICE_CONTENT_API_BASE_URL || process.env.VITE_API_BASE_URL
  return value ? value.replace(/\/$/, '') : null
}

const DEFAULT_PUBLIC_SITE_ORIGIN = 'https://radongvn.vercel.app'
const SEO_HTML_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' https: data:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "object-src 'none'",
  "form-action 'none'",
  "connect-src 'none'",
].join('; ')

function firstForwardedHeader(value) {
  if (Array.isArray(value)) {
    return firstForwardedHeader(value[0])
  }

  return typeof value === 'string' ? value.split(',')[0]?.trim() : undefined
}

function normalizePublicOrigin(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) {
    return null
  }

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    return url.origin
  } catch {
    return null
  }
}

function hostnameFromHostHeader(host) {
  const trimmed = host.trim().toLowerCase()
  if (trimmed.startsWith('[')) {
    const closingBracketIndex = trimmed.indexOf(']')
    return closingBracketIndex > -1 ? trimmed.slice(1, closingBracketIndex) : trimmed
  }

  return trimmed.split(':')[0] || ''
}

function isLocalHostHeader(host) {
  const hostname = hostnameFromHostHeader(host)
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function getPublicOrigin(req) {
  const configuredOrigin = normalizePublicOrigin(process.env.PUBLIC_SITE_URL)
  if (configuredOrigin) {
    return configuredOrigin
  }

  const host = firstForwardedHeader(req.headers['x-forwarded-host']) || req.headers.host
  if (!host || !isLocalHostHeader(host)) {
    return DEFAULT_PUBLIC_SITE_ORIGIN
  }

  const forwardedProto = firstForwardedHeader(req.headers['x-forwarded-proto'])
  const proto = forwardedProto === 'http' || forwardedProto === 'https' ? forwardedProto : 'http'
  return normalizePublicOrigin(`${proto}://${host}`) || DEFAULT_PUBLIC_SITE_ORIGIN
}

export async function fetchBackendJson(path) {
  const apiBaseUrl = getApiBaseUrl()
  if (!apiBaseUrl) {
    throw new Error('PRICE_CONTENT_API_BASE_URL or VITE_API_BASE_URL is required')
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      accept: 'application/json',
    },
  })
  const json = await response.json()
  if (!response.ok || json.success === false) {
    throw new Error(json.error || `Request failed with ${response.status}`)
  }

  return json
}

export function toAbsoluteUrl(req, path) {
  const origin = getPublicOrigin(req)
  const trimmedPath = String(path || '').trim()
  if (!trimmedPath) {
    return origin
  }

  if (/^[a-z][a-z\d+\-.]*:/i.test(trimmedPath) || trimmedPath.startsWith('//')) {
    return origin
  }

  return `${origin}${trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`}`
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sendXml(res, xml) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.status(200).send(xml)
}

export function setSeoHtmlHeaders(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Content-Security-Policy', SEO_HTML_CONTENT_SECURITY_POLICY)
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}
