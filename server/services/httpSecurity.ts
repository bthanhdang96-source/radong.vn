import type { Response } from 'express'

export const SEO_HTML_CONTENT_SECURITY_POLICY = [
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

export function setSeoHtmlHeaders(res: Response) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Content-Security-Policy', SEO_HTML_CONTENT_SECURITY_POLICY)
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}
