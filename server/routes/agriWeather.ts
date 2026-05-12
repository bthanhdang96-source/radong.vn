import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import { getWeatherLocation } from '../services/weather/locations.js'
import { getAgriWeather, listAgriWeatherLocations, resolveAgriWeatherLocationCode } from '../services/weather/service.js'

const router = Router()

function parseLocationCode(value: unknown) {
  if (typeof value !== 'string') {
    return resolveAgriWeatherLocationCode(null)
  }

  return resolveAgriWeatherLocationCode(value)
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
