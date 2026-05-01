import * as XLSX from 'xlsx'
import { getCached, setCache } from './cacheService.js'

export type WorldCategory =
  | 'Tất cả'
  | 'Cà phê & Ca cao'
  | 'Lúa gạo & Ngũ cốc'
  | 'Gia vị & Cây CN'
  | 'Dầu thực vật'
  | 'Thủy sản'
  | 'Khác'

export interface WorldCommodityItem {
  id: string
  name: string
  nameEn: string
  symbol: string
  category: WorldCategory
  exchange: string
  unit: string
  priceCurrent: number
  priceYesterday: number
  priceLastWeek: number
  priceLastMonth: number
  change: number
  changePct: number
  low52w: number
  high52w: number
  currency: 'USD'
  lastUpdate: string
}

const PINK_SHEET_URLS = [
  'https://thedocs.worldbank.org/en/doc/18675f1d1639c7a34d463f59263ba0a2-0050012025/related/CMO-Historical-Data-Monthly.xlsx',
  'https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f744e55570-0350012021/related/CMO-Historical-Data-Monthly.xlsx',
] as const

const CACHE_KEY = 'world-prices'
const CACHE_TTL = 24 * 60 * 60 * 1000

interface PinkSheetMapping {
  id: string
  name: string
  nameEn: string
  symbol: string
  category: WorldCategory
  exchange: string
  unit: string
  pinkSheetLabels: string[]
}

type PinkSheetRow = {
  period: string
  values: Map<string, number>
}

