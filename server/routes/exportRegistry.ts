import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import { sendCachedJson } from '../middleware/publicResponseCache.js'
import { crawlExportRegistry } from '../services/exportRegistry/crawler.js'
import { getExportRegistryCategories, getExportRegistryEntries, syncExportRegistryResultsToSupabase } from '../services/exportRegistry/service.js'
import type { ExportRegistryMapMode } from '../services/exportRegistry/service.js'
import type { ExportRegistryType } from '../services/exportRegistry/types.js'

const router = Router()
const REGISTRY_TYPES: ExportRegistryType[] = ['production_area', 'packing_facility']
const REGISTRY_SORTS = ['updated_desc', 'name_asc', 'province_asc'] as const
const REGISTRY_MAP_MODES: ExportRegistryMapMode[] = ['all', 'page', 'none']

function parseRegistryTypes(value: unknown): ExportRegistryType[] | undefined {
  if (value === 'all' || value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value === 'string' && REGISTRY_TYPES.includes(value as ExportRegistryType)) {
    return [value as ExportRegistryType]
  }

  if (Array.isArray(value)) {
    const parsed = value.filter((item): item is ExportRegistryType => REGISTRY_TYPES.includes(item as ExportRegistryType))
    return parsed.length > 0 ? [...new Set(parsed)] : undefined
  }

  return undefined
}

function parsePositiveInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined
}

function parseMapMode(value: unknown): ExportRegistryMapMode | undefined {
  return typeof value === 'string' && REGISTRY_MAP_MODES.includes(value as ExportRegistryMapMode)
    ? value as ExportRegistryMapMode
    : undefined
}

router.get('/export-registry/categories', async (_req, res) => {
  try {
    const items = await getExportRegistryCategories()
    res.json({ success: true, items })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load export registry categories',
    })
  }
})

router.get('/export-registry/entries', async (req, res) => {
  const type = typeof req.query.type === 'string' && REGISTRY_TYPES.includes(req.query.type as ExportRegistryType)
    ? (req.query.type as ExportRegistryType)
    : undefined

  try {
    await sendCachedJson(req, res, {
      label: 'export-registry-entries',
      ttlSeconds: 180,
      warnAfterMs: 2000,
    }, async () => {
      const payload = await getExportRegistryEntries({
        type,
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        province: typeof req.query.province === 'string' ? req.query.province : undefined,
        market: typeof req.query.market === 'string' ? req.query.market : undefined,
        product: typeof req.query.product === 'string' ? req.query.product : undefined,
        status: req.query.status === 'harvesting' ? 'harvesting' : 'all',
        sort: typeof req.query.sort === 'string' && REGISTRY_SORTS.includes(req.query.sort as typeof REGISTRY_SORTS[number])
          ? req.query.sort as typeof REGISTRY_SORTS[number]
          : undefined,
        page: typeof req.query.page === 'string' ? Number(req.query.page) : undefined,
        limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
        mapMode: parseMapMode(req.query.mapMode) ?? 'page',
      })

      return { success: true, ...payload }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load export registry entries',
    })
  }
})

router.post('/admin/export-registry/crawl', requireAdminApiKey, async (req, res) => {
  try {
    const results = await crawlExportRegistry({
      registryTypes: parseRegistryTypes(req.body?.registryType),
      maxPagesPerType: parsePositiveInteger(req.body?.maxPages),
    })
    const dryRun = req.body?.dryRun === true
    const sync = dryRun ? null : await syncExportRegistryResultsToSupabase(results)

    res.json({
      success: true,
      dryRun,
      sync,
      results: results.map(result => ({
        registryType: result.registryType,
        sourceUrl: result.sourceUrl,
        crawledAt: result.crawledAt,
        pageCount: result.pageCount,
        itemCount: result.items.length,
        errors: result.errors,
      })),
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to crawl export registry',
    })
  }
})

export default router
