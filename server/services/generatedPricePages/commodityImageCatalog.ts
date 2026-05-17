export type CommodityImageVariant = {
  url: string
  altBase: string
  tags?: string[]
  subject: 'exact' | 'fallback'
  orientation?: 'landscape'
}

export type CommodityImageCatalogEntry = {
  slug: string
  displayName: string
  variants: CommodityImageVariant[]
  fallbackCategory?: string | null
}

export type ResolvedCommodityImage = {
  url: string
  alt: string
  variantIndex: number
  source: 'commodity' | 'category_fallback' | 'default_fallback'
}

const DEFAULT_COMMODITY_IMAGE: CommodityImageVariant = {
  url: '/images/commodities/_fallback/default-farm.jpg',
  altBase: 'Khung cảnh sản xuất nông nghiệp',
  subject: 'fallback',
  orientation: 'landscape',
}

const CATEGORY_FALLBACKS: Record<string, CommodityImageVariant> = {
  'Cây công nghiệp': {
    url: '/images/commodities/ca-phe-robusta/coffee-berries-01.jpg',
    altBase: 'Cây công nghiệp trong giai đoạn thu hoạch',
    subject: 'fallback',
    orientation: 'landscape',
  },
  'Lương thực': {
    url: '/images/commodities/gao-noi-dia/rice-grains-01.jpg',
    altBase: 'Gạo hàng hóa tại khu vực buôn bán',
    subject: 'fallback',
    orientation: 'landscape',
  },
  'Trái cây': {
    url: '/images/commodities/buoi-nam-roi/pomelo-01.jpg',
    altBase: 'Trái cây thương phẩm sau thu hoạch',
    subject: 'fallback',
    orientation: 'landscape',
  },
  'Rau củ': {
    url: '/images/commodities/toi/garlic-01.jpg',
    altBase: 'Rau củ thương phẩm sau sơ chế',
    subject: 'fallback',
    orientation: 'landscape',
  },
  'Thủy sản': {
    url: '/images/commodities/ca-tra/pangasius-01.jpg',
    altBase: 'Thủy sản thương phẩm',
    subject: 'fallback',
    orientation: 'landscape',
  },
  'Chăn nuôi': {
    url: '/images/commodities/heo-hoi/adult-pig-farm-01.jpg',
    altBase: 'Vật nuôi thương phẩm tại trang trại',
    subject: 'fallback',
    orientation: 'landscape',
  },
}

