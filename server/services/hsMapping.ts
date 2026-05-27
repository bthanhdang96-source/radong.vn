export type HsPriority = 'P0' | 'P1' | 'P2'

export type HsMappingRow = {
  commodityGroup: string
  commodityName: string
  productForm: string
  hs2: string
  hs4: string
  hs6: string
  hs8Vn: string | null
  hs10Vn: string | null
  countryScope: string
  nationalCode: string | null
  nationalCodeSystem: string | null
  partnerMarketGroup: string | null
  hsDescriptionEn: string
  hsDescriptionVi: string
  analysisBucket: string
  includeInMvp: boolean
  dataPriority: HsPriority
  standardUnit: string
  conversionToTon: number
  confidenceScore: number
  notes: string
}

export type NormalizedHsCode = {
  hs2: string
  hs4: string
  hs6: string
  hs8OrMore: string | null
  normalizedDigits: string
}

export type MapHsOptions = {
  countryScope?: string
  rows?: HsMappingRow[]
}

const PRIORITY_RANK: Record<HsPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
}

const BLOCKED_AGGREGATION_PAIRS = new Set([
  'coffee_raw_core|coffee_instant',
  'coffee_instant|coffee_raw_core',
  'coffee_raw_core|coffee_roasted',
  'coffee_roasted|coffee_raw_core',
  'coffee_raw_core|coffee_roasted_decaf',
  'coffee_roasted_decaf|coffee_raw_core',
  'coffee_raw_core|coffee_byproduct',
  'coffee_byproduct|coffee_raw_core',
  'coffee_roasted|coffee_instant',
  'coffee_instant|coffee_roasted',
])

function normalizeDigits(rawCode: string) {
  return rawCode.replace(/\D/g, '')
}

function normalizeNationalCode(rawCode: string | null) {
  if (!rawCode) {
    return null
  }

  const digits = normalizeDigits(rawCode)
  return digits.length > 0 ? digits : null
}

export function normalizeHsCode(rawCode: string): NormalizedHsCode {
  const baseDigits = normalizeDigits(rawCode)
  if (baseDigits.length < 6) {
    throw new Error(`HS code must contain at least 6 digits after cleanup: "${rawCode}"`)
  }

  const normalizedDigits = baseDigits.length === 7 ? `0${baseDigits}` : baseDigits

  const hs6 = normalizedDigits.slice(0, 6)
  if (!/^[0-9]{6}$/.test(hs6)) {
    throw new Error(`HS6 normalization failed for value: "${rawCode}"`)
  }

  return {
    hs2: hs6.slice(0, 2),
    hs4: hs6.slice(0, 4),
    hs6,
    hs8OrMore: normalizedDigits.length >= 8 ? normalizedDigits : null,
    normalizedDigits,
  }
}

function compareRows(left: HsMappingRow, right: HsMappingRow) {
  if (left.confidenceScore !== right.confidenceScore) {
    return right.confidenceScore - left.confidenceScore
  }

  if (left.includeInMvp !== right.includeInMvp) {
    return left.includeInMvp ? -1 : 1
  }

  return PRIORITY_RANK[left.dataPriority] - PRIORITY_RANK[right.dataPriority]
}

function pickBestRow(rows: HsMappingRow[]) {
  return [...rows].sort(compareRows)[0] ?? null
}

function pickFromCountryScope(rows: HsMappingRow[], countryScope: string) {
  const normalizedScope = countryScope.toUpperCase()
  const preferred = rows.filter(row => row.countryScope === normalizedScope)
  if (preferred.length > 0) {
    return pickBestRow(preferred)
  }

  const shared = rows.filter(row => row.countryScope === 'INT')
  if (shared.length > 0) {
    return pickBestRow(shared)
  }

  return pickBestRow(rows)
}

function isExactCodeMatch(row: HsMappingRow, digits: string) {
  const exactCandidates = [
    normalizeNationalCode(row.hs10Vn),
    normalizeNationalCode(row.hs8Vn),
    normalizeNationalCode(row.nationalCode),
  ]

  return exactCandidates.some(candidate => candidate !== null && candidate === digits)
}

