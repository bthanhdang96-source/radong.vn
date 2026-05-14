import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLooseDate } from '../services/news/common.js'
import { getNewsSchedulerConfig } from '../services/news/scheduler.js'
import { crawlNewsSource } from '../services/news/service.js'
import type { NewsSourceKey } from '../services/news/types.js'

function withEnv(values: Record<string, string | undefined>, callback: () => void) {
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

test('parseLooseDate supports Vinacas and VASEP date formats', () => {
  const vinacasDate = new Date(parseLooseDate('Ngày đăng: 13-05-2026 14:44:00'))
  const shortDate = new Date(parseLooseDate('(09/5/2026)'))
  const vasepDate = new Date(parseLooseDate('15:12 02/04/2026'))

  assert.equal(vinacasDate.getUTCFullYear(), 2026)
  assert.equal(vinacasDate.getUTCMonth(), 4)
  assert.equal(shortDate.getUTCFullYear(), 2026)
  assert.equal(shortDate.getUTCMonth(), 4)
  assert.equal(vasepDate.getUTCFullYear(), 2026)
  assert.equal(vasepDate.getUTCMonth(), 3)
})

test('getNewsSchedulerConfig includes all active sources by default', () => {
  withEnv(
    {
      NEWS_ENABLED_SOURCES: undefined,
    },
    () => {
      const config = getNewsSchedulerConfig()

      for (const sourceKey of ['congthuong', 'kinhtenongthon', 'vinacas', 'coa'] as NewsSourceKey[]) {
        assert.ok(config.sourceKeys.includes(sourceKey))
      }

      assert.ok(!config.sourceKeys.includes('vasep'))
    },
  )
})

test('crawlNewsSource rejects disabled sources', async () => {
  await assert.rejects(() => crawlNewsSource('vasep'), /Source vasep is disabled/)
})
