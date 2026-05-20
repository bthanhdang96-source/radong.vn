import { foldText } from './common.js'

export type RetailCommodityMatcher = {
  slug: string
  commodityName: string
  category: string
  keywords: string[]
  excludeKeywords?: string[]
}

export const RETAIL_PRODUCT_MATCHERS: RetailCommodityMatcher[] = [
  {
    slug: 'cassava',
    commodityName: 'San',
    category: 'Luong thuc',
    keywords: ['san tuoi'],
    excludeKeywords: ['tinh bot', 'bot nang', 'banh', 'chip', 'say', 'mut'],
  },
  {
    slug: 'cassava',
    commodityName: 'San',
    category: 'Luong thuc',
    keywords: ['khoai mi'],
    excludeKeywords: ['tinh bot', 'bot nang', 'banh', 'chip', 'say', 'mut'],
  },
  {
    slug: 'tea-avg',
    commodityName: 'Che',
    category: 'Cay cong nghiep',
    keywords: ['che xanh'],
    excludeKeywords: ['matcha', 'tra sua', 'tra giam can', 'atiso', 'thao moc', 'bot'],
  },
  {
    slug: 'tea-avg',
    commodityName: 'Che',
    category: 'Cay cong nghiep',
    keywords: ['tra xanh'],
    excludeKeywords: ['matcha', 'tra sua', 'tra giam can', 'atiso', 'thao moc', 'bot'],
  },
  {
    slug: 'tea-avg',
    commodityName: 'Che',
    category: 'Cay cong nghiep',
    keywords: ['tra thai nguyen'],
    excludeKeywords: ['matcha', 'tra sua', 'tra giam can', 'atiso', 'thao moc', 'bot'],
  },
  {
    slug: 'tea-avg',
    commodityName: 'Che',
    category: 'Cay cong nghiep',
    keywords: ['shan tuyet'],
    excludeKeywords: ['matcha', 'tra sua', 'tra giam can', 'atiso', 'thao moc', 'bot'],
  },
  {
    slug: 'tea-avg',
    commodityName: 'Che',
    category: 'Cay cong nghiep',
    keywords: ['o long'],
    excludeKeywords: ['matcha', 'tra sua', 'tra giam can', 'atiso', 'thao moc', 'bot'],
  },
  {
    slug: 'sau-rieng',
    commodityName: 'Sau rieng',
    category: 'Trai cay',
    keywords: ['sau rieng', 'ri6'],
    excludeKeywords: ['banh pia', 'kem', 'say', 'mut', 'snack', 'keo', 'sua chua'],
  },
  {
    slug: 'sau-rieng',
    commodityName: 'Sau rieng',
    category: 'Trai cay',
    keywords: ['sau rieng', 'thai'],
    excludeKeywords: ['banh pia', 'kem', 'say', 'mut', 'snack', 'keo', 'sua chua'],
  },
  {
    slug: 'sau-rieng',
    commodityName: 'Sau rieng',
    category: 'Trai cay',
    keywords: ['sau rieng', 'monthong'],
    excludeKeywords: ['banh pia', 'kem', 'say', 'mut', 'snack', 'keo', 'sua chua'],
  },
  {
    slug: 'sau-rieng',
    commodityName: 'Sau rieng',
    category: 'Trai cay',
    keywords: ['sau rieng', 'dona'],
    excludeKeywords: ['banh pia', 'kem', 'say', 'mut', 'snack', 'keo', 'sua chua'],
  },
  {
    slug: 'sau-rieng',
    commodityName: 'Sau rieng',
    category: 'Trai cay',
    keywords: ['sau rieng'],
    excludeKeywords: ['banh pia', 'kem', 'say', 'mut', 'snack', 'keo', 'sua chua'],
  },
  { slug: 'cam-sanh', commodityName: 'Cam sanh', category: 'Trai cay', keywords: ['cam sanh'] },
  { slug: 'buoi-nam-roi', commodityName: 'Buoi Nam Roi', category: 'Trai cay', keywords: ['buoi nam roi'] },
  {
    slug: 'thanh-long',
    commodityName: 'Thanh long',
    category: 'Trai cay',
    keywords: ['thanh long'],
    excludeKeywords: ['say', 'mut', 'nuoc ep', 'sinh to', 'keo'],
  },
  {
    slug: 'dua-tuoi',
    commodityName: 'Dua tuoi',
    category: 'Trai cay',
    keywords: ['dua tuoi'],
    excludeKeywords: ['dau dua', 'nuoc cot', 'keo dua', 'com dua say', 'thach dua', 'dua kho'],
  },
  {
    slug: 'dua-tuoi',
    commodityName: 'Dua tuoi',
    category: 'Trai cay',
    keywords: ['dua xiem'],
    excludeKeywords: ['dau dua', 'nuoc cot', 'keo dua', 'com dua say', 'thach dua', 'dua kho'],
  },
  {
    slug: 'dua-tuoi',
    commodityName: 'Dua tuoi',
    category: 'Trai cay',
    keywords: ['dua ma lai'],
    excludeKeywords: ['dau dua', 'nuoc cot', 'keo dua', 'com dua say', 'thach dua', 'dua kho'],
  },
  {
    slug: 'dua-tuoi',
    commodityName: 'Dua tuoi',
    category: 'Trai cay',
    keywords: ['dua uong nuoc'],
    excludeKeywords: ['dau dua', 'nuoc cot', 'keo dua', 'com dua say', 'thach dua', 'dua kho'],
  },
  { slug: 'xoai', commodityName: 'Xoai', category: 'Trai cay', keywords: ['xoai'], excludeKeywords: ['say', 'mut'] },
  { slug: 'chuoi', commodityName: 'Chuoi', category: 'Trai cay', keywords: ['chuoi'], excludeKeywords: ['say', 'mut'] },
  { slug: 'mit', commodityName: 'Mit', category: 'Trai cay', keywords: ['mit'], excludeKeywords: ['say', 'mut'] },
  { slug: 'ca-chua', commodityName: 'Ca chua', category: 'Rau cu', keywords: ['ca chua'], excludeKeywords: ['sot', 'trai cay', 'cherry', 'ca chua bi'] },
  { slug: 'hanh-tay', commodityName: 'Hanh tay', category: 'Rau cu', keywords: ['hanh tay'] },
  { slug: 'toi', commodityName: 'Toi', category: 'Rau cu', keywords: ['toi'], excludeKeywords: ['toi den', 'mong toi', 'dui toi', 'canh toi'] },
  { slug: 'khoai-tay', commodityName: 'Khoai tay', category: 'Rau cu', keywords: ['khoai tay'] },
  { slug: 'bap-cai', commodityName: 'Bap cai', category: 'Rau cu', keywords: ['bap cai'], excludeKeywords: ['bap cai thao'] },
  { slug: 'rau-muong', commodityName: 'Rau muong', category: 'Rau cu', keywords: ['rau muong'] },
  { slug: 'cai-xanh', commodityName: 'Cai xanh', category: 'Rau cu', keywords: ['cai xanh'], excludeKeywords: ['bong cai', 'baby'] },
  { slug: 'cai-xanh', commodityName: 'Cai xanh', category: 'Rau cu', keywords: ['cai thia'] },
  { slug: 'ot', commodityName: 'Ot', category: 'Rau cu', keywords: ['ot'], excludeKeywords: ['tuong ot', 'chuong', 'ngot', 'palermo', 'baby'] },
  { slug: 'bi-do', commodityName: 'Bi do', category: 'Rau cu', keywords: ['bi do'], excludeKeywords: ['tao bi do', 'ca chua'] },
  { slug: 'khoai-lang', commodityName: 'Khoai lang', category: 'Rau cu', keywords: ['khoai lang'] },
  {
    slug: 'thit-heo',
    commodityName: 'Thit heo',
    category: 'Chan nuoi',
    keywords: ['heo'],
    excludeKeywords: ['xuc xich', 'cha bong', 'lap xuong', 'dong hop', 'vien', 'xay'],
  },
  {
    slug: 'shrimp',
    commodityName: 'Tom',
    category: 'Thuy san',
    keywords: ['tom'],
    excludeKeywords: ['kho', 'ruoc', 'nuoc mam', 'snack'],
  },
  {
    slug: 'ca-tra',
    commodityName: 'Ca tra',
    category: 'Thuy san',
    keywords: ['ca tra'],
    excludeKeywords: ['vien', 'xuc xich'],
  },
]

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsKeywordPhrase(haystack: string, needle: string) {
  const normalizedNeedle = foldText(needle)
  if (!normalizedNeedle) {
    return false
  }

  const phrasePattern = normalizedNeedle
    .split(/\s+/)
    .filter(Boolean)
    .map(part => escapeRegex(part))
    .join('\\s+')

  return new RegExp(`(^|[^a-z0-9])${phrasePattern}($|[^a-z0-9])`).test(haystack)
}

