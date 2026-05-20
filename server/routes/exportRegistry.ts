import { Router } from 'express'
import { requireAdminApiKey } from '../middleware/adminAuth.js'
import { crawlExportRegistry } from '../services/exportRegistry/crawler.js'
import { getExportRegistryCategories, syncExportRegistryResultsToSupabase } from '../services/exportRegistry/service.js'
import type { ExportRegistryType } from '../services/exportRegistry/types.js'

const router = Router()
const REGISTRY_TYPES: ExportRegistryType[] = ['production_area', 'packing_facility']

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
