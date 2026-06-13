const DEFAULT_PUBLIC_SITE_ORIGIN = 'https://radongvn.vercel.app'

interface OriginRequest {
  get(name: string): string | undefined
  protocol?: string
}

function firstForwardedHeader(value: string | undefined) {
  return value?.split(',')[0]?.trim()
}

function hostnameFromHostHeader(host: string) {
  const trimmed = host.trim().toLowerCase()
  if (trimmed.startsWith('[')) {
    const closingBracketIndex = trimmed.indexOf(']')
    return closingBracketIndex > -1 ? trimmed.slice(1, closingBracketIndex) : trimmed
  }

  return trimmed.split(':')[0] ?? ''
}

function isLocalHostHeader(host: string) {
  const hostname = hostnameFromHostHeader(host)
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export function normalizePublicOrigin(value: string | null | undefined) {
  const trimmed = value?.trim()
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

export function getPublicOrigin(req?: OriginRequest) {
  const configuredOrigin = normalizePublicOrigin(process.env.PUBLIC_SITE_URL)
  if (configuredOrigin) {
    return configuredOrigin
  }

  const host = firstForwardedHeader(req?.get('x-forwarded-host')) ?? req?.get('host')
  if (!host || !isLocalHostHeader(host)) {
    return DEFAULT_PUBLIC_SITE_ORIGIN
  }

  const forwardedProto = firstForwardedHeader(req?.get('x-forwarded-proto'))
  const protocol = forwardedProto === 'http' || forwardedProto === 'https'
    ? forwardedProto
    : req?.protocol ?? 'http'

  return normalizePublicOrigin(`${protocol}://${host}`) ?? DEFAULT_PUBLIC_SITE_ORIGIN
}

export function toAbsolutePublicUrl(path: string, req?: OriginRequest) {
  const origin = getPublicOrigin(req)
  const trimmedPath = path.trim()
  if (!trimmedPath) {
    return origin
  }

  if (/^[a-z][a-z\d+\-.]*:/i.test(trimmedPath) || trimmedPath.startsWith('//')) {
    return origin
  }

  return `${origin}${trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`}`
}