export function mapHsToCommodity(hsCode: string, options: MapHsOptions = {}) {
  const rows = options.rows ?? COFFEE_HS_MAPPING_SEED
  const normalized = normalizeHsCode(hsCode)
  const countryScope = options.countryScope?.toUpperCase()

  const exactMatches = rows.filter(row => isExactCodeMatch(row, normalized.normalizedDigits))
  if (exactMatches.length > 0) {
    return countryScope ? pickFromCountryScope(exactMatches, countryScope) : pickBestRow(exactMatches)
  }

  const hs6Matches = rows.filter(row => row.hs6 === normalized.hs6)
  if (hs6Matches.length > 0) {
    return countryScope ? pickFromCountryScope(hs6Matches, countryScope) : pickBestRow(hs6Matches)
  }

  return null
}

export function getMvpHsCodes(commodityGroup?: string, rows: HsMappingRow[] = COFFEE_HS_MAPPING_SEED) {
  return rows
    .filter(row => row.includeInMvp)
    .filter(row => !commodityGroup || row.commodityGroup === commodityGroup)
    .sort(compareRows)
}

export function shouldAggregate(bucketA: string, bucketB: string) {
  if (!bucketA || !bucketB) {
    return false
  }

  if (bucketA === bucketB) {
    return true
  }

  const pairKey = `${bucketA}|${bucketB}`
  if (BLOCKED_AGGREGATION_PAIRS.has(pairKey)) {
    return false
  }

  return false
}

