import * as cheerio from 'cheerio'
import { fetchPinkSheetWorldPrices, type WorldCommodityItem } from './worldBankService.js'

export type WorldPriceGranularity = 'daily' | 'weekly' | 'monthly' | 'period' | 'as_published' | 'unknown'
export type WorldPriceTemporalCoverage =
  | 'exchange_session'
  | 'calendar_day'
  | 'report_period'
  | 'calendar_week'
  | 'calendar_month'
  | 'as_published'
  | 'unknown'
export type WorldPriceBenchmarkType = 'indicator' | 'futures' | 'spot_export_benchmark' | 'monthly_index' | 'api'

export type WorldPriceProviderItem = WorldCommodityItem & {
  observedOn: string
  crawlRecordedAt: string
  dataGranularity: WorldPriceGranularity
  temporalCoverage: WorldPriceTemporalCoverage
  benchmarkType: WorldPriceBenchmarkType
  sourceId: string
  sourceUrl: string
  sourceLicenseNote: string
  qualityGrade: string
  contractSymbol: string
  sourceObservationLabel: string
}

export interface WorldPriceProvider {
  id: string
  fetch(forceRefresh?: boolean): Promise<WorldPriceProviderItem[]>
}

const ICO_URL = 'https://ico.org/resources/public-market-information/'
const IPC_URL = 'https://www.ipcnet.org/index.php?act='
const ANRPC_URL = 'https://www.anrpc.org/future-price'
const THAI_RICE_URL = 'http://www.thairiceexporters.or.th/price.htm'
const NASDAQ_DATA_LINK_URL = 'https://docs.data.nasdaq.com/docs/getting-started'
const WORLD_BANK_SOURCE_URL =
  'https://thedocs.worldbank.org/en/doc/18675f1d1639c7a34d463f59263ba0a2-0050012025/related/CMO-Historical-Data-Monthly.xlsx'