const COMMODITY_MAPPINGS: PinkSheetMapping[] = [
  { id: 'coffee-robusta', name: 'Cà phê Robusta', nameEn: 'Robusta Coffee', symbol: 'RC', category: 'Cà phê & Ca cao', exchange: 'ICE London', unit: 'USD/kg', pinkSheetLabels: ['Coffee, Robusta'] },
  { id: 'coffee-arabica', name: 'Cà phê Arabica', nameEn: 'Arabica Coffee', symbol: 'KC', category: 'Cà phê & Ca cao', exchange: 'ICE US', unit: 'USD/kg', pinkSheetLabels: ['Coffee, Arabica'] },
  { id: 'cocoa', name: 'Ca cao', nameEn: 'Cocoa', symbol: 'CC', category: 'Cà phê & Ca cao', exchange: 'ICE US', unit: 'USD/kg', pinkSheetLabels: ['Cocoa'] },
  { id: 'rice-5pct', name: 'Gạo 5% tấm', nameEn: 'Rice 5% broken', symbol: 'RICE5', category: 'Lúa gạo & Ngũ cốc', exchange: 'Bangkok', unit: 'USD/tấn', pinkSheetLabels: ['Rice, Thai 5%'] },
  { id: 'rice-25pct', name: 'Gạo 25% tấm', nameEn: 'Rice 25% broken', symbol: 'RICE25', category: 'Lúa gạo & Ngũ cốc', exchange: 'Bangkok', unit: 'USD/tấn', pinkSheetLabels: ['Rice, Thai 25%'] },
  { id: 'rice-thai', name: 'Gạo Thái A1 Super', nameEn: 'Thai Rice A1 Super', symbol: 'RICETH', category: 'Lúa gạo & Ngũ cốc', exchange: 'Bangkok', unit: 'USD/tấn', pinkSheetLabels: ['Rice, Thai A.1'] },
  { id: 'wheat', name: 'Lúa mì', nameEn: 'Wheat (US HRW)', symbol: 'ZW', category: 'Lúa gạo & Ngũ cốc', exchange: 'CBOT', unit: 'USD/tấn', pinkSheetLabels: ['Wheat, US HRW'] },
  { id: 'corn', name: 'Ngô', nameEn: 'Corn (Maize)', symbol: 'ZC', category: 'Lúa gạo & Ngũ cốc', exchange: 'CBOT', unit: 'USD/tấn', pinkSheetLabels: ['Maize'] },
  { id: 'soybeans', name: 'Đậu tương', nameEn: 'Soybeans', symbol: 'ZS', category: 'Lúa gạo & Ngũ cốc', exchange: 'CBOT', unit: 'USD/tấn', pinkSheetLabels: ['Soybeans'] },
  { id: 'cassava', name: 'Sắn lát', nameEn: 'Cassava (Tapioca)', symbol: 'CASS', category: 'Lúa gạo & Ngũ cốc', exchange: 'Bangkok', unit: 'USD/tấn', pinkSheetLabels: [] },
  { id: 'pepper-black', name: 'Tiêu đen', nameEn: 'Black Pepper', symbol: 'PBLK', category: 'Gia vị & Cây CN', exchange: 'KPGM', unit: 'USD/kg', pinkSheetLabels: [] },
  { id: 'cashew', name: 'Hạt điều', nameEn: 'Cashew Nuts', symbol: 'CASHW', category: 'Gia vị & Cây CN', exchange: 'India', unit: 'USD/kg', pinkSheetLabels: [] },
  { id: 'rubber-rss3', name: 'Cao su RSS3', nameEn: 'Rubber RSS3', symbol: 'RSS3', category: 'Gia vị & Cây CN', exchange: 'SGX', unit: 'USD/kg', pinkSheetLabels: ['Rubber, RSS3'] },
  { id: 'rubber-tsr20', name: 'Cao su TSR20', nameEn: 'Rubber TSR20', symbol: 'TSR20', category: 'Gia vị & Cây CN', exchange: 'SGX', unit: 'USD/kg', pinkSheetLabels: ['Rubber, TSR20'] },
  { id: 'sugar', name: 'Đường thô', nameEn: 'Sugar (Raw)', symbol: 'SB', category: 'Gia vị & Cây CN', exchange: 'ICE US', unit: 'USD/kg', pinkSheetLabels: ['Sugar, world'] },
  { id: 'cotton', name: 'Bông vải', nameEn: 'Cotton (A Index)', symbol: 'CT', category: 'Gia vị & Cây CN', exchange: 'ICE US', unit: 'USD/kg', pinkSheetLabels: ['Cotton, A Index'] },
  { id: 'tea-avg', name: 'Chè', nameEn: 'Tea (Average)', symbol: 'TEA', category: 'Gia vị & Cây CN', exchange: 'Mombasa', unit: 'USD/kg', pinkSheetLabels: ['Tea, avg 3 auctions'] },
  { id: 'palm-oil', name: 'Dầu cọ', nameEn: 'Palm Oil', symbol: 'FCPO', category: 'Dầu thực vật', exchange: 'MDEX', unit: 'USD/tấn', pinkSheetLabels: ['Palm oil'] },
  { id: 'soybean-oil', name: 'Dầu đậu nành', nameEn: 'Soybean Oil', symbol: 'ZL', category: 'Dầu thực vật', exchange: 'CBOT', unit: 'USD/tấn', pinkSheetLabels: ['Soybean oil'] },
  { id: 'coconut-oil', name: 'Dầu dừa', nameEn: 'Coconut Oil', symbol: 'CNO', category: 'Dầu thực vật', exchange: 'Philippines', unit: 'USD/tấn', pinkSheetLabels: ['Coconut oil'] },
  { id: 'sunflower-oil', name: 'Dầu hướng dương', nameEn: 'Sunflower Oil', symbol: 'SFO', category: 'Dầu thực vật', exchange: 'EU', unit: 'USD/tấn', pinkSheetLabels: ['Sunflower oil'] },
  { id: 'groundnut-oil', name: 'Dầu lạc', nameEn: 'Groundnut Oil', symbol: 'GNO', category: 'Dầu thực vật', exchange: 'EU', unit: 'USD/tấn', pinkSheetLabels: ['Groundnut oil'] },
  { id: 'shrimp', name: 'Tôm (giá TB)', nameEn: 'Shrimp (Avg)', symbol: 'SHRMP', category: 'Thủy sản', exchange: 'Global', unit: 'USD/kg', pinkSheetLabels: ['Shrimps, Mexican'] },
  { id: 'pangasius', name: 'Cá tra fillet', nameEn: 'Pangasius Fillet', symbol: 'PANGA', category: 'Thủy sản', exchange: 'VN Export', unit: 'USD/kg', pinkSheetLabels: [] },
  { id: 'tuna', name: 'Cá ngừ', nameEn: 'Tuna (Skipjack)', symbol: 'TUNA', category: 'Thủy sản', exchange: 'Bangkok', unit: 'USD/tấn', pinkSheetLabels: [] },
  { id: 'orange-juice', name: 'Nước cam cô đặc', nameEn: 'Orange Juice FC', symbol: 'OJ', category: 'Khác', exchange: 'ICE US', unit: 'USD/kg', pinkSheetLabels: ['Orange'] },
  { id: 'urea', name: 'Phân bón Urê', nameEn: 'Urea', symbol: 'UREA', category: 'Khác', exchange: 'Global', unit: 'USD/tấn', pinkSheetLabels: ['Urea'] },
  { id: 'dap', name: 'Phân DAP', nameEn: 'DAP Fertilizer', symbol: 'DAP', category: 'Khác', exchange: 'Global', unit: 'USD/tấn', pinkSheetLabels: ['DAP'] },
  { id: 'lumber', name: 'Gỗ xẻ', nameEn: 'Sawnwood (Soft)', symbol: 'LBS', category: 'Khác', exchange: 'CME', unit: 'USD/m³', pinkSheetLabels: ['Sawnwood, Malaysian', 'Sawnwood, Cameroon', 'Logs, Malaysian', 'Logs, Cameroon'] },
]

