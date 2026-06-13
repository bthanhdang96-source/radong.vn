import type { ContentFamilySlug, PriceCommodityGroupSlug } from './contentFeedTypes'

type FamilyDefinition = {
  slug: ContentFamilySlug
  label: string
  path: string
}

type PriceGroupDefinition = {
  slug: Exclude<PriceCommodityGroupSlug, 'khac'>
  label: string
  path: string
}

export const CONTENT_FAMILY_DEFINITIONS: FamilyDefinition[] = [
  {
    slug: 'tin-gia-nong-san',
    label: 'Giá nông sản trong nước',
    path: '/tin-tuc/nhom/tin-gia-nong-san',
  },
  {
    slug: 'gia-nong-san-the-gioi',
    label: 'Giá nông sản thế giới',
    path: '/tin-tuc/nhom/gia-nong-san-the-gioi',
  },
  {
    slug: 'tin-thi-truong-hang-ngay',
    label: 'Tin thị trường hằng ngày',
    path: '/tin-tuc/nhom/tin-thi-truong-hang-ngay',
  },
  {
    slug: 'xuat-khau-va-doanh-nghiep',
    label: 'Xuất khẩu & doanh nghiệp',
    path: '/tin-tuc/nhom/xuat-khau-va-doanh-nghiep',
  },
  {
    slug: 'chuyen-mon-va-chinh-sach',
    label: 'Chuyên môn & chính sách',
    path: '/tin-tuc/nhom/chuyen-mon-va-chinh-sach',
  },
  {
    slug: 'blog-nong-nghiep',
    label: 'Blog nÃ´ng nghiá»‡p',
    path: '/tin-tuc/nhom/blog-nong-nghiep',
  },
]

export const PRICE_GROUP_DEFINITIONS: PriceGroupDefinition[] = [
  {
    slug: 'cay-cong-nghiep',
    label: 'Cây công nghiệp',
    path: '/tin-tuc/nhom/tin-gia-nong-san/cay-cong-nghiep',
  },
  {
    slug: 'luong-thuc',
    label: 'Lương thực',
    path: '/tin-tuc/nhom/tin-gia-nong-san/luong-thuc',
  },
  {
    slug: 'chan-nuoi',
    label: 'Chăn nuôi',
    path: '/tin-tuc/nhom/tin-gia-nong-san/chan-nuoi',
  },
  {
    slug: 'thuy-san',
    label: 'Thủy sản',
    path: '/tin-tuc/nhom/tin-gia-nong-san/thuy-san',
  },
  {
    slug: 'trai-cay',
    label: 'Trái cây',
    path: '/tin-tuc/nhom/tin-gia-nong-san/trai-cay',
  },
  {
    slug: 'rau-cu',
    label: 'Rau củ',
    path: '/tin-tuc/nhom/tin-gia-nong-san/rau-cu',
  },
]

export function isContentFamilyRouteSlug(value: string | undefined): value is ContentFamilySlug {
  return CONTENT_FAMILY_DEFINITIONS.some(item => item.slug === value)
}

export function isPriceGroupRouteSlug(value: string | undefined): value is Exclude<PriceCommodityGroupSlug, 'khac'> {
  return PRICE_GROUP_DEFINITIONS.some(item => item.slug === value)
}

export function buildContentFamilyPath(familySlug: ContentFamilySlug) {
  return CONTENT_FAMILY_DEFINITIONS.find(item => item.slug === familySlug)?.path ?? '/'
}

export function buildPriceGroupPath(priceGroupSlug: Exclude<PriceCommodityGroupSlug, 'khac'>) {
  return PRICE_GROUP_DEFINITIONS.find(item => item.slug === priceGroupSlug)?.path ?? buildContentFamilyPath('tin-gia-nong-san')
}

export function getFamilyLabel(familySlug: ContentFamilySlug | null | undefined) {
  return familySlug ? CONTENT_FAMILY_DEFINITIONS.find(item => item.slug === familySlug)?.label ?? 'Tin tức' : 'Tin tức'
}
