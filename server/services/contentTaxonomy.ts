import type { NewsSourceKey } from './news/types.js'
import type {
  ContentCategoryModule,
  ContentCategorySubgroupLink,
  ContentFamilySlug,
  ContentFamilySummary,
  ContentFeedFilters,
  ContentFeedItem,
  ContentFeedTaxonomy,
  PriceCommodityGroupSlug,
  PriceCommodityGroupSummary,
} from './generatedPricePages/types.js'

type ContentFamilyDefinition = {
  slug: ContentFamilySlug
  label: string
  path: string
  order: number
  badgeLabel: string
}

type PriceCommodityGroupDefinition = {
  slug: PriceCommodityGroupSlug
  label: string
}

type NewsClassificationInput = {
  sourceKey: NewsSourceKey
  category: string | null
  title: string
  excerpt: string | null
  contentText: string | null
  topicTags: string[]
}

const PRICE_FAMILY_SLUG: ContentFamilySlug = 'tin-gia-nong-san'

const CONTENT_FAMILY_DEFINITIONS: ContentFamilyDefinition[] = [
  {
    slug: 'tin-gia-nong-san',
    label: 'Tin giá nông sản',
    path: '/tin-tuc/nhom/tin-gia-nong-san',
    order: 1,
    badgeLabel: 'Tin giá nông sản',
  },
  {
    slug: 'tin-thi-truong-hang-ngay',
    label: 'Tin thị trường hằng ngày',
    path: '/tin-tuc/nhom/tin-thi-truong-hang-ngay',
    order: 2,
    badgeLabel: 'Tin hằng ngày',
  },
  {
    slug: 'xuat-khau-va-doanh-nghiep',
    label: 'Xuất khẩu & doanh nghiệp',
    path: '/tin-tuc/nhom/xuat-khau-va-doanh-nghiep',
    order: 3,
    badgeLabel: 'Xuất khẩu & DN',
  },
  {
    slug: 'chuyen-mon-va-chinh-sach',
    label: 'Chuyên môn & chính sách',
    path: '/tin-tuc/nhom/chuyen-mon-va-chinh-sach',
    order: 4,
    badgeLabel: 'Chuyên môn',
  },
]

const PRICE_COMMODITY_GROUP_DEFINITIONS: PriceCommodityGroupDefinition[] = [
  { slug: 'cay-cong-nghiep', label: 'Cây công nghiệp' },
  { slug: 'luong-thuc', label: 'Lương thực' },
  { slug: 'chan-nuoi', label: 'Chăn nuôi' },
  { slug: 'thuy-san', label: 'Thủy sản' },
  { slug: 'trai-cay', label: 'Trái cây' },
  { slug: 'rau-cu', label: 'Rau củ' },
  { slug: 'khac', label: 'Khác' },
]

const PUBLIC_PRICE_GROUP_SLUGS = PRICE_COMMODITY_GROUP_DEFINITIONS
  .filter(group => group.slug !== 'khac')
  .map(group => group.slug) as Array<Exclude<PriceCommodityGroupSlug, 'khac'>>

const PROFESSIONAL_SOURCE_KEYS = new Set<NewsSourceKey>(['coa'])
const EXPORT_SOURCE_KEYS = new Set<NewsSourceKey>(['congthuong'])

const PROFESSIONAL_SIGNALS = [
  'khuyen nong',
  'ky thuat',
  'quy trinh',
  'chinh sach',
  'quy dinh',
  'tieu chuan',
  'chung nhan',
  'huu co',
  'moi truong',
  'chuyen doi xanh',
]

const EXPORT_SIGNALS = [
  'xuat khau',
  'nhap khau',
  'doanh nghiep',
  'kim ngach',
  'che bien',
  'logistics',
  'cong thuong',
]

function normalizeTaxonomyText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function includesSignal(haystack: string, signals: string[]) {
  return signals.some(signal => haystack.includes(signal))
}

function getContentFamilyDefinition(slug: ContentFamilySlug) {
  return CONTENT_FAMILY_DEFINITIONS.find(family => family.slug === slug) ?? CONTENT_FAMILY_DEFINITIONS[0]
}

