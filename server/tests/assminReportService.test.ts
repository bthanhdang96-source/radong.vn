import test from 'node:test'
import assert from 'node:assert/strict'
import { getWeatherProviderFailureSeverity } from '../services/assminReportService.js'

test('weather provider failures are critical when no provider is usable', () => {
  const severity = getWeatherProviderFailureSeverity(
    { provider: 'open_meteo', error: 'HTTP 429 for https://api.open-meteo.com/v1/forecast' },
    false,
  )

  assert.equal(severity, 'critical')
})

test('optional weather provider failures are warnings when another provider is usable', () => {
  assert.equal(
    getWeatherProviderFailureSeverity(
      { provider: 'weatherapi', error: 'WEATHERAPI_KEY is not configured' },
      true,
    ),
    'warning',
  )

  assert.equal(
    getWeatherProviderFailureSeverity(
      { provider: 'open_meteo', error: 'HTTP 429 for https://api.open-meteo.com/v1/forecast' },
      true,
    ),
    'warning',
  )
})
