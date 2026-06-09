import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PublicJsonResponseCache } from '../middleware/publicResponseCache.js'

describe('PublicJsonResponseCache', () => {
  it('returns hit before TTL expires and miss after refresh', async () => {
    let now = 0
    let buildCount = 0
    const cache = new PublicJsonResponseCache<{ value: number }>(() => now)

    const first = await cache.getOrCreate('GET /api/example', { ttlMs: 100, staleMs: 1000 }, async () => {
      buildCount += 1
      return { payload: { value: buildCount } }
    })
    assert.equal(first.cacheStatus, 'miss')
    assert.equal(first.payload.value, 1)

    now = 99
    const hit = await cache.getOrCreate('GET /api/example', { ttlMs: 100, staleMs: 1000 }, async () => {
      buildCount += 1
      return { payload: { value: buildCount } }
    })
    assert.equal(hit.cacheStatus, 'hit')
    assert.equal(hit.payload.value, 1)

    now = 101
    const refreshed = await cache.getOrCreate('GET /api/example', { ttlMs: 100, staleMs: 1000 }, async () => {
      buildCount += 1
      return { payload: { value: buildCount } }
    })
    assert.equal(refreshed.cacheStatus, 'miss')
    assert.equal(refreshed.payload.value, 2)
    assert.equal(buildCount, 2)
  })

  it('does not store uncacheable responses', async () => {
    let buildCount = 0
    const cache = new PublicJsonResponseCache<{ success: boolean }>()

    await cache.getOrCreate('GET /api/error', { ttlMs: 1000, staleMs: 1000 }, async () => {
      buildCount += 1
      return { payload: { success: false }, cacheable: false }
    })

    await cache.getOrCreate('GET /api/error', { ttlMs: 1000, staleMs: 1000 }, async () => {
      buildCount += 1
      return { payload: { success: false }, cacheable: false }
    })

    assert.equal(buildCount, 2)
  })

  it('shares concurrent same-key builds', async () => {
    let buildCount = 0
    let releaseBuild: () => void = () => undefined
    const cache = new PublicJsonResponseCache<{ value: number }>()

    const first = cache.getOrCreate('GET /api/shared', { ttlMs: 1000, staleMs: 1000 }, async () => {
      buildCount += 1
      await new Promise<void>(resolve => {
        releaseBuild = resolve
      })
      return { payload: { value: buildCount } }
    })

    const second = cache.getOrCreate('GET /api/shared', { ttlMs: 1000, staleMs: 1000 }, async () => {
      buildCount += 1
      return { payload: { value: buildCount } }
    })

    releaseBuild()
    const [firstResult, secondResult] = await Promise.all([first, second])

    assert.equal(buildCount, 1)
    assert.equal(firstResult.payload.value, 1)
    assert.equal(secondResult.payload.value, 1)
    assert.equal(secondResult.shared, true)
  })

  it('falls back to stale payload when refresh fails', async () => {
    let now = 0
    const cache = new PublicJsonResponseCache<{ value: string }>(() => now)

    await cache.getOrCreate('GET /api/stale', { ttlMs: 100, staleMs: 1000 }, async () => ({
      payload: { value: 'old' },
    }))

    now = 101
    const stale = await cache.getOrCreate('GET /api/stale', { ttlMs: 100, staleMs: 1000 }, async () => {
      throw new Error('refresh failed')
    })

    assert.equal(stale.cacheStatus, 'stale')
    assert.equal(stale.payload.value, 'old')
  })
})