function getPriceCommodityGroupDefinition(slug: PriceCommodityGroupSlug) {
  return PRICE_COMMODITY_GROUP_DEFINITIONS.find(group => group.slug === slug) ?? PRICE_COMMODITY_GROUP_DEFINITIONS.at(-1)!
}

function toNormalizedNewsHaystack(input: NewsClassificationInput) {
  return normalizeTaxonomyText(
    [input.category, input.title, input.excerpt, input.contentText, input.topicTags.join(' ')].filter(Boolean).join(' '),
  )
}

function toNormalizedPriceCategory(category: string | null) {
  return normalizeTaxonomyText(category).replace(/\s+/g, ' ')
}

export function isContentFamilySlug(value: string | null | undefined): value is ContentFamilySlug {
  return CONTENT_FAMILY_DEFINITIONS.some(family => family.slug === value)
}

export function isPublicPriceCommodityGroupSlug(
  value: string | null | undefined,
): value is Exclude<PriceCommodityGroupSlug, 'khac'> {
  return PUBLIC_PRICE_GROUP_SLUGS.includes(value as Exclude<PriceCommodityGroupSlug, 'khac'>)
}

export function buildContentFamilyPath(familySlug: ContentFamilySlug) {
  return getContentFamilyDefinition(familySlug).path
}

export function buildPriceGroupPath(priceGroupSlug: Exclude<PriceCommodityGroupSlug, 'khac'>) {
  return `${buildContentFamilyPath(PRICE_FAMILY_SLUG)}/${priceGroupSlug}`
}

export function getContentFamilyMeta(familySlug: ContentFamilySlug) {
  const definition = getContentFamilyDefinition(familySlug)

  return {
    contentFamilySlug: definition.slug,
    contentFamilyLabel: definition.label,
    contentFamilyOrder: definition.order,
    familyPath: definition.path,
    badgeLabel: definition.badgeLabel,
  }
}

export function getPriceCommodityGroupMeta(category: string | null) {
  const normalizedCategory = toNormalizedPriceCategory(category)
  let slug: PriceCommodityGroupSlug = 'khac'

  switch (normalizedCategory) {
  case 'cay cong nghiep':
    slug = 'cay-cong-nghiep'
    break
  case 'luong thuc':
    slug = 'luong-thuc'
    break
  case 'chan nuoi':
    slug = 'chan-nuoi'
    break
  case 'thuy san':
    slug = 'thuy-san'
    break
  case 'trai cay':
    slug = 'trai-cay'
    break
  case 'rau cu':
    slug = 'rau-cu'
    break
  default:
    slug = 'khac'
    break
  }

  const definition = getPriceCommodityGroupDefinition(slug)
  return {
    priceGroupSlug: definition.slug,
    priceGroupLabel: definition.label,
    subcategoryPath: definition.slug === 'khac' ? null : buildPriceGroupPath(definition.slug),
  }
}

export function classifyNewsContentFamily(input: NewsClassificationInput): ContentFamilySlug {
  const haystack = toNormalizedNewsHaystack(input)

  if (PROFESSIONAL_SOURCE_KEYS.has(input.sourceKey) || includesSignal(haystack, PROFESSIONAL_SIGNALS)) {
    return 'chuyen-mon-va-chinh-sach'
  }

  if (EXPORT_SOURCE_KEYS.has(input.sourceKey) || includesSignal(haystack, EXPORT_SIGNALS)) {
    return 'xuat-khau-va-doanh-nghiep'
  }

  return 'tin-thi-truong-hang-ngay'
}

export function getContentItemTimestamp(item: ContentFeedItem) {
  return item.kind === 'news' || item.kind === 'ai_article' ? item.publishedAt : item.updatedAt
}

export function sortContentItems(items: ContentFeedItem[]) {
  return [...items].sort((left, right) => getContentItemTimestamp(right).localeCompare(getContentItemTimestamp(left)))
}

