import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getVnPriceSourceFreshnessLabel,
  getWeatherProviderFailureSeverity,
} from '../services/assminReportService.js'

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

test('weather provider failures are critical when no provider is usable', () => {
  const severity = getWeatherProviderFailureSeverity(
    { provider: 'open_meteo', error: 'HTTP 429 for https://api.open-meteo.com/v1/forecast' },
    false,
  )

  assert.equal(severity, 'critical')
})

test('optional weather provider failures are informational when another provider is usable', () => {
  assert.equal(
    getWeatherProviderFailureSeverity(
      { provider: 'weatherapi', error: 'WEATHERAPI_KEY is not configured' },
      true,
    ),
    null,
  )

  assert.equal(
    getWeatherProviderFailureSeverity(
      { provider: 'open_meteo', error: 'HTTP 429 for https://api.open-meteo.com/v1/forecast' },
      true,
    ),
    null,
  )
})

test('customs source freshness follows its weekly crawl cadence', () => {
  assert.equal(getVnPriceSourceFreshnessLabel('customs', isoDaysAgo(4)), 'aging')
  assert.equal(getVnPriceSourceFreshnessLabel('customs', isoDaysAgo(10)), 'stale')
  assert.equal(getVnPriceSourceFreshnessLabel('bhx', isoDaysAgo(4)), 'stale')
})
