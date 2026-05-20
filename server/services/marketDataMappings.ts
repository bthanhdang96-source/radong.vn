import { foldText } from './crawlers/common.js'
import type { SourceId } from './crawlers/types.js'

export const USD_VND_RATE = 25_850
export type PriceType = 'farm_gate' | 'wholesale' | 'retail' | 'export'
export type SourceType =
  | 'crawl_news'
  | 'crawl_ecom'
  | 'crawl_gov'
  | 'customs'
  | 'world_exchange'
  | 'crowdsource'
  | 'api_partner'

export const VN_COMMODITY_META: Record<
  string,
  {
    commodityName: string
    category: string
    unit: string
  }
> = {
  'ca-phe-robusta': {
    commodityName: 'Cà phê Robusta',
    category: 'Cây công nghiệp',
    unit: 'VND/kg',
  },
  'ho-tieu': {
    commodityName: 'Hồ tiêu',
    category: 'Cây công nghiệp',
    unit: 'VND/kg',
  },
  'heo-hoi': {
    commodityName: 'Heo hơi',
    category: 'Chăn nuôi',
    unit: 'VND/kg',
  },
  'gao-noi-dia': {
    commodityName: 'Lúa gạo ĐBSCL',
    category: 'Lương thực',
    unit: 'VND/kg',
  },
  cashew: {
    commodityName: 'Hạt điều',
    category: 'Cây công nghiệp',
    unit: 'VND/kg',
  },
  cocoa: {
    commodityName: 'Ca cao',
    category: 'Cây công nghiệp',
    unit: 'VND/kg',
  },
  'ca-tra': {
    commodityName: 'Cá tra',
    category: 'Thủy sản',
    unit: 'VND/kg',
  },
  'cam-sanh': {
    commodityName: 'Cam sành',
    category: 'Trái cây',
    unit: 'VND/kg',
  },
  'buoi-nam-roi': {
    commodityName: 'Bưởi Năm Roi',
    category: 'Trái cây',
    unit: 'VND/kg',
  },
  cassava: {
    commodityName: 'Sắn',
    category: 'Lương thực',
    unit: 'VND/kg',
  },
  'tea-avg': {
    commodityName: 'Chè',
    category: 'Cây công nghiệp',
    unit: 'VND/kg',
  },
  'sau-rieng': {
    commodityName: 'Sầu riêng',
    category: 'Trái cây',
    unit: 'VND/kg',
  },
  'thanh-long': {
    commodityName: 'Thanh long',
    category: 'Trái cây',
    unit: 'VND/kg',
  },
  'dua-tuoi': {
    commodityName: 'Dừa tươi',
    category: 'Trái cây',
    unit: 'VND/chuc',
  },
  'ca-chua': {
    commodityName: 'Cà chua',
    category: 'Rau củ',
    unit: 'VND/kg',
  },
  'hanh-tay': {
    commodityName: 'Hành tây',
    category: 'Rau củ',
    unit: 'VND/kg',
  },
  toi: {
    commodityName: 'Tỏi',
    category: 'Rau củ',
    unit: 'VND/kg',
  },
  'khoai-tay': {
    commodityName: 'Khoai tây',
    category: 'Rau củ',
    unit: 'VND/kg',
  },
  'bap-cai': {
    commodityName: 'Bắp cải',
    category: 'Rau củ',
    unit: 'VND/kg',
  },
  'rau-muong': {
    commodityName: 'Rau muống',
    category: 'Rau củ',
    unit: 'VND/kg',
  },
  'cai-xanh': {
    commodityName: 'Cải xanh',
    category: 'Rau củ',
    unit: 'VND/kg',
  },
  ot: {
    commodityName: 'Ớt',
    category: 'Rau củ',
    unit: 'VND/kg',
  },
  'bi-do': {
    commodityName: 'Bí đỏ',
    category: 'Rau củ',
    unit: 'VND/kg',
  },
  'khoai-lang': {
    commodityName: 'Khoai lang',
    category: 'Rau củ',
    unit: 'VND/kg',
  },
  xoai: {
    commodityName: 'Xoài',
    category: 'Trái cây',
    unit: 'VND/kg',
  },
  chuoi: {
    commodityName: 'Chuối',
    category: 'Trái cây',
    unit: 'VND/kg',
  },
  mit: {
    commodityName: 'Mít',
    category: 'Trái cây',
    unit: 'VND/kg',
  },
  'thit-heo': {
    commodityName: 'Thịt heo',
    category: 'Chăn nuôi',
    unit: 'VND/kg',
  },
  shrimp: {
    commodityName: 'Tôm',
    category: 'Thủy sản',
    unit: 'VND/kg',
  },
  pangasius: {
    commodityName: 'Cá tra fillet',
    category: 'Thủy sản',
    unit: 'VND/kg',
  },
  corn: {
    commodityName: 'Ngô',
    category: 'Lương thực',
    unit: 'VND/kg',
  },
  soybeans: {
    commodityName: 'Đậu tương',
    category: 'Lương thực',
    unit: 'VND/kg',
  },
  'rubber-rss3': {
    commodityName: 'Cao su RSS3',
    category: 'Cây công nghiệp',
    unit: 'VND/kg',
  },
  'rubber-tsr20': {
    commodityName: 'Cao su TSR20',
    category: 'Cây công nghiệp',
    unit: 'VND/kg',
  },
}