export function filterContentItems(
  items: ContentFeedItem[],
  filters: Pick<ContentFeedFilters, 'family' | 'priceGroup' | 'q'>,
) {
  const query = filters.q?.trim().toLowerCase() ?? ''

  return items.filter(item => {
    if (filters.family && item.contentFamilySlug !== filters.family) {
      return false
    }

    if (filters.priceGroup && item.priceGroupSlug !== filters.priceGroup) {
      return false
    }

    if (!query) {
      return true
    }

    const haystack = [item.title, item.excerpt, item.category, item.contentFamilyLabel, item.topicTags.join(' ')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
}

export function buildContentTaxonomy(items: ContentFeedItem[]): ContentFeedTaxonomy {
  const familyCounts = new Map<ContentFamilySlug, number>()
  const priceGroupCounts = new Map<Exclude<PriceCommodityGroupSlug, 'khac'>, number>()

  for (const family of CONTENT_FAMILY_DEFINITIONS) {
    familyCounts.set(family.slug, 0)
  }

  for (const groupSlug of PUBLIC_PRICE_GROUP_SLUGS) {
    priceGroupCounts.set(groupSlug, 0)
  }

  for (const item of items) {
    familyCounts.set(item.contentFamilySlug, (familyCounts.get(item.contentFamilySlug) ?? 0) + 1)

    if (item.priceGroupSlug && item.priceGroupSlug !== 'khac' && priceGroupCounts.has(item.priceGroupSlug)) {
      priceGroupCounts.set(item.priceGroupSlug, (priceGroupCounts.get(item.priceGroupSlug) ?? 0) + 1)
    }
  }

  const families: ContentFamilySummary[] = CONTENT_FAMILY_DEFINITIONS.map(family => ({
    slug: family.slug,
    label: family.label,
    path: family.path,
    order: family.order,
    itemCount: familyCounts.get(family.slug) ?? 0,
  }))

  const priceGroups: PriceCommodityGroupSummary[] = PUBLIC_PRICE_GROUP_SLUGS.map(groupSlug => {
    const definition = getPriceCommodityGroupDefinition(groupSlug)

    return {
      slug: definition.slug as Exclude<PriceCommodityGroupSlug, 'khac'>,
      label: definition.label,
      path: buildPriceGroupPath(definition.slug as Exclude<PriceCommodityGroupSlug, 'khac'>),
      itemCount: priceGroupCounts.get(groupSlug) ?? 0,
    }
  })

  return { families, priceGroups }
}

export function buildContentModules(
  items: ContentFeedItem[],
  currentFilter: Pick<ContentFeedFilters, 'family' | 'priceGroup'>,
): ContentCategoryModule[] {
  const sortedItems = sortContentItems(items)

  return CONTENT_FAMILY_DEFINITIONS.map(family => {
    const familyItems = sortedItems.filter(item => item.contentFamilySlug === family.slug)
    const subgroups: ContentCategorySubgroupLink[] | undefined =
      family.slug === PRICE_FAMILY_SLUG
        ? PUBLIC_PRICE_GROUP_SLUGS.map(groupSlug => {
          const definition = getPriceCommodityGroupDefinition(groupSlug)
          const itemCount = familyItems.filter(item => item.priceGroupSlug === groupSlug).length

          return {
            slug: groupSlug,
            label: definition.label,
            path: buildPriceGroupPath(groupSlug),
            itemCount,
            isCurrent: currentFilter.family === family.slug && currentFilter.priceGroup === groupSlug,
          }
        })
        : undefined

    return {
      familySlug: family.slug,
      familyLabel: family.label,
      familyPath: family.path,
      itemCount: familyItems.length,
      isCurrent: currentFilter.family === family.slug,
      leadItem: familyItems[0] ?? null,
      secondaryItems: familyItems.slice(1, 5),
      subgroups,
    }
  })
}

export const CONTENT_TAXONOMY = {
  families: CONTENT_FAMILY_DEFINITIONS,
  publicPriceGroups: PUBLIC_PRICE_GROUP_SLUGS.map(groupSlug => getPriceCommodityGroupDefinition(groupSlug)),
}

export const __contentTaxonomyTestUtils = {
  normalizeTaxonomyText,
}
