import { foldText } from './crawlers/common.js'
import type { SourceId } from './crawlers/types.js'

export const USD_VND_RATE = 25_850

export const VN_COMMODITY_META: Record<
  string,
  {
    commodityName: string
    category: string
    unit: string
  }
> = {
  'ca-phe-robusta': {
    commodityName: 'Ca phe Robusta',
    category: 'Cay cong nghiep',
    unit: 'VND/kg',
  },
  'ho-tieu': {
    commodityName: 'Ho tieu',
    category: 'Cay cong nghiep',
    unit: 'VND/kg',
  },
  'heo-hoi': {
    commodityName: 'Heo hoi',
    category: 'Chan nuoi',
    unit: 'VND/kg',
  },
  'gao-noi-dia': {
    commodityName: 'Lua gao DBSCL',
    category: 'Luong thuc',
    unit: 'VND/kg',
  },
  cashew: {
    commodityName: 'Hat dieu',
    category: 'Cay cong nghiep',
    unit: 'VND/kg',
  },
  cocoa: {
    commodityName: 'Ca cao',
    category: 'Cay cong nghiep',
    unit: 'VND/kg',
  },
  'ca-tra': {
    commodityName: 'Ca tra',
    category: 'Thuy san',
    unit: 'VND/kg',
  },
  'cam-sanh': {
    commodityName: 'Cam sanh',
    category: 'Trai cay',
    unit: 'VND/kg',
  },
  'buoi-nam-roi': {
    commodityName: 'Buoi Nam Roi',
    category: 'Trai cay',
    unit: 'VND/kg',
  },
}

export const SOURCE_BASE_CONFIDENCE: Record<SourceId, number> = {
  nongnghiep: 0.78,
  vietnambiz: 0.74,
  congthuong: 0.82,
  vietfood: 0.86,
  vpsaspice: 0.8,
  giaca_nsvl: 0.79,
  banggianongsan: 0.73,
  fallback: 0.35,
}

type ProvinceSeed = {
  code: string
  nameVi: string
  region: string
}

const provinceSeeds: ProvinceSeed[] = [
  { code: 'AGI', nameVi: 'An Giang', region: 'south' },
  { code: 'BRV', nameVi: 'Ba Ria - Vung Tau', region: 'south' },
  { code: 'BNI', nameVi: 'Bac Ninh', region: 'north' },
  { code: 'BPC', nameVi: 'Binh Phuoc', region: 'south' },
  { code: 'CMA', nameVi: 'Ca Mau', region: 'south' },
  { code: 'CTO', nameVi: 'Can Tho', region: 'south' },
  { code: 'CBG', nameVi: 'Cao Bang', region: 'north' },
  { code: 'DNG', nameVi: 'Da Nang', region: 'central' },
  { code: 'DLK', nameVi: 'Dak Lak', region: 'highland' },
  { code: 'DNO', nameVi: 'Dak Nong', region: 'highland' },
  { code: 'DBI', nameVi: 'Dien Bien', region: 'north' },
  { code: 'DNI', nameVi: 'Dong Nai', region: 'south' },
  { code: 'DTP', nameVi: 'Dong Thap', region: 'south' },
  { code: 'GLA', nameVi: 'Gia Lai', region: 'highland' },
  { code: 'HNI', nameVi: 'Ha Noi', region: 'north' },
  { code: 'HTI', nameVi: 'Ha Tinh', region: 'central' },
  { code: 'HPG', nameVi: 'Hai Phong', region: 'north' },
  { code: 'HUE', nameVi: 'Hue', region: 'central' },
  { code: 'HYN', nameVi: 'Hung Yen', region: 'north' },
  { code: 'KHO', nameVi: 'Khanh Hoa', region: 'central' },
  { code: 'LCH', nameVi: 'Lai Chau', region: 'north' },
  { code: 'LDO', nameVi: 'Lam Dong', region: 'highland' },
  { code: 'LSN', nameVi: 'Lang Son', region: 'north' },
  { code: 'LCA', nameVi: 'Lao Cai', region: 'north' },
  { code: 'NAN', nameVi: 'Nghe An', region: 'central' },
  { code: 'NBI', nameVi: 'Ninh Binh', region: 'north' },
  { code: 'PTO', nameVi: 'Phu Tho', region: 'north' },
  { code: 'QNG', nameVi: 'Quang Ngai', region: 'central' },
  { code: 'QNI', nameVi: 'Quang Ninh', region: 'north' },
  { code: 'QTR', nameVi: 'Quang Tri', region: 'central' },
  { code: 'SLA', nameVi: 'Son La', region: 'north' },
  { code: 'TNN', nameVi: 'Tay Ninh', region: 'south' },
  { code: 'TNG', nameVi: 'Thai Nguyen', region: 'north' },
  { code: 'THO', nameVi: 'Thanh Hoa', region: 'central' },
  { code: 'HCM', nameVi: 'TP. Ho Chi Minh', region: 'south' },
  { code: 'TQG', nameVi: 'Tuyen Quang', region: 'north' },
  { code: 'VLO', nameVi: 'Vinh Long', region: 'south' },
]

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
  marketType: 'farm_gate' | 'wholesale'
}

function stripRicePrefix(value: string) {
  return value
    .replace(/^Nguyen lieu\s+/i, '')
    .replace(/^Lua tuoi\s+/i, '')
    .trim()
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
    return rawRegion
  }

  if (variety) {
    return variety
  }

  if (provinceCode) {
    return PROVINCE_NAME_BY_CODE[provinceCode] ?? provinceCode
  }

  return 'Khong ro khu vuc'
}