export const SOURCE_BASE_CONFIDENCE: Record<SourceId, number> = {
  nongnghiep: 0.78,
  vietnambiz: 0.74,
  congthuong: 0.82,
  chogia: 0.76,
  daklak_sct: 0.88,
  dongnai_sct_daugiay: 0.84,
  vpsaspice: 0.8,
  banggianongsan: 0.73,
  giahotieu: 0.74,
  kimhungmarket: 0.69,
  vietfood: 0.86,
  giaca_nsvl: 0.79,
  bhx: 0.72,
  coop: 0.72,
  shopee: 0.7,
  customs: 0.95,
  agroinfo_fruit_report: 0.83,
  fallback: 0.35,
}

export const SOURCE_TYPE_BY_SOURCE_ID: Record<SourceId, SourceType> = {
  nongnghiep: 'crawl_news',
  vietnambiz: 'crawl_news',
  congthuong: 'crawl_gov',
  chogia: 'crawl_news',
  daklak_sct: 'crawl_gov',
  dongnai_sct_daugiay: 'crawl_gov',
  vpsaspice: 'crawl_news',
  banggianongsan: 'crawl_news',
  giahotieu: 'crawl_news',
  kimhungmarket: 'crawl_news',
  vietfood: 'crawl_news',
  giaca_nsvl: 'crawl_news',
  bhx: 'crawl_ecom',
  coop: 'crawl_ecom',
  shopee: 'crawl_ecom',
  customs: 'customs',
  agroinfo_fruit_report: 'crawl_gov',
  fallback: 'api_partner',
}

export const EXTERNAL_COMMODITY_ALIASES: Record<string, string> = {
  'ca-phe': 'ca-phe-robusta',
  'ca-phe-robusta': 'ca-phe-robusta',
  'coffee-robusta': 'coffee-robusta',
  'coffee-arabica': 'coffee-arabica',
  'lua-gao': 'gao-noi-dia',
  'gao-xuat-khau': 'rice-5pct',
  'gao-noi-dia': 'gao-noi-dia',
  tieu: 'ho-tieu',
  'ho-tieu': 'ho-tieu',
  dieu: 'cashew',
  cashew: 'cashew',
  'ca-tra': 'ca-tra',
  'ca-chua': 'ca-chua',
  'hanh-tay': 'hanh-tay',
  toi: 'toi',
  'khoai-tay': 'khoai-tay',
  'bap-cai': 'bap-cai',
  'rau-muong': 'rau-muong',
  'cai-xanh': 'cai-xanh',
  ot: 'ot',
  'bi-do': 'bi-do',
  'khoai-lang': 'khoai-lang',
  xoai: 'xoai',
  chuoi: 'chuoi',
  mit: 'mit',
  san: 'cassava',
  cassava: 'cassava',
  'khoai-mi': 'cassava',
  'khoai mi': 'cassava',
  'mi-nguyen-lieu': 'cassava',
  'mi nguyen lieu': 'cassava',
  che: 'tea-avg',
  tra: 'tea-avg',
  'tea-avg': 'tea-avg',
  'sau-rieng': 'sau-rieng',
  durian: 'sau-rieng',
  ri6: 'sau-rieng',
  thai: 'sau-rieng',
  monthong: 'sau-rieng',
  dona: 'sau-rieng',
  'thanh-long': 'thanh-long',
  'thanh long': 'thanh-long',
  'dragon-fruit': 'thanh-long',
  'dragon fruit': 'thanh-long',
  'dua-tuoi': 'dua-tuoi',
  'dua tuoi': 'dua-tuoi',
  coconut: 'dua-tuoi',
  dua: 'dua-tuoi',
  'dua xiem': 'dua-tuoi',
  'dua uong nuoc': 'dua-tuoi',
  'thit-heo': 'thit-heo',
  pangasius: 'pangasius',
  'tom-the': 'shrimp',
  'tom-su': 'shrimp',
  shrimp: 'shrimp',
  'cao-su': 'rubber-rss3',
  'rubber-rss3': 'rubber-rss3',
  'rubber-tsr20': 'rubber-tsr20',
  ngo: 'corn',
  corn: 'corn',
  'dau-tuong': 'soybeans',
  soybeans: 'soybeans',
}

