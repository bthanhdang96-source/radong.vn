import { foldText } from './crawlers/common.js'

export const DURIAN_COMMODITY_SLUG = 'sau-rieng'
export const DURIAN_SUPPORTED_VARIETIES = ['ri6', 'thai-monthong', 'dona'] as const
export const DURIAN_HEADLINE_QUALITY_GRADES = new Set(['loai-1', 'loai-a', 'loai-tuyen', 'loai-dep'])

const DURIAN_VARIETY_LABELS: Record<string, string> = {
  'ri6': 'Ri6',
  'thai-monthong': 'Thai/Monthong',
  'dona': 'Dona',
  'musang-king': 'Musang King',
  'chuong-bo': 'Chuong Bo',
}

export type DurianVarietySectionKey = (typeof DURIAN_SUPPORTED_VARIETIES)[number]

export function normalizeDurianVariety(value: string | null | undefined) {
  const normalized = foldText(value ?? '')
  if (!normalized) {
    return null
  }

  if (normalized.includes('ri6') || normalized.includes('ri 6')) {
    return 'ri6'
  }

  if (
    normalized.includes('monthong') ||
    normalized.includes('mon thong') ||
    normalized.includes('sau rieng thai') ||
    normalized.includes('sau thai') ||
    normalized.startsWith('thai')
  ) {
    return 'thai-monthong'
  }

  if (normalized.includes('dona')) {
    return 'dona'
  }

  if (normalized.includes('musang king')) {
    return 'musang-king'
  }

  if (normalized.includes('chuong bo')) {
    return 'chuong-bo'
  }

  return null
}

export function normalizeDurianQualityGrade(value: string | null | undefined) {
  const normalized = foldText(value ?? '')
  if (!normalized) {
    return null
  }

  if (normalized.includes('loai 1')) {
    return 'loai-1'
  }

  if (normalized.includes('vip a') || normalized.includes('loai a') || normalized.includes('mau dep a')) {
    return 'loai-a'
  }

  if (normalized.includes('vip b') || normalized.includes('loai b') || normalized.includes('mau dep b')) {
    return 'loai-b'
  }

  if (normalized.includes('loai c')) {
    return 'loai-c'
  }

  if (normalized.includes('c-d') || normalized.includes('c d')) {
    return 'loai-cd'
  }

  if (normalized.includes('tuyen')) {
    return 'loai-tuyen'
  }

  if (normalized.includes('dep') || normalized.includes('dat chuan')) {
    return 'loai-dep'
  }

  if (normalized.includes('hang xo') || normalized.endsWith(' xo') || normalized.includes(' xo ')) {
    return 'hang-xo'
  }

  if (normalized.includes('dat nang')) {
    return 'dat-nang'
  }

  if (normalized.includes('dat')) {
    return 'dat'
  }

  if (normalized.includes('loi')) {
    return 'loi'
  }

  if (normalized.includes('kem')) {
    return 'kem'
  }

  return null
}

export function parseDurianLabel(label: string) {
  return {
    variety: normalizeDurianVariety(label),
    qualityGrade: normalizeDurianQualityGrade(label),
  }
}

export function isDurianHeadlineQualityGrade(qualityGrade: string | null | undefined) {
  return qualityGrade != null && DURIAN_HEADLINE_QUALITY_GRADES.has(qualityGrade)
}

export function isDurianSupportedVariety(variety: string | null | undefined): variety is DurianVarietySectionKey {
  return variety != null && DURIAN_SUPPORTED_VARIETIES.includes(variety as DurianVarietySectionKey)
}

export function getDurianVarietyLabel(variety: string | null | undefined) {
  if (!variety) {
    return 'Khac'
  }

  return DURIAN_VARIETY_LABELS[variety] ?? variety
}
