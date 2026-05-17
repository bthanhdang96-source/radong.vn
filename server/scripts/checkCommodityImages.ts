import '../env.js'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  IMPORTANT_EXACT_COMMODITY_SLUGS,
  getCategoryFallbackImage,
  getCommodityImageCatalog,
} from '../services/generatedPricePages/commodityImageCatalog.js'
import {
  getSupabaseAdminClient,
  getSupabaseRuntimeStatus,
} from '../services/supabaseClient.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const publicRoot = resolve(repoRoot, 'public')
const requiredMultiVariantSlugs = new Set(['heo-hoi', 'ca-phe-robusta', 'gao-noi-dia', 'ho-tieu'])

function toPublicAssetPath(url: string) {
  return resolve(publicRoot, `.${url}`)
}

async function loadPublishedCommoditySlugs() {
  const status = getSupabaseRuntimeStatus()
  if (!status.hasSupabaseAdminConfig) {
    return null
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const slugSources = [
    {
      table: 'generated_price_pages',
      columns: 'commodity_slug, category',
    },
    {
      table: 'generated_commodity_price_pages',
      columns: 'commodity_slug, category',
    },
  ] as const

  const publishedSlugs = new Map<string, string | null>()

  for (const source of slugSources) {
    const { data, error } = await client
      .from(source.table)
      .select(source.columns)
      .eq('status', 'published')

    if (error) {
      throw new Error(`Failed to inspect ${source.table}: ${error.message}`)
    }

    for (const row of data ?? []) {
      const slug = typeof row.commodity_slug === 'string' ? row.commodity_slug.trim() : ''
      const category = typeof row.category === 'string' && row.category.trim().length > 0 ? row.category.trim() : null
      if (slug.length > 0 && !publishedSlugs.has(slug)) {
        publishedSlugs.set(slug, category)
      }
    }
  }

  return publishedSlugs
}

async function main() {
  const catalog = getCommodityImageCatalog()
  const errors: string[] = []

  for (const slug of IMPORTANT_EXACT_COMMODITY_SLUGS) {
    const entry = catalog[slug]
    if (!entry) {
      errors.push(`Missing exact image catalog entry for ${slug}`)
      continue
    }

    if (entry.variants.length === 0) {
      errors.push(`Exact image catalog entry for ${slug} has no variants`)
      continue
    }

    if (requiredMultiVariantSlugs.has(slug) && entry.variants.length < 3) {
      errors.push(`${slug} should have at least 3 curated variants`)
    }

    for (const variant of entry.variants) {
      if (/^https?:\/\//i.test(variant.url)) {
        errors.push(`External URL is not allowed for ${slug}: ${variant.url}`)
      }
      if (!existsSync(toPublicAssetPath(variant.url))) {
        errors.push(`Missing local file for ${slug}: ${variant.url}`)
      }
    }
  }

  for (const [slug, entry] of Object.entries(catalog)) {
    if (entry.variants.length === 0) {
      errors.push(`Catalog entry ${slug} has an empty variant list`)
    }

    for (const variant of entry.variants) {
      if (!existsSync(toPublicAssetPath(variant.url))) {
        errors.push(`Catalog entry ${slug} points to a missing file: ${variant.url}`)
      }
    }
  }

  const publishedSlugs = await loadPublishedCommoditySlugs()
  if (publishedSlugs) {
    for (const [slug, category] of publishedSlugs) {
      const exactEntry = catalog[slug]
      const fallbackCategory = exactEntry?.fallbackCategory ?? category
      const fallbackImage = getCategoryFallbackImage(fallbackCategory)

      if (!exactEntry && !fallbackImage) {
        errors.push(`Published commodity slug ${slug} has no exact image and no category fallback`)
      }
    }
  }

  if (errors.length > 0) {
    for (const message of errors) {
      console.error(`- ${message}`)
    }
    process.exitCode = 1
    return
  }

  const scopeLabel = publishedSlugs ? `${publishedSlugs.size} published slugs checked` : 'local catalog checked'
  console.log(`Commodity image catalog validation passed: ${scopeLabel}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