export function parseQuantityKgFromText(value: string | undefined | null) {
  if (!value) {
    return null
  }

  const folded = foldText(value)
  const multiKg = folded.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*kg\b/)
  if (multiKg) {
    return Number(multiKg[1].replace(',', '.')) * Number(multiKg[2].replace(',', '.'))
  }

  const multiGram = folded.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*(g|gr|gram)\b/)
  if (multiGram) {
    return (Number(multiGram[1].replace(',', '.')) * Number(multiGram[2].replace(',', '.'))) / 1000
  }

  const kgMatch = folded.match(/(\d+(?:[.,]\d+)?)\s*kg\b/)
  if (kgMatch) {
    return Number(kgMatch[1].replace(',', '.'))
  }

  const gramMatch = folded.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|gram)\b/)
  if (gramMatch) {
    return Number(gramMatch[1].replace(',', '.')) / 1000
  }

  return null
}

export function matchRetailCommodity(productName: string) {
  const folded = foldText(productName)

  for (const matcher of RETAIL_PRODUCT_MATCHERS) {
    if (!matcher.keywords.every(keyword => containsKeywordPhrase(folded, keyword))) {
      continue
    }

    if (matcher.excludeKeywords?.some(keyword => containsKeywordPhrase(folded, keyword))) {
      continue
    }

    return matcher
  }

  return null
}