export const SAFE_EXTERNAL_COMMODITY_TARGETS = new Set<string>([
  'ca-phe',
  'ca-phe-robusta',
  'coffee-robusta',
  'coffee-arabica',
  'lua-gao',
  'gao-xuat-khau',
  'gao-noi-dia',
  'tieu',
  'ho-tieu',
  'dieu',
  'cashew',
  'ca-tra',
  'ca-chua',
  'hanh-tay',
  'toi',
  'khoai-tay',
  'bap-cai',
  'rau-muong',
  'cai-xanh',
  'ot',
  'bi-do',
  'khoai-lang',
  'xoai',
  'chuoi',
  'mit',
  'san',
  'cassava',
  'khoai-mi',
  'khoai mi',
  'mi-nguyen-lieu',
  'mi nguyen lieu',
  'che',
  'tra',
  'tea-avg',
  'sau-rieng',
  'durian',
  'ri6',
  'thai',
  'monthong',
  'dona',
  'thanh-long',
  'thanh long',
  'dragon-fruit',
  'dragon fruit',
  'dua-tuoi',
  'dua tuoi',
  'coconut',
  'dua',
  'dua xiem',
  'dua uong nuoc',
  'thit-heo',
  'pangasius',
  'tom-the',
  'tom-su',
  'shrimp',
  'cao-su',
  'rubber-rss3',
  'rubber-tsr20',
  'ngo',
  'corn',
  'dau-tuong',
  'soybeans',
])

type ProvinceSeed = {
  code: string
  nameVi: string
  region: string
}

const provinceSeeds: ProvinceSeed[] = [
  { code: 'AGI', nameVi: 'An Giang', region: 'south' },
  { code: 'BRV', nameVi: 'Bà Rịa - Vũng Tàu', region: 'south' },
  { code: 'BNI', nameVi: 'Bắc Ninh', region: 'north' },
  { code: 'BPC', nameVi: 'Bình Phước', region: 'south' },
  { code: 'CMA', nameVi: 'Cà Mau', region: 'south' },
  { code: 'CTO', nameVi: 'Cần Thơ', region: 'south' },
  { code: 'CBG', nameVi: 'Cao Bằng', region: 'north' },
  { code: 'DNG', nameVi: 'Đà Nẵng', region: 'central' },
  { code: 'DLK', nameVi: 'Đắk Lắk', region: 'highland' },
  { code: 'DNO', nameVi: 'Đắk Nông', region: 'highland' },
  { code: 'DBI', nameVi: 'Điện Biên', region: 'north' },
  { code: 'DNI', nameVi: 'Đồng Nai', region: 'south' },
  { code: 'DTP', nameVi: 'Đồng Tháp', region: 'south' },
  { code: 'GLA', nameVi: 'Gia Lai', region: 'highland' },
  { code: 'HNI', nameVi: 'Hà Nội', region: 'north' },
  { code: 'HTI', nameVi: 'Hà Tĩnh', region: 'central' },
  { code: 'HPG', nameVi: 'Hải Phòng', region: 'north' },
  { code: 'HUE', nameVi: 'Huế', region: 'central' },
  { code: 'HYN', nameVi: 'Hưng Yên', region: 'north' },
  { code: 'KHO', nameVi: 'Khánh Hòa', region: 'central' },
  { code: 'LCH', nameVi: 'Lai Châu', region: 'north' },
  { code: 'LDO', nameVi: 'Lâm Đồng', region: 'highland' },
  { code: 'LSN', nameVi: 'Lạng Sơn', region: 'north' },
  { code: 'LCA', nameVi: 'Lào Cai', region: 'north' },
  { code: 'NAN', nameVi: 'Nghệ An', region: 'central' },
  { code: 'NBI', nameVi: 'Ninh Bình', region: 'north' },
  { code: 'PTO', nameVi: 'Phú Thọ', region: 'north' },
  { code: 'QNG', nameVi: 'Quảng Ngãi', region: 'central' },
  { code: 'QNI', nameVi: 'Quảng Ninh', region: 'north' },
  { code: 'QTR', nameVi: 'Quảng Trị', region: 'central' },
  { code: 'SLA', nameVi: 'Sơn La', region: 'north' },
  { code: 'TNN', nameVi: 'Tây Ninh', region: 'south' },
  { code: 'TNG', nameVi: 'Thái Nguyên', region: 'north' },
  { code: 'THO', nameVi: 'Thanh Hóa', region: 'central' },
  { code: 'HCM', nameVi: 'TP. Hồ Chí Minh', region: 'south' },
  { code: 'TQG', nameVi: 'Tuyên Quang', region: 'north' },
  { code: 'VLO', nameVi: 'Vĩnh Long', region: 'south' },
]