function buildFallbackData(): WorldCommodityItem[] {
  const fallbackPrices: Record<string, { current: number; yesterday: number; lastWeek: number; lastMonth: number; low52w: number; high52w: number }> = {
    'coffee-robusta': { current: 4.82, yesterday: 4.75, lastWeek: 4.68, lastMonth: 4.42, low52w: 2.95, high52w: 5.15 },
    'coffee-arabica': { current: 7.85, yesterday: 7.72, lastWeek: 7.55, lastMonth: 7.12, low52w: 4.8, high52w: 8.42 },
    'cocoa': { current: 9.45, yesterday: 9.62, lastWeek: 9.28, lastMonth: 8.85, low52w: 3.2, high52w: 11.8 },
    'rice-5pct': { current: 518, yesterday: 515, lastWeek: 512, lastMonth: 525, low52w: 450, high52w: 650 },
    'rice-25pct': { current: 485, yesterday: 482, lastWeek: 478, lastMonth: 498, low52w: 415, high52w: 605 },
    'rice-thai': { current: 532, yesterday: 528, lastWeek: 525, lastMonth: 540, low52w: 460, high52w: 675 },
    'wheat': { current: 248, yesterday: 252, lastWeek: 245, lastMonth: 238, low52w: 195, high52w: 310 },
    'corn': { current: 198, yesterday: 196, lastWeek: 192, lastMonth: 185, low52w: 165, high52w: 235 },
    'soybeans': { current: 425, yesterday: 420, lastWeek: 418, lastMonth: 405, low52w: 370, high52w: 485 },
    'cassava': { current: 285, yesterday: 282, lastWeek: 278, lastMonth: 268, low52w: 220, high52w: 330 },
    'pepper-black': { current: 6.25, yesterday: 6.18, lastWeek: 6.05, lastMonth: 5.72, low52w: 3.85, high52w: 6.9 },
    'cashew': { current: 8.95, yesterday: 9.02, lastWeek: 8.8, lastMonth: 8.45, low52w: 6.2, high52w: 9.5 },
    'rubber-rss3': { current: 2.15, yesterday: 2.12, lastWeek: 2.08, lastMonth: 1.98, low52w: 1.45, high52w: 2.42 },
    'rubber-tsr20': { current: 1.92, yesterday: 1.9, lastWeek: 1.85, lastMonth: 1.78, low52w: 1.32, high52w: 2.18 },
    'sugar': { current: 0.48, yesterday: 0.47, lastWeek: 0.46, lastMonth: 0.44, low52w: 0.38, high52w: 0.55 },
    'cotton': { current: 1.95, yesterday: 1.92, lastWeek: 1.88, lastMonth: 1.82, low52w: 1.6, high52w: 2.2 },
    'tea-avg': { current: 3.28, yesterday: 3.25, lastWeek: 3.2, lastMonth: 3.05, low52w: 2.4, high52w: 3.65 },
    'palm-oil': { current: 892, yesterday: 885, lastWeek: 875, lastMonth: 845, low52w: 720, high52w: 1050 },
    'soybean-oil': { current: 1085, yesterday: 1078, lastWeek: 1062, lastMonth: 1025, low52w: 880, high52w: 1250 },
    'coconut-oil': { current: 1320, yesterday: 1305, lastWeek: 1280, lastMonth: 1210, low52w: 960, high52w: 1480 },
    'sunflower-oil': { current: 1045, yesterday: 1052, lastWeek: 1035, lastMonth: 995, low52w: 820, high52w: 1200 },
    'groundnut-oil': { current: 1580, yesterday: 1568, lastWeek: 1545, lastMonth: 1490, low52w: 1250, high52w: 1720 },
    'shrimp': { current: 12.5, yesterday: 12.35, lastWeek: 12.2, lastMonth: 11.8, low52w: 9.5, high52w: 14.2 },
    'pangasius': { current: 2.85, yesterday: 2.82, lastWeek: 2.78, lastMonth: 2.65, low52w: 2.2, high52w: 3.15 },
    'tuna': { current: 1650, yesterday: 1640, lastWeek: 1620, lastMonth: 1580, low52w: 1350, high52w: 1850 },
    'orange-juice': { current: 5.42, yesterday: 5.38, lastWeek: 5.25, lastMonth: 4.95, low52w: 3.8, high52w: 6.1 },
    'urea': { current: 312, yesterday: 315, lastWeek: 308, lastMonth: 295, low52w: 245, high52w: 385 },
    'dap': { current: 565, yesterday: 558, lastWeek: 548, lastMonth: 525, low52w: 450, high52w: 640 },
    'lumber': { current: 385, yesterday: 382, lastWeek: 378, lastMonth: 365, low52w: 310, high52w: 445 },
  }

  const now = new Date().toISOString()

  return COMMODITY_MAPPINGS.map(mapping => {
    const prices = fallbackPrices[mapping.id]
    const change = Number((prices.current - prices.yesterday).toFixed(4))
    const changePct = Number(((change / prices.yesterday) * 100).toFixed(2))

    return {
      id: mapping.id,
      name: mapping.name,
      nameEn: mapping.nameEn,
      symbol: mapping.symbol,
      category: mapping.category,
      exchange: mapping.exchange,
      unit: mapping.unit,
      priceCurrent: prices.current,
      priceYesterday: prices.yesterday,
      priceLastWeek: prices.lastWeek,
      priceLastMonth: prices.lastMonth,
      change,
      changePct,
      low52w: prices.low52w,
      high52w: prices.high52w,
      currency: 'USD' as const,
      lastUpdate: now,
    }
  })
}

