import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import { getWeatherLocation } from '../services/weather/locations.js'
import { getAgriWeather, listAgriWeatherHistory, listAgriWeatherLocations, resolveAgriWeatherLocationCode } from '../services/weather/service.js'

const router = Router()

function parseLocationCode(value: unknown) {
  if (typeof value !== 'string') {
    return resolveAgriWeatherLocationCode(null)
  }

  return resolveAgriWeatherLocationCode(value)
}

function parseHistoryLimit(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseHistoryDate(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const normalized = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : false
}

router.get('/agri-weather/locations', (_req, res) => {
  res.json({
    success: true,
    data: listAgriWeatherLocations(),
  })
})

router.get('/agri-weather', async (req, res) => {
  try {
    const locationCode = parseLocationCode(req.query.locationCode)
    if (!getWeatherLocation(locationCode)) {
      res.status(400).json({
        success: false,
        error: `Invalid locationCode "${locationCode}"`,
      })
      return
    }

    const payload = await getAgriWeather(locationCode)
    res.json({
      success: true,
      ...payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load agricultural weather forecast'
    const statusCode = message.startsWith('No weather data available') ? 502 : 500
    console.error('[API] Failed to load agri weather:', error)
    res.status(statusCode).json({
      success: false,
      error: message,
    })
  }
})

router.get('/agri-weather/history', async (req, res) => {
  try {
    const locationCode = parseLocationCode(req.query.locationCode)
    if (!getWeatherLocation(locationCode)) {
      res.status(400).json({
        success: false,
        error: `Invalid locationCode "${locationCode}"`,
      })
      return
    }

    const snapshotDate = parseHistoryDate(req.query.date)
    if (snapshotDate === false) {
      res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD.',
      })
      return
    }

    const history = await listAgriWeatherHistory(locationCode, {
      date: snapshotDate,
      limit: parseHistoryLimit(req.query.limit),
    })

    res.json({
      success: true,
      ...history,
    })
  } catch (error) {
    console.error('[API] Failed to load agri weather history:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load agricultural weather history',
    })
  }
})

router.post('/admin/agri-weather/refresh', requireAdminApiKey, async (req, res) => {
  try {
    const locationCode = parseLocationCode(req.query.locationCode)
    if (!getWeatherLocation(locationCode)) {
      res.status(400).json({
        success: false,
        error: `Invalid locationCode "${locationCode}"`,
      })
      return
    }

    const payload = await getAgriWeather(locationCode, { forceRefresh: true })
    res.json({
      success: true,
      ...payload,
    })
  } catch (error) {
    console.error('[API] Failed to refresh agri weather:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refresh agricultural weather forecast',
    })
  }
})

export default router