const DISPLAY_REGION_ALIASES: Record<string, string> = {
  'dak lak': 'Đắk Lắk',
  'dak nong': 'Đắk Nông',
  'lam dong': 'Lâm Đồng',
  'ba ria - vung tau': 'Bà Rịa - Vũng Tàu',
  'binh phuoc': 'Bình Phước',
  'dong nai': 'Đồng Nai',
  'dong thap': 'Đồng Tháp',
  'ha noi': 'Hà Nội',
  'hai phong': 'Hải Phòng',
  'can tho': 'Cần Thơ',
  'da nang': 'Đà Nẵng',
  'nghe an': 'Nghệ An',
  'thanh hoa': 'Thanh Hóa',
  'tp. ho chi minh': 'TP. Hồ Chí Minh',
  'tp ho chi minh': 'TP. Hồ Chí Minh',
  'mien bac': 'Miền Bắc',
  'mien trung - tay nguyen': 'Miền Trung - Tây Nguyên',
  'mien nam': 'Miền Nam',
  'mien tay nam bo': 'Miền Tây Nam Bộ',
  'tay nam bo': 'Tây Nam Bộ',
  'mien dong nam bo': 'Miền Đông Nam Bộ',
  'dong nam bo': 'Đông Nam Bộ',
  'tay nguyen': 'Tây Nguyên',
  'dong bang song cuu long': 'Đồng bằng sông Cửu Long',
  dbscl: 'Đồng bằng sông Cửu Long',
  'kon tum': 'Kon Tum',
  'phu yen': 'Phú Yên',
  'cam sanh': 'Cam sành',
  'buoi nam roi': 'Bưởi Năm Roi',
  'ca tra': 'Cá tra',
  'heo hoi': 'Heo hơi',
  'lua gao dbscl': 'Lúa gạo ĐBSCL',
  'dai thom 8': 'Đài Thơm 8',
  'lua tuoi dai thom 8': 'Lúa tươi Đài Thơm 8',
  'lua tuoi om 18': 'Lúa tươi OM 18',
  'lua tuoi om 5451': 'Lúa tươi OM 5451',
  'lua tuoi ir 50404': 'Lúa tươi IR 50404',
  'lua tuoi om 34': 'Lúa tươi OM 34',
  'nguyen lieu ir 504': 'Nguyên liệu IR 504',
  'nguyen lieu cl 555': 'Nguyên liệu CL 555',
  'thanh long': 'Thanh long',
  'thanh long ruot trang': 'Thanh long ruột trắng',
  'dua tuoi': 'Dừa tươi',
  'dua xiem': 'Dừa xiêm',
  'khong ro khu vuc': 'Không rõ khu vực',
}

export function normalizeDisplayRegion(value: string) {
  const folded = foldText(value)
  return DISPLAY_REGION_ALIASES[folded] ?? value
}

export const PROVINCE_CODE_BY_FOLDED_NAME = provinceSeeds.reduce<Record<string, string>>((acc, province) => {
  acc[foldText(province.nameVi)] = province.code
  return acc
}, {})