function normalizePinkSheetLabel(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toNumericCell(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed === '…' || trimmed === '...') {
    return null
  }

  const numeric = Number(trimmed.replace(/,/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function parsePinkSheetRows(sheet: XLSX.WorkSheet) {
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  })

  const commodityRow = matrix[4] ?? []
  const dataRows = matrix.slice(6)
  const headers = commodityRow.map(value => normalizePinkSheetLabel(typeof value === 'string' ? value : null))
  const rows: PinkSheetRow[] = []

  for (const row of dataRows) {
    const period = typeof row[0] === 'string' ? row[0].trim() : ''
    if (!/^\d{4}M\d{2}$/.test(period)) {
      continue
    }

    const values = new Map<string, number>()
    for (let index = 1; index < headers.length; index += 1) {
      const header = headers[index]
      if (!header) {
        continue
      }

      const numeric = toNumericCell(row[index])
      if (numeric !== null) {
        values.set(header, numeric)
      }
    }

    rows.push({ period, values })
  }

  return rows
}

function findCommoditySeries(rows: PinkSheetRow[], labels: string[]) {
  const normalizedLabels = labels.map(label => normalizePinkSheetLabel(label))
  return rows
    .map(row => {
      for (const label of normalizedLabels) {
        const value = row.values.get(label)
        if (typeof value === 'number') {
          return {
            period: row.period,
            value,
          }
        }
      }

      return null
    })
    .filter((entry): entry is { period: string; value: number } => entry !== null)
}

async function fetchPinkSheetWorkbook() {
  for (const url of PINK_SHEET_URLS) {
    console.log('[WorldBank] Fetching Pink Sheet from:', url)
    const response = await fetch(url)

    if (!response.ok) {
      console.error('[WorldBank] HTTP Error:', response.status, url)
      continue
    }

    return response.arrayBuffer()
  }

  return null
}

async function fetchAndParsePinkSheet(): Promise<WorldCommodityItem[] | null> {
  try {
    const buffer = await fetchPinkSheetWorkbook()
    if (!buffer) {
      return null
    }

    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames.find(
      name => name.toLowerCase().includes('monthly') && name.toLowerCase().includes('price'),
    ) ?? workbook.SheetNames[0]

    const sheet = workbook.Sheets[sheetName]
    if (!sheet) {
      console.error('[WorldBank] Sheet not found:', sheetName)
      return null
    }

    const parsedRows = parsePinkSheetRows(sheet)
    if (parsedRows.length < 3) {
      console.warn('[WorldBank] Not enough data rows in sheet')
      return null
    }

    const now = new Date().toISOString()
    const results: WorldCommodityItem[] = []

    for (const mapping of COMMODITY_MAPPINGS) {
      if (mapping.pinkSheetLabels.length === 0) {
        continue
      }

      const series = findCommoditySeries(parsedRows, mapping.pinkSheetLabels)
      const latest = series.at(-1)
      const previous = series.at(-2)
      const previous2 = series.at(-3)
      if (!latest || !previous) {
        continue
      }

      const trailingWindow = series.slice(-13)
      const low52w = Math.min(...trailingWindow.map(entry => entry.value))
      const high52w = Math.max(...trailingWindow.map(entry => entry.value))
      const change = Number((latest.value - previous.value).toFixed(4))
      const changePct = Number(((change / previous.value) * 100).toFixed(2))

      results.push({
        id: mapping.id,
        name: mapping.name,
        nameEn: mapping.nameEn,
        symbol: mapping.symbol,
        category: mapping.category,
        exchange: mapping.exchange,
        unit: mapping.unit,
        priceCurrent: latest.value,
        priceYesterday: previous.value,
        priceLastWeek: previous.value,
        priceLastMonth: previous2?.value ?? previous.value,
        change,
        changePct,
        low52w,
        high52w,
        currency: 'USD',
        lastUpdate: now,
      })
    }

    console.log(`[WorldBank] Parsed ${results.length} commodities from Pink Sheet`)
    return results.length > 0 ? results : null
  } catch (error) {
    console.error('[WorldBank] Failed to fetch/parse Pink Sheet:', error)
    return null
  }
}

export async function getWorldPrices(forceRefresh = false): Promise<WorldCommodityItem[]> {
  const cached = !forceRefresh ? getCached<WorldCommodityItem[]>(CACHE_KEY) : null
  if (cached) {
    console.log('[WorldPrices] Serving from cache')
    return cached
  }

  const liveData = await fetchAndParsePinkSheet()
  if (liveData && liveData.length > 0) {
    const fallback = buildFallbackData()
    const liveIds = new Set(liveData.map(item => item.id))
    const merged = [
      ...liveData,
      ...fallback.filter(item => !liveIds.has(item.id)),
    ]

    setCache(CACHE_KEY, merged, CACHE_TTL)
    console.log(`[WorldPrices] Cached ${merged.length} items (${liveData.length} live + ${merged.length - liveData.length} fallback)`)
    return merged
  }

  console.log('[WorldPrices] Using fallback static data')
  const fallback = buildFallbackData()
  setCache(CACHE_KEY, fallback, 4 * 60 * 60 * 1000)
  return fallback
}

export function getCategories(): WorldCategory[] {
  return ['Tất cả', 'Cà phê & Ca cao', 'Lúa gạo & Ngũ cốc', 'Gia vị & Cây CN', 'Dầu thực vật', 'Thủy sản', 'Khác']
}
