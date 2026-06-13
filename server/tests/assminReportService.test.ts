import test from 'node:test'
import assert from 'node:assert/strict'
import type { AssminReportResponse } from '../services/assminReportTypes.js'
import {
  getVnPriceSourceFreshnessLabel,
  getWeatherProviderFailureSeverity,
  summarizeAssminReport,
  toPublicAssminReport,
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

test('public assmin report redacts runtime, row details, and warning messages', () => {
  const report: AssminReportResponse = {
    generatedAt: '2026-06-13T00:00:00.000Z',
    overallStatus: 'critical',
    summary: {
      ok: 0,
      warning: 0,
      critical: 0,
      unknown: 0,
      sources: 0,
      jobs: 0,
      warnings: 0,
    },
    runtime: {
      hasSupabaseReadConfig: true,
      hasSupabaseAdminConfig: true,
      missingServiceRole: false,
    },
    sources: [
      {
        key: 'source-ok',
        label: 'Source OK',
        group: 'news',
        kind: 'feed',
        status: 'ok',
        freshnessLabel: 'fresh',
        lastUpdated: '2026-06-13T00:00:00.000Z',
        checkedAt: '2026-06-13T00:00:00.000Z',
        sourceUrl: 'https://internal.example/source-ok',
        details: ['private detail'],
        warnings: [],
      },
      {
        key: 'source-warning',
        label: 'Source Warning',
        group: 'vn_prices',
        kind: 'crawler',
        status: 'warning',
        freshnessLabel: 'aging',
        lastUpdated: null,
        checkedAt: null,
        sourceUrl: 'https://internal.example/source-warning',
        details: ['private warning detail'],
        warnings: [{ code: 'source_warning', severity: 'warning', message: 'private source warning' }],
      },
    ],
    jobs: [
      {
        key: 'job-critical',
        label: 'Job Critical',
        group: 'scheduler',
        status: 'critical',
        enabled: true,
        cron: '* * * * *',
        lastUpdated: null,
        details: ['private cron detail'],
        warnings: [{ code: 'job_critical', severity: 'critical', message: 'private job warning' }],
      },
      {
        key: 'job-unknown',
        label: 'Job Unknown',
        group: 'dataset',
        status: 'unknown',
        enabled: true,
        cron: null,
        lastUpdated: null,
        details: [],
        warnings: [],
      },
    ],
    warnings: [{ code: 'global_warning', severity: 'critical', message: 'private global warning' }],
  }

  report.summary = summarizeAssminReport(report)
  const publicReport = toPublicAssminReport(report)

  assert.deepEqual(publicReport.summary, {
    ok: 1,
    warning: 1,
    critical: 1,
    unknown: 1,
    sources: 2,
    jobs: 2,
    warnings: 1,
  })
  assert.equal(Object.hasOwn(publicReport, 'runtime'), false)
  assert.equal(Object.hasOwn(publicReport, 'sources'), false)
  assert.equal(Object.hasOwn(publicReport, 'jobs'), false)
  assert.equal(Object.hasOwn(publicReport, 'warnings'), false)
})