export const PROVINCE_NAME_BY_CODE = provinceSeeds.reduce<Record<string, string>>((acc, province) => {
  acc[province.code] = province.nameVi
  return acc
}, {})

export type RiceClassification = {
  variety: string | null
  qualityGrade: string | null
  marketType: Extract<PriceType, 'farm_gate' | 'wholesale'>
}

function stripRicePrefix(value: string) {
  return value.replace(/^Nguyen lieu\s+/i, '').replace(/^Lua tuoi\s+/i, '').trim()
}

export function classifyRiceRegionLabel(region: string): RiceClassification {
  const normalized = foldText(region)
  const isFreshPaddy = normalized.startsWith('lua tuoi ')
  const isRawMaterial = normalized.startsWith('nguyen lieu ')

  return {
    variety: stripRicePrefix(region),
    qualityGrade: isFreshPaddy ? 'lua-tuoi' : isRawMaterial ? 'nguyen-lieu' : null,
    marketType: isFreshPaddy ? 'farm_gate' : 'wholesale',
  }
}

export function inferPriceType(input: {
  sourceId: SourceId
  articleTitle?: string | null
  declaredPriceType?: PriceType | null
}) {
  if (input.declaredPriceType) {
    return input.declaredPriceType
  }

  const foldedTitle = foldText(input.articleTitle ?? '')
  if (foldedTitle.includes('xuat khau') || foldedTitle.includes('fob')) {
    return 'export' satisfies PriceType
  }

  if (foldedTitle.includes('ban le') || foldedTitle.includes('sieu thi')) {
    return 'retail' satisfies PriceType
  }

  switch (SOURCE_TYPE_BY_SOURCE_ID[input.sourceId]) {
    case 'crawl_ecom':
      return 'retail' satisfies PriceType
    case 'customs':
      return 'export' satisfies PriceType
    default:
      return 'wholesale' satisfies PriceType
  }
}

export function normalizeExternalCommoditySlug(value: string) {
  const folded = foldText(value)
  return EXTERNAL_COMMODITY_ALIASES[folded] ?? EXTERNAL_COMMODITY_ALIASES[value] ?? value
}

export function convertWorldPriceToUsdKg(price: number, unit: string, factor?: number | null) {
  const foldedUnit = foldText(unit)

  if (foldedUnit.includes('usd/kg') || foldedUnit.includes('usc/kg')) {
    return roundTo(price * (foldedUnit.includes('usc/') ? 0.01 : 1), 6)
  }

  if (
    foldedUnit.includes('usd/tan') ||
    foldedUnit.includes('usd/ton') ||
    foldedUnit.includes('usd/t') ||
    foldedUnit.includes('usd/mt')
  ) {
    return roundTo(price / 1000, 6)
  }

  if (foldedUnit.includes('usd/cwt')) {
    return roundTo(price * 0.022046, 6)
  }

  if (foldedUnit.includes('usc/lb')) {
    return roundTo(price * 0.022046, 6)
  }

  if (foldedUnit.includes('usc/bushel') && factor) {
    return roundTo(price * factor, 6)
  }

  if (factor) {
    return roundTo(price * factor, 6)
  }

  return roundTo(price, 6)
}

function roundTo(value: number, digits: number) {
  return Number(value.toFixed(digits))
}

export function getProvinceCodeFromRegion(region: string) {
  return PROVINCE_CODE_BY_FOLDED_NAME[foldText(region)] ?? null
}

const AGGREGATE_REGION_LABELS = new Set([
  'viet nam',
  'toan quoc',
  'noi dia',
  'dbscl',
  'dong bang song cuu long',
  'mien tay',
  'tay nam bo',
  'mien tay nam bo',
  'dong nam bo',
  'mien dong nam bo',
  'tay nguyen',
])

export function isAggregateRegionLabel(region: string) {
  return AGGREGATE_REGION_LABELS.has(foldText(region))
}

export function getRegionLabelFromObservation(
  provinceCode: string | null,
  variety: string | null,
  rawRegion: string | null,
) {
  if (rawRegion) {
    return normalizeDisplayRegion(rawRegion)
  }

  if (variety) {
    return normalizeDisplayRegion(variety)
  }

  if (provinceCode) {
    return PROVINCE_NAME_BY_CODE[provinceCode] ?? provinceCode
  }

  return 'Không rõ khu vực'
}

