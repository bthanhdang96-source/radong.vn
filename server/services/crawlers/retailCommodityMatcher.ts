import { foldText } from './common.js'

export type RetailCommodityMatcher = {
  slug: string
  commodityName: string
  category: string
  keywords: string[]
  excludeKeywords?: string[]
}

export const RETAIL_PRODUCT_MATCHERS: RetailCommodityMatcher[] = [
  { slug: 'cam-sanh', commodityName: 'Cam sanh', category: 'Trai cay', keywords: ['cam sanh'] },
  { slug: 'buoi-nam-roi', commodityName: 'Buoi Nam Roi', category: 'Trai cay', keywords: ['buoi nam roi'] },
  { slug: 'xoai', commodityName: 'Xoai', category: 'Trai cay', keywords: ['xoai'], excludeKeywords: ['say', 'mut'] },
  { slug: 'chuoi', commodityName: 'Chuoi', category: 'Trai cay', keywords: ['chuoi'], excludeKeywords: ['say', 'mut'] },
  { slug: 'mit', commodityName: 'Mit', category: 'Trai cay', keywords: ['mit'], excludeKeywords: ['say', 'mut'] },
  { slug: 'ca-chua', commodityName: 'Ca chua', category: 'Rau cu', keywords: ['ca chua'], excludeKeywords: ['sot'] },
  { slug: 'hanh-tay', commodityName: 'Hanh tay', category: 'Rau cu', keywords: ['hanh tay'] },
  { slug: 'toi', commodityName: 'Toi', category: 'Rau cu', keywords: ['toi'], excludeKeywords: ['toi den'] },
  { slug: 'khoai-tay', commodityName: 'Khoai tay', category: 'Rau cu', keywords: ['khoai tay'] },
  { slug: 'bap-cai', commodityName: 'Bap cai', category: 'Rau cu', keywords: ['bap cai'] },
  { slug: 'rau-muong', commodityName: 'Rau muong', category: 'Rau cu', keywords: ['rau muong'] },
  { slug: 'cai-xanh', commodityName: 'Cai xanh', category: 'Rau cu', keywords: ['cai xanh'] },
  { slug: 'cai-xanh', commodityName: 'Cai xanh', category: 'Rau cu', keywords: ['cai bo xoi'] },
  { slug: 'cai-xanh', commodityName: 'Cai xanh', category: 'Rau cu', keywords: ['cai thia'] },
  { slug: 'ot', commodityName: 'Ot', category: 'Rau cu', keywords: ['ot'], excludeKeywords: ['tuong ot'] },
  { slug: 'bi-do', commodityName: 'Bi do', category: 'Rau cu', keywords: ['bi do'] },
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
    if (!matcher.keywords.every(keyword => folded.includes(keyword))) {
      continue
    }

    if (matcher.excludeKeywords?.some(keyword => folded.includes(keyword))) {
      continue
    }

    return matcher
  }

  return null
}