export const COFFEE_HS_MAPPING_SEED: HsMappingRow[] = [
  {
    commodityGroup: 'coffee',
    commodityName: 'Coffee',
    productForm: 'Not roasted not decaffeinated',
    hs2: '09',
    hs4: '0901',
    hs6: '090111',
    hs8Vn: null,
    hs10Vn: null,
    countryScope: 'INT',
    nationalCode: null,
    nationalCodeSystem: null,
    partnerMarketGroup: null,
    hsDescriptionEn: 'Coffee; not roasted or decaffeinated',
    hsDescriptionVi: 'Ca phe chua rang chua khu caffeine',
    analysisBucket: 'coffee_raw_core',
    includeInMvp: true,
    dataPriority: 'P0',
    standardUnit: 'ton',
    conversionToTon: 1,
    confidenceScore: 0.95,
    notes: 'Core coffee benchmark at HS6 level',
  },
  {
    commodityGroup: 'coffee',
    commodityName: 'Coffee',
    productForm: 'Not roasted not decaffeinated Arabica',
    hs2: '09',
    hs4: '0901',
    hs6: '090111',
    hs8Vn: '09011120',
    hs10Vn: null,
    countryScope: 'VNM',
    nationalCode: '0901.11.20',
    nationalCodeSystem: 'AHTN_VN',
    partnerMarketGroup: null,
    hsDescriptionEn: 'Coffee; not roasted or decaffeinated (Arabica)',
    hsDescriptionVi: 'Ca phe chua rang chua khu caffeine Arabica',
    analysisBucket: 'coffee_raw_core',
    includeInMvp: true,
    dataPriority: 'P1',
    standardUnit: 'ton',
    conversionToTon: 1,
    confidenceScore: 0.93,
    notes: 'Mapped from Vietnam national 8-digit code to HS6',
  },
  {
    commodityGroup: 'coffee',
    commodityName: 'Coffee',
    productForm: 'Not roasted not decaffeinated Robusta',
    hs2: '09',
    hs4: '0901',
    hs6: '090111',
    hs8Vn: '09011130',
    hs10Vn: null,
    countryScope: 'VNM',
    nationalCode: '0901.11.30',
    nationalCodeSystem: 'AHTN_VN',
    partnerMarketGroup: null,
    hsDescriptionEn: 'Coffee; not roasted or decaffeinated (Robusta)',
    hsDescriptionVi: 'Ca phe chua rang chua khu caffeine Robusta',
    analysisBucket: 'coffee_raw_core',
    includeInMvp: true,
    dataPriority: 'P0',
    standardUnit: 'ton',
    conversionToTon: 1,
    confidenceScore: 0.95,
    notes: 'Robusta-specific Vietnam code',
  },
  {
    commodityGroup: 'coffee',
    commodityName: 'Coffee',
    productForm: 'Not roasted not decaffeinated other',
    hs2: '09',
    hs4: '0901',
    hs6: '090111',
    hs8Vn: '09011190',
    hs10Vn: null,
    countryScope: 'VNM',
    nationalCode: '0901.11.90',
    nationalCodeSystem: 'AHTN_VN',
    partnerMarketGroup: null,
    hsDescriptionEn: 'Coffee; not roasted or decaffeinated (other)',
    hsDescriptionVi: 'Ca phe chua rang chua khu caffeine loai khac',
    analysisBucket: 'coffee_raw_core',
    includeInMvp: true,
    dataPriority: 'P1',
    standardUnit: 'ton',
    conversionToTon: 1,
    confidenceScore: 0.9,
    notes: 'Other subgroup in Vietnam schedule',
  },
  {
    commodityGroup: 'coffee',
    commodityName: 'Coffee',
    productForm: 'Not roasted decaffeinated',
    hs2: '09',
    hs4: '0901',
    hs6: '090112',
    hs8Vn: null,
    hs10Vn: null,
    countryScope: 'INT',
    nationalCode: null,
    nationalCodeSystem: null,
    partnerMarketGroup: null,
    hsDescriptionEn: 'Coffee; decaffeinated, not roasted',
    hsDescriptionVi: 'Ca phe chua rang da khu caffeine',
    analysisBucket: 'coffee_decaf_raw',
    includeInMvp: false,
    dataPriority: 'P2',
    standardUnit: 'ton',
    conversionToTon: 1,
    confidenceScore: 0.9,
    notes: 'Out of MVP scope',
  },
  {
    commodityGroup: 'coffee',
    commodityName: 'Coffee',
    productForm: 'Roasted not decaffeinated',
    hs2: '09',
    hs4: '0901',
    hs6: '090121',
    hs8Vn: null,
    hs10Vn: null,
    countryScope: 'INT',
    nationalCode: null,
    nationalCodeSystem: null,
    partnerMarketGroup: null,
    hsDescriptionEn: 'Coffee; roasted, not decaffeinated',
    hsDescriptionVi: 'Ca phe rang chua khu caffeine',
    analysisBucket: 'coffee_roasted',
    includeInMvp: false,
    dataPriority: 'P2',
    standardUnit: 'ton',
    conversionToTon: 1,
    confidenceScore: 0.9,
    notes: 'Do not aggregate with green coffee',
  },
  {
    commodityGroup: 'coffee',
    commodityName: 'Coffee',
    productForm: 'Roasted decaffeinated',
    hs2: '09',
    hs4: '0901',
    hs6: '090122',
    hs8Vn: null,
    hs10Vn: null,
    countryScope: 'INT',
    nationalCode: null,
    nationalCodeSystem: null,
    partnerMarketGroup: null,
    hsDescriptionEn: 'Coffee; roasted, decaffeinated',
    hsDescriptionVi: 'Ca phe rang da khu caffeine',
    analysisBucket: 'coffee_roasted_decaf',
    includeInMvp: false,
    dataPriority: 'P2',
    standardUnit: 'ton',
    conversionToTon: 1,
    confidenceScore: 0.88,
    notes: 'Out of MVP scope',
  },
  {
    commodityGroup: 'coffee',
    commodityName: 'Coffee',
    productForm: 'Coffee husks skins substitutes',
    hs2: '09',
    hs4: '0901',
    hs6: '090190',
    hs8Vn: null,
    hs10Vn: null,
    countryScope: 'INT',
    nationalCode: null,
    nationalCodeSystem: null,
    partnerMarketGroup: null,
    hsDescriptionEn: 'Coffee; husks and skins, coffee substitutes containing coffee',
    hsDescriptionVi: 'Ca phe vo va chat thay the',
    analysisBucket: 'coffee_byproduct',
    includeInMvp: false,
    dataPriority: 'P2',
    standardUnit: 'ton',
    conversionToTon: 1,
    confidenceScore: 0.86,
    notes: 'Keep separate from raw and instant coffee',
  },
  {
    commodityGroup: 'coffee',
    commodityName: 'Coffee',
    productForm: 'Coffee extracts instant',
    hs2: '21',
    hs4: '2101',
    hs6: '210111',
    hs8Vn: null,
    hs10Vn: null,
    countryScope: 'INT',
    nationalCode: null,
    nationalCodeSystem: null,
    partnerMarketGroup: null,
    hsDescriptionEn: 'Extracts essences and concentrates of coffee and preparations based on coffee',
    hsDescriptionVi: 'Chiet xuat tinh chat co dac tu cafe',
    analysisBucket: 'coffee_instant',
    includeInMvp: true,
    dataPriority: 'P1',
    standardUnit: 'ton',
    conversionToTon: 1,
    confidenceScore: 0.92,
    notes: 'Processed coffee do not aggregate with green coffee',
  },
  {
    commodityGroup: 'coffee',
    commodityName: 'Coffee',
    productForm: 'Partner mapping United States',
    hs2: '09',
    hs4: '0901',
    hs6: '090111',
    hs8Vn: null,
    hs10Vn: null,
    countryScope: 'USA',
    nationalCode: '0901.11.00',
    nationalCodeSystem: 'HTSUS',
    partnerMarketGroup: 'US',
    hsDescriptionEn: 'Coffee not roasted not decaffeinated',
    hsDescriptionVi: 'Ma doi tac My cho cafe xanh khong khu caffeine',
    analysisBucket: 'coffee_raw_core',
    includeInMvp: true,
    dataPriority: 'P1',
    standardUnit: 'ton',
    conversionToTon: 1,
    confidenceScore: 0.85,
    notes: 'Partner mapping for U.S. tariff line',
  },
  {
    commodityGroup: 'coffee',
    commodityName: 'Coffee',
    productForm: 'Partner mapping Japan',
    hs2: '09',
    hs4: '0901',
    hs6: '090111',
    hs8Vn: null,
    hs10Vn: null,
    countryScope: 'JPN',
    nationalCode: '0901.11.000',
    nationalCodeSystem: 'JP_TARIFF',
    partnerMarketGroup: 'JP',
    hsDescriptionEn: 'Coffee not roasted not decaffeinated',
    hsDescriptionVi: 'Ma doi tac Nhat cho cafe xanh khong khu caffeine',
    analysisBucket: 'coffee_raw_core',
    includeInMvp: true,
    dataPriority: 'P1',
    standardUnit: 'ton',
    conversionToTon: 1,
    confidenceScore: 0.9,
    notes: 'Partner mapping for Japan tariff statistical code',
  },
  {
    commodityGroup: 'coffee',
    commodityName: 'Coffee',
    productForm: 'Partner mapping European Union',
    hs2: '09',
    hs4: '0901',
    hs6: '090111',
    hs8Vn: null,
    hs10Vn: null,
    countryScope: 'EUR',
    nationalCode: '09011100',
    nationalCodeSystem: 'CN_TARIC',
    partnerMarketGroup: 'EU',
    hsDescriptionEn: 'Coffee not roasted not decaffeinated',
    hsDescriptionVi: 'Ma doi tac EU cho cafe xanh khong khu caffeine',
    analysisBucket: 'coffee_raw_core',
    includeInMvp: true,
    dataPriority: 'P1',
    standardUnit: 'ton',
    conversionToTon: 1,
    confidenceScore: 0.82,
    notes: 'Applies to Germany Italy Spain under EU customs nomenclature',
  },
]
