import test from 'node:test'
import assert from 'node:assert/strict'
import { getBhxLocationAuthSource } from '../services/crawlers/bhxCrawler.js'
import { getCrawlerScheduleConfig } from '../services/crawlerScheduler.js'

function withEnv(
  values: Record<string, string | undefined>,
  callback: () => void,
) {
  const previous = new Map<string, string | undefined>()

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    callback()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test('getBhxLocationAuthSource falls back to browser headers when env credentials are missing', () => {
  withEnv(
    {
      BHX_API_BEARER_TOKEN: undefined,
      BHX_API_X_API_KEY: undefined,
    },
    () => {
      assert.equal(
        getBhxLocationAuthSource({
          authorization: 'Bearer test-token',
          xapikey: 'bhx-api-test',
        }),
        'browser_headers',
      )
    },
  )
})

test('getCrawlerScheduleConfig keeps BHX enabled when runtime relies on browser bootstrap auth', () => {
  withEnv(
    {
      BHX_CRAWL_ENABLED: 'true',
      BHX_ENABLED_REGIONS: 'HCM,DNG',
      BHX_API_BEARER_TOKEN: undefined,
      BHX_API_X_API_KEY: undefined,
    },
    () => {
      const config = getCrawlerScheduleConfig()
      assert.equal(config.bhxCrawlEnabled, true)
      assert.deepEqual(config.bhxEnabledRegions, ['HCM', 'DNG'])
    },
  )
})
