import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

function getConfiguredAdminApiKey() {
  return process.env.ADMIN_API_KEY?.trim() ?? ''
}

function getProvidedAdminApiKey(req: Request) {
  const authorization = req.get('authorization')
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim()
  }

  return req.get('x-admin-key')?.trim() ?? ''
}

function matchesAdminApiKey(provided: string, configured: string) {
  if (!provided || !configured) {
    return false
  }

  const providedBuffer = Buffer.from(provided)
  const configuredBuffer = Buffer.from(configured)
  if (providedBuffer.length !== configuredBuffer.length) {
    return false
  }

  return timingSafeEqual(providedBuffer, configuredBuffer)
}

export function hasAdminApiKeyConfigured() {
  return getConfiguredAdminApiKey().length > 0
}

export function hasValidAdminApiKey(req: Request) {
  return matchesAdminApiKey(getProvidedAdminApiKey(req), getConfiguredAdminApiKey())
}

export function requireAdminApiKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = getConfiguredAdminApiKey()
  if (!configuredKey) {
    res.status(503).json({
      success: false,
      error: 'Admin API access is not configured on this server',
    })
    return
  }

  if (!matchesAdminApiKey(getProvidedAdminApiKey(req), configuredKey)) {
    res.status(401).json({
      success: false,
      error: 'Admin API key is required',
    })
    return
  }

  next()
}