const DEFAULT_TIMEOUT_MS = 15_000
const WORLD_PRICE_CRAWL_RETRY_COUNT = 1

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function toNumber(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const numeric = Number(value.replace(/,/g, '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function roundNumber(value: number, digits = 4) {
  return Number(value.toFixed(digits))
}

function decodeHtml(value: string) {
  return value
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/&#8211;/g, '-')
    .replace(/&#038;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

function normalizeWhitespace(value: string) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim()
}

function htmlToSearchText(html: string) {
  const decoded = decodeHtml(html)
  const stripped = decoded.replace(/<[^>]+>/g, ' ')
  return normalizeWhitespace(`${stripped} ${cheerio.load(decoded).text()}`)
}

function normalizeDateKey(value: string | null | undefined, fallback = todayKey()) {
  const text = normalizeWhitespace(value ?? '')
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`
  }

  const slash = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/)
  if (slash) {
    const day = slash[1].padStart(2, '0')
    const month = slash[2].padStart(2, '0')
    return `${slash[3]}-${month}-${day}`
  }

  return fallback
}

function normalizeEnglishMonthDate(value: string | null | undefined) {
  const text = normalizeWhitespace(value ?? '')
  const match = text.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i)
  if (!match) {
    return null
  }

  const monthIndex =
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
      match[2].slice(0, 3).toLowerCase(),
    ) + 1
  if (monthIndex < 1) {
    return null
  }

  return `${match[3]}-${String(monthIndex).padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

function calculatePreviousFromPct(current: number, pct: number | null) {
  if (pct === null || pct === -100) {
    return current
  }

  return roundNumber(current / (1 + pct / 100))
}

function makeItem(
  input: Omit<
    WorldPriceProviderItem,
    | 'priceLastMonth'
    | 'low52w'
    | 'high52w'
    | 'currency'
    | 'lastUpdate'
    | 'crawlRecordedAt'
    | 'sourceLicenseNote'
  > & {
    sourceLicenseNote?: string
    crawlRecordedAt?: string
    priceLastMonth?: number
    low52w?: number
    high52w?: number
  },
): WorldPriceProviderItem {
  const crawlRecordedAt = input.crawlRecordedAt ?? new Date().toISOString()
  return {
    ...input,
    priceLastMonth: input.priceLastMonth ?? input.priceLastWeek,
    low52w: input.low52w ?? input.priceCurrent,
    high52w: input.high52w ?? input.priceCurrent,
    currency: 'USD',
    lastUpdate: `${input.observedOn}T00:00:00.000Z`,
    crawlRecordedAt,
    sourceLicenseNote: input.sourceLicenseNote ?? 'Public facts only; retain attribution and source URL.',
  }
}

async function fetchText(url: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'nongsanvn-world-price-crawler/1.0 (+https://nongsanvn.vn)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    return response.text()
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchProviderText(url: string) {
  let lastError: unknown
  for (let attempt = 0; attempt <= WORLD_PRICE_CRAWL_RETRY_COUNT; attempt += 1) {
    try {
      return await fetchText(url)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`)
}

function extractLabeledPrice(html: string, label: string) {
  const decoded = htmlToSearchText(html)
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = decoded.match(new RegExp(`${escapedLabel}\\s+([0-9][0-9,.]*)\\s+([+-]?[0-9][0-9,.]*)%`, 'i'))
  if (!match) {
    return null
  }

  return {
    price: toNumber(match[1]),
    changePct: toNumber(match[2]),
  }
}

export function parseIcoCoffeeDailyPrices(html: string, crawledAt = new Date().toISOString()) {
  const observedOn = normalizeDateKey(html.match(/Served from:[\s\S]*?@\s*(20\d{2}-\d{2}-\d{2})/)?.[1], crawledAt.slice(0, 10))
  const robusta = extractLabeledPrice(html, 'Robustas')
  const arabica = extractLabeledPrice(html, 'Brazilian Naturals') ?? extractLabeledPrice(html, 'Other Milds')
  const items: WorldPriceProviderItem[] = []

  if (robusta?.price) {
    const previous = calculatePreviousFromPct(robusta.price, robusta.changePct)
    items.push(
      makeItem({
        id: 'coffee-robusta',
        name: 'Ca phe Robusta',
        nameEn: 'Robusta Coffee',
        symbol: 'ICO-ROBUSTA',
        category: 'Cà phê & Ca cao',
        exchange: 'ICO',
        unit: 'usc/lb',
        priceCurrent: robusta.price,
        priceYesterday: previous,
        priceLastWeek: previous,
        change: roundNumber(robusta.price - previous),
        changePct: robusta.changePct ?? 0,
        observedOn,
        dataGranularity: 'daily',
        temporalCoverage: 'calendar_day',
        benchmarkType: 'indicator',
        sourceId: 'ico_daily',
        sourceUrl: ICO_URL,
        qualityGrade: 'Robustas indicator',
        contractSymbol: 'ICO_ROBUSTAS',
        sourceObservationLabel: `ICO Robustas indicator ${observedOn}`,
        crawlRecordedAt: crawledAt,
      }),
    )
  }

  if (arabica?.price) {
    const previous = calculatePreviousFromPct(arabica.price, arabica.changePct)
    items.push(
      makeItem({
        id: 'coffee-arabica',
        name: 'Ca phe Arabica',
        nameEn: 'Arabica Coffee',
        symbol: 'ICO-ARABICA',
        category: 'Cà phê & Ca cao',
        exchange: 'ICO',
        unit: 'usc/lb',
        priceCurrent: arabica.price,
        priceYesterday: previous,
        priceLastWeek: previous,
        change: roundNumber(arabica.price - previous),
        changePct: arabica.changePct ?? 0,
        observedOn,
        dataGranularity: 'daily',
        temporalCoverage: 'calendar_day',
        benchmarkType: 'indicator',
        sourceId: 'ico_daily',
        sourceUrl: ICO_URL,
        qualityGrade: 'Arabica group indicator',
        contractSymbol: 'ICO_ARABICA_GROUP',
        sourceObservationLabel: `ICO Arabica group indicator ${observedOn}`,
        crawlRecordedAt: crawledAt,
      }),
    )
  }

  return items
}

export function parseIpcPepperDailyPrices(html: string, crawledAt = new Date().toISOString()) {
  const observedOn = normalizeDateKey(html.match(/DAILY PRICES?\s+([0-9/-]{8,10})/i)?.[1], crawledAt.slice(0, 10))
  const decoded = htmlToSearchText(html)
  const match =
    decoded.match(/Viet\s*Nam\s*-\s*Black\s*Pepper\s*500\s*g\/l\s+([0-9][0-9,.]*)[\s-]+([+-]?[0-9][0-9,.]*)%/i)
  const price = toNumber(match?.[1])
  if (!price) {
    return []
  }

  const changePct = toNumber(match?.[2]) ?? 0
  const previous = calculatePreviousFromPct(price, changePct)
  return [
    makeItem({
      id: 'pepper-black',
      name: 'Tieu den',
      nameEn: 'Black Pepper',
      symbol: 'IPC-VN-BP500',
      category: 'Gia vị & Cây CN',
      exchange: 'IPC',
      unit: 'USD/MT',
      priceCurrent: price,
      priceYesterday: previous,
      priceLastWeek: previous,
      change: roundNumber(price - previous),
      changePct,
      observedOn,
      dataGranularity: 'daily',
      temporalCoverage: 'calendar_day',
      benchmarkType: 'spot_export_benchmark',
      sourceId: 'ipc_daily',
      sourceUrl: IPC_URL,
      sourceLicenseNote: 'IPC public daily price facts only; do not copy narrative text.',
      qualityGrade: 'Viet Nam Black Pepper 500 g/l',
      contractSymbol: 'IPC_VN_BLACK_500GL',
      sourceObservationLabel: `IPC Viet Nam black pepper 500 g/l ${observedOn}`,
      crawlRecordedAt: crawledAt,
    }),
  ]
}

export function parseAnrpcRubberDailyPrices(html: string, crawledAt = new Date().toISOString()) {
  const decoded = normalizeWhitespace(html)
  const marketRow = [...decoded.matchAll(/\{[^{}]*"title_fld":"Futures Market[^{}]*\}/gi)]
    .map(match => match[0])
    .at(0)
  const marketDate2 = marketRow?.match(/"date2":"([^"]+)"/i)?.[1]
  const observedOn = normalizeDateKey(marketDate2, crawledAt.slice(0, 10))
  const sicomRow = [...decoded.matchAll(/\{[^{}]*"title_fld":"SICOM \(TSR20\)"[^{}]*\}/gi)]
    .map(match => match[0])
    .at(0)
  const fallbackMatch = decoded.match(/SICOM \(TSR20\)\s+([0-9][0-9,.]*)\s+([0-9][0-9,.]*)/i)
  const previous = toNumber(sicomRow?.match(/"date1":"([^"]+)"/i)?.[1] ?? fallbackMatch?.[1])
  const current = toNumber(sicomRow?.match(/"date2":"([^"]+)"/i)?.[1] ?? fallbackMatch?.[2])
  if (!current) {
    return []
  }

  const previousPrice = previous ?? current
  const changePct = previousPrice > 0 ? roundNumber(((current - previousPrice) / previousPrice) * 100, 2) : 0
  return [
    makeItem({
      id: 'rubber-tsr20',
      name: 'Cao su TSR20',
      nameEn: 'Rubber TSR20',
      symbol: 'SICOM-TSR20',
      category: 'Gia vị & Cây CN',
      exchange: 'ANRPC/SICOM SGX',
      unit: 'USD/kg',
      priceCurrent: current,
      priceYesterday: previousPrice,
      priceLastWeek: previousPrice,
      change: roundNumber(current - previousPrice),
      changePct,
      observedOn,
      dataGranularity: 'daily',
      temporalCoverage: 'exchange_session',
      benchmarkType: 'futures',
      sourceId: 'anrpc_future_price',
      sourceUrl: ANRPC_URL,
      qualityGrade: 'SICOM TSR20 most-traded contract settlement',
      contractSymbol: 'SICOM_TSR20',
      sourceObservationLabel: `ANRPC SICOM TSR20 futures ${observedOn}`,
      crawlRecordedAt: crawledAt,
    }),
  ]
}

export function parseThaiRiceExportPrices(html: string, crawledAt = new Date().toISOString()) {
  const text = htmlToSearchText(html)
  const observedOn =
    [...text.matchAll(/\b(\d{1,2}[/-]\d{1,2}[/-]20\d{2})\b/g)]
      .map(match => normalizeDateKey(match[1], crawledAt.slice(0, 10)))
      .at(-1) ??
    [...text.matchAll(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2})\b/gi)]
      .map(match => normalizeEnglishMonthDate(match[1]))
      .filter((value): value is string => typeof value === 'string')
      .at(-1) ??
    normalizeDateKey(text, crawledAt.slice(0, 10))
  const specs = [
    { id: 'rice-5pct', labels: ['White Rice 5%'], displayLabel: 'White Rice 5%', contractSymbol: 'THAI_WHITE_RICE_5PCT' },
    { id: 'rice-25pct', labels: ['White Rice 25%'], displayLabel: 'White Rice 25%', contractSymbol: 'THAI_WHITE_RICE_25PCT' },
    {
      id: 'rice-thai',
      labels: ['White Broken Rice A.1 Super', 'A1 Super', 'A.1 Super'],
      displayLabel: 'White Broken Rice A.1 Super',
      contractSymbol: 'THAI_A1_SUPER',
    },
  ] as const
  const boundaryLabels = [
    ...specs.flatMap(spec => spec.labels),
    'Thai Hom Mali',
    'Thai Jasmine',
    'White Glutinous Rice',
    'Parboiled Rice',
    'Cargo Rice',
  ]

  return specs.flatMap(spec => {
    const price = extractThaiRicePrice(text, spec.labels, boundaryLabels)
    if (!price) {
      return []
    }

    return [
      makeItem({
        id: spec.id,
        name: spec.displayLabel,
        nameEn: spec.displayLabel,
        symbol: spec.contractSymbol,
        category: 'Lúa gạo & Ngũ cốc',
        exchange: 'Thai Rice Exporters Association',
        unit: 'USD/MT',
        priceCurrent: price,
        priceYesterday: price,
        priceLastWeek: price,
        change: 0,
        changePct: 0,
        observedOn,
        dataGranularity: 'as_published',
        temporalCoverage: 'as_published',
        benchmarkType: 'spot_export_benchmark',
        sourceId: 'thai_rice_exporters',
        sourceUrl: THAI_RICE_URL,
        qualityGrade: spec.displayLabel,
        contractSymbol: spec.contractSymbol,
        sourceObservationLabel: `Thai rice FOB ${spec.displayLabel} ${observedOn}`,
        crawlRecordedAt: crawledAt,
      }),
    ]
  })
}

function extractThaiRicePrice(text: string, labels: readonly string[], boundaryLabels: readonly string[]) {
  for (const label of labels) {
    const index = text.toLowerCase().indexOf(label.toLowerCase())
    if (index < 0) {
      continue
    }

    const segmentStart = index + label.length
    const nextBoundary = boundaryLabels
      .filter(boundaryLabel => boundaryLabel.toLowerCase() !== label.toLowerCase())
      .map(boundaryLabel => text.toLowerCase().indexOf(boundaryLabel.toLowerCase(), segmentStart))
      .filter(boundaryIndex => boundaryIndex > segmentStart)
      .sort((left, right) => left - right)[0]
    const segment = text.slice(segmentStart, Math.min(nextBoundary ?? segmentStart + 160, segmentStart + 160))
    const values = [...segment.matchAll(/\b([0-9]{3,5}(?:\.[0-9]+)?)\b/g)].map(match => toNumber(match[1]))
    const price = values.filter((value): value is number => typeof value === 'number').at(-1)
    if (price) {
      return price
    }
  }

  return null
}

export function markPinkSheetMonthlyItems(items: WorldCommodityItem[] | null, crawledAt = new Date().toISOString()) {
  return (items ?? []).map(item =>
    makeItem({
      ...item,
      priceYesterday: item.priceCurrent,
      priceLastWeek: item.priceCurrent,
      change: 0,
      changePct: 0,
      observedOn: item.sourceObservedOn ?? item.lastUpdate.slice(0, 10),
      dataGranularity: 'monthly',
      temporalCoverage: 'calendar_month',
      benchmarkType: 'monthly_index',
      sourceId: 'world_bank_pink_sheet',
      sourceUrl: WORLD_BANK_SOURCE_URL,
      sourceLicenseNote: 'World Bank Pink Sheet monthly commodity price facts; monthly fallback only.',
      qualityGrade: item.nameEn,
      contractSymbol: `WB_${item.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
      sourceObservationLabel: `World Bank Pink Sheet ${item.sourcePeriod ?? 'monthly'} ${item.nameEn}`,
      crawlRecordedAt: crawledAt,
    }),
  )
}

export const icoCoffeeDailyProvider: WorldPriceProvider = {
  id: 'ico_daily',
  async fetch() {
    const crawledAt = new Date().toISOString()
    return parseIcoCoffeeDailyPrices(await fetchProviderText(ICO_URL), crawledAt)
  },
}

export const ipcPepperDailyProvider: WorldPriceProvider = {
  id: 'ipc_daily',
  async fetch() {
    const crawledAt = new Date().toISOString()
    return parseIpcPepperDailyPrices(await fetchProviderText(IPC_URL), crawledAt)
  },
}

export const anrpcRubberDailyProvider: WorldPriceProvider = {
  id: 'anrpc_future_price',
  async fetch() {
    const crawledAt = new Date().toISOString()
    return parseAnrpcRubberDailyPrices(await fetchProviderText(ANRPC_URL), crawledAt)
  },
}

export const thaiRiceWeeklyProvider: WorldPriceProvider = {
  id: 'thai_rice_exporters',
  async fetch() {
    const crawledAt = new Date().toISOString()
    return parseThaiRiceExportPrices(await fetchProviderText(THAI_RICE_URL), crawledAt)
  },
}

export const worldBankMonthlyProvider: WorldPriceProvider = {
  id: 'world_bank_pink_sheet',
  async fetch(forceRefresh = false) {
    const crawledAt = new Date().toISOString()
    return markPinkSheetMonthlyItems(await fetchPinkSheetWorldPrices(), crawledAt)
  },
}

export const nasdaqDataLinkProvider: WorldPriceProvider = {
  id: 'nasdaq_data_link',
  async fetch() {
    if (!process.env.NASDAQ_DATA_LINK_API_KEY) {
      return []
    }

    return [
      makeItem({
        id: 'nasdaq-data-link-placeholder',
        name: 'Nasdaq Data Link',
        nameEn: 'Nasdaq Data Link',
        symbol: 'NDL',
        category: 'Khác',
        exchange: 'Nasdaq Data Link',
        unit: 'USD/kg',
        priceCurrent: 1,
        priceYesterday: 1,
        priceLastWeek: 1,
        change: 0,
        changePct: 0,
        observedOn: todayKey(),
        dataGranularity: 'unknown',
        temporalCoverage: 'unknown',
        benchmarkType: 'api',
        sourceId: 'nasdaq_data_link',
        sourceUrl: NASDAQ_DATA_LINK_URL,
        sourceLicenseNote: 'Disabled until specific licensed dataset symbols are configured.',
        qualityGrade: 'placeholder',
        contractSymbol: 'NDL_PLACEHOLDER',
        sourceObservationLabel: 'Nasdaq Data Link placeholder',
      }),
    ].filter(() => false)
  },
}

export const WORLD_PRICE_PROVIDERS: WorldPriceProvider[] = [
  icoCoffeeDailyProvider,
  ipcPepperDailyProvider,
  anrpcRubberDailyProvider,
  thaiRiceWeeklyProvider,
  worldBankMonthlyProvider,
  nasdaqDataLinkProvider,
]

export async function fetchWorldPriceProviderItems(forceRefresh = false) {
  const results = await Promise.allSettled(WORLD_PRICE_PROVIDERS.map(provider => provider.fetch(forceRefresh)))
  const items: WorldPriceProviderItem[] = []
  const errors: string[] = []

  results.forEach((result, index) => {
    const provider = WORLD_PRICE_PROVIDERS[index]
    if (result.status === 'fulfilled') {
      items.push(...result.value)
    } else {
      errors.push(`${provider.id}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
    }
  })

  return { items: selectPreferredWorldPriceItems(items), errors }
}

function getGranularityRank(item: WorldPriceProviderItem) {
  switch (item.dataGranularity) {
    case 'daily':
      return 5
    case 'as_published':
      return 4
    case 'weekly':
      return 3
    case 'monthly':
      return 2
    default:
      return 1
  }
}

export function selectPreferredWorldPriceItems(items: WorldPriceProviderItem[]) {
  const byKey = new Map<string, WorldPriceProviderItem>()

  for (const item of items) {
    const existing = byKey.get(item.id)
    if (
      !existing ||
      getGranularityRank(item) > getGranularityRank(existing) ||
      (getGranularityRank(item) === getGranularityRank(existing) && item.observedOn > existing.observedOn)
    ) {
      byKey.set(item.id, item)
    }
  }

  return [...byKey.values()]
}
