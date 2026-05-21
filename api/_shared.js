function getApiBaseUrl() {
  const value = process.env.BACKEND_API_BASE_URL || process.env.PRICE_CONTENT_API_BASE_URL || process.env.VITE_API_BASE_URL
  return value ? value.replace(/\/$/, '') : null
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
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}${path}`
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
  res.status(200).send(xml)
}
