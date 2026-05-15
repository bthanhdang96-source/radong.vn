import test from 'node:test'
import assert from 'node:assert/strict'
import { retryCrawlerResult } from '../services/crawlers/common.js'
import type { CrawlerResult } from '../services/crawlers/types.js'
import { isTransientNetworkError, retryTransientResult } from '../services/transientNetwork.js'

test('isTransientNetworkError treats HTTP rate-limit and upstream failures as transient', () => {
  assert.equal(isTransientNetworkError(new Error('Request failed with 503')), true)
  assert.equal(isTransientNetworkError(new Error('Failed to fetch https://example.com/feed.xml: 429')), true)
  assert.equal(isTransientNetworkError(new Error('Request failed with 404')), false)
})

test('retryTransientResult retries retryable results until success', async () => {
  let attempts = 0

  const result = await retryTransientResult(
    async () => {
      attempts += 1
      return {
        status: attempts < 3 ? 'failed' : 'success',
      }
    },
    value => value.status === 'failed',
    {
      attempts: 3,
      initialDelayMs: 1,
    },
  )

  assert.equal(attempts, 3)
  assert.equal(result.status, 'success')
})

test('retryCrawlerResult retries transient crawler failures and keeps eventual success', async () => {
  let attempts = 0

  const result = await retryCrawlerResult(
    async (): Promise<CrawlerResult> => {
      attempts += 1
      if (attempts < 3) {
        return {
          items: [],
          sources: [
            {
              id: 'nongnghiep',
              label: 'Test source',
              url: 'https://example.com',
              fetchedAt: new Date().toISOString(),
              success: false,
              itemCount: 0,
              priority: 100,
              coverage: ['test'],
              error: 'Request failed with 503',
            },
          ],
        }
      }

      return {
        items: [],
        sources: [
          {
            id: 'nongnghiep',
            label: 'Test source',
            url: 'https://example.com',
            fetchedAt: new Date().toISOString(),
            success: true,
            itemCount: 1,
            priority: 100,
            coverage: ['test'],
          },
        ],
      }
    },
    {
      attempts: 3,
      initialDelayMs: 1,
    },
  )

  assert.equal(attempts, 3)
  assert.equal(result.sources[0]?.success, true)
})

test('retryCrawlerResult does not retry non-transient crawler failures', async () => {
  let attempts = 0

  const result = await retryCrawlerResult(
    async (): Promise<CrawlerResult> => {
      attempts += 1
      return {
        items: [],
        sources: [
          {
            id: 'nongnghiep',
            label: 'Test source',
            url: 'https://example.com',
            fetchedAt: new Date().toISOString(),
            success: false,
            itemCount: 0,
            priority: 100,
            coverage: ['test'],
            error: 'No rows parsed from latest article',
          },
        ],
      }
    },
    {
      attempts: 3,
      initialDelayMs: 1,
    },
  )

  assert.equal(attempts, 1)
  assert.equal(result.sources[0]?.success, false)
})