const COMMODITY_IMAGE_CATALOG: Record<string, CommodityImageCatalogEntry> = {
  'buoi-nam-roi': {
    slug: 'buoi-nam-roi',
    displayName: 'Bưởi Năm Roi',
    fallbackCategory: 'Trái cây',
    variants: [
      {
        url: '/images/commodities/buoi-nam-roi/pomelo-01.jpg',
        altBase: 'Bưởi thương phẩm',
        subject: 'exact',
        orientation: 'landscape',
      },
    ],
  },
  'ca-phe-robusta': {
    slug: 'ca-phe-robusta',
    displayName: 'Cà phê Robusta',
    fallbackCategory: 'Cây công nghiệp',
    variants: [
      {
        url: '/images/commodities/ca-phe-robusta/coffee-berries-01.jpg',
        altBase: 'Quả cà phê Robusta trên cây',
        subject: 'exact',
        orientation: 'landscape',
      },
      {
        url: '/images/commodities/ca-phe-robusta/coffee-berries-02.jpg',
        altBase: 'Vườn cà phê Robusta đang có quả chín',
        subject: 'exact',
        orientation: 'landscape',
      },
      {
        url: '/images/commodities/ca-phe-robusta/coffee-berries-03.jpg',
        altBase: 'Chùm quả cà phê Robusta thương phẩm',
        subject: 'exact',
        orientation: 'landscape',
      },
    ],
  },
  'ca-tra': {
    slug: 'ca-tra',
    displayName: 'Cá tra',
    fallbackCategory: 'Thủy sản',
    variants: [
      {
        url: '/images/commodities/ca-tra/pangasius-01.jpg',
        altBase: 'Cá tra thương phẩm',
        subject: 'exact',
        orientation: 'landscape',
      },
    ],
  },
  'cam-sanh': {
    slug: 'cam-sanh',
    displayName: 'Cam sành',
    fallbackCategory: 'Trái cây',
    variants: [
      {
        url: '/images/commodities/cam-sanh/cam-sanh-01.jpg',
        altBase: 'Cam sành thương phẩm',
        subject: 'exact',
        orientation: 'landscape',
      },
    ],
  },
  cocoa: {
    slug: 'cocoa',
    displayName: 'Ca cao',
    fallbackCategory: 'Cây công nghiệp',
    variants: [
      {
        url: '/images/commodities/cocoa/cacao-pod-01.jpg',
        altBase: 'Quả ca cao trên cây',
        subject: 'exact',
        orientation: 'landscape',
      },
    ],
  },
  'gao-noi-dia': {
    slug: 'gao-noi-dia',
    displayName: 'Lúa gạo ĐBSCL',
    fallbackCategory: 'Lương thực',
    variants: [
      {
        url: '/images/commodities/gao-noi-dia/rice-grains-01.jpg',
        altBase: 'Gạo hàng hóa tại chợ đầu mối',
        subject: 'exact',
        orientation: 'landscape',
      },
      {
        url: '/images/commodities/gao-noi-dia/rice-grains-02.jpg',
        altBase: 'Hạt gạo thành phẩm',
        subject: 'exact',
        orientation: 'landscape',
      },
      {
        url: '/images/commodities/gao-noi-dia/rice-grains-03.jpg',
        altBase: 'Gạo thương phẩm đóng khay',
        subject: 'exact',
        orientation: 'landscape',
      },
    ],
  },
  'heo-hoi': {
    slug: 'heo-hoi',
    displayName: 'Heo hơi',
    fallbackCategory: 'Chăn nuôi',
    variants: [
      {
        url: '/images/commodities/heo-hoi/adult-pig-farm-01.jpg',
        altBase: 'Heo thịt trưởng thành tại trang trại',
        subject: 'exact',
        orientation: 'landscape',
      },
      {
        url: '/images/commodities/heo-hoi/adult-pig-farm-02.jpg',
        altBase: 'Heo trưởng thành nuôi thương phẩm',
        subject: 'exact',
        orientation: 'landscape',
      },
      {
        url: '/images/commodities/heo-hoi/adult-pig-farm-03.jpg',
        altBase: 'Đàn heo trưởng thành trong khu chăn nuôi',
        subject: 'exact',
        orientation: 'landscape',
      },
    ],
  },
  'ho-tieu': {
    slug: 'ho-tieu',
    displayName: 'Hồ tiêu',
    fallbackCategory: 'Cây công nghiệp',
    variants: [
      {
        url: '/images/commodities/ho-tieu/peppercorn-01.jpg',
        altBase: 'Chùm hồ tiêu trên cây',
        subject: 'exact',
        orientation: 'landscape',
      },
      {
        url: '/images/commodities/ho-tieu/peppercorn-02.jpg',
        altBase: 'Hồ tiêu tươi tại vùng trồng',
        subject: 'exact',
        orientation: 'landscape',
      },
      {
        url: '/images/commodities/ho-tieu/peppercorn-03.jpg',
        altBase: 'Quả hồ tiêu đang phát triển',
        subject: 'exact',
        orientation: 'landscape',
      },
    ],
  },
  toi: {
    slug: 'toi',
    displayName: 'Tỏi',
    fallbackCategory: 'Rau củ',
    variants: [
      {
        url: '/images/commodities/toi/garlic-01.jpg',
        altBase: 'Củ tỏi thương phẩm',
        subject: 'exact',
        orientation: 'landscape',
      },
    ],
  },
}

export const IMPORTANT_EXACT_COMMODITY_SLUGS = [
  'heo-hoi',
  'ca-tra',
  'ca-phe-robusta',
  'gao-noi-dia',
  'cam-sanh',
  'buoi-nam-roi',
  'ho-tieu',
  'toi',
  'cocoa',
] as const

export function getCommodityImageCatalog() {
  return COMMODITY_IMAGE_CATALOG
}

export function getCommodityImageCatalogEntry(slug: string) {
  return COMMODITY_IMAGE_CATALOG[slug] ?? null
}

export function getCategoryFallbackImage(category: string | null | undefined) {
  if (!category) {
    return null
  }

  return CATEGORY_FALLBACKS[category] ?? null
}

export function getDefaultCommodityImage() {
  return DEFAULT_COMMODITY_IMAGE
}
