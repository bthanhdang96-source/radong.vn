import { useEffect, useMemo, useState } from 'react'
import { buildApiUrl } from '../lib/api'
import './ExchangeRatesLookupPage.css'

type ExchangeRateHistoryPoint = {
  date: string
  vndPerUnit: number
}

type ExchangeRateItem = {
  currencyCode: string
  currencyName: string
  latestVndPerUnit: number
  change1dPct: number | null
  change7dPct: number | null
  change30dPct: number | null
  change365dPct: number | null
  history: ExchangeRateHistoryPoint[]
  source: {
    id: string
    url: string
    license: string
  }
}

type ExchangeRateApiResponse = {
  success: boolean
  status: 'live' | 'fallback'
  sourceMode: 'supabase_curated' | 'live_provider'
  baseCurrency: 'VND'
  days: number
  latestObservedOn: string | null
  refreshedAt: string | null
  availableCodes: string[]
  items: ExchangeRateItem[]
  errors: string[]
  error?: string
}

type SortKey = 'priority' | 'code_asc' | 'rate_desc' | 'change_1d_desc' | 'change_30d_desc'

const DAY_OPTIONS = [30, 90, 365]
const IMPORTANT_CURRENCY_ORDER = ['USD', 'CNY', 'EUR', 'JPY', 'KRW', 'SGD', 'THB', 'AUD', 'CAD', 'GBP'] as const
const IMPORTANT_CURRENCY_ORDER_MAP: Map<string, number> = new Map(
  IMPORTANT_CURRENCY_ORDER.map((code, index) => [code, index]),
)

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'priority', label: 'Đồng tiền quan trọng' },
  { key: 'code_asc', label: 'Mã tiền tệ (A-Z)' },
  { key: 'rate_desc', label: 'Tỷ giá cao nhất' },
  { key: 'change_1d_desc', label: 'Biến động 1 ngày' },
  { key: 'change_30d_desc', label: 'Biến động 30 ngày' },
]

function compareByPriority(leftCode: string, rightCode: string) {
  const leftPriority = IMPORTANT_CURRENCY_ORDER_MAP.get(leftCode) ?? Number.POSITIVE_INFINITY
  const rightPriority = IMPORTANT_CURRENCY_ORDER_MAP.get(rightCode) ?? Number.POSITIVE_INFINITY
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority
  }

  return leftCode.localeCompare(rightCode)
}

function formatVnd(value: number) {
  return value.toLocaleString('vi-VN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatPct(value: number | null) {
  if (value === null) {
    return '--'
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function changeTone(value: number | null) {
  if (value === null) {
    return 'neutral'
  }

  if (value > 0) {
    return 'up'
  }

  if (value < 0) {
    return 'down'
  }

  return 'neutral'
}

function Sparkline({ history }: { history: ExchangeRateHistoryPoint[] }) {
  if (history.length < 2) {
    return <span className="exchange-rate-page__spark-empty">--</span>
  }

  const width = 120
  const height = 38
  const values = history.map(point => point.vndPerUnit)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)
  const stepX = width / Math.max(1, history.length - 1)

  const points = history.map((point, index) => {
    const x = index * stepX
    const y = height - ((point.vndPerUnit - min) / range) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const tone = history[history.length - 1].vndPerUnit >= history[0].vndPerUnit ? 'up' : 'down'
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`exchange-rate-page__spark exchange-rate-page__spark--${tone}`} aria-hidden="true">
      <polyline points={points.join(' ')} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function ExchangeRatesLookupPage() {
  const [days, setDays] = useState(365)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [payload, setPayload] = useState<ExchangeRateApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fromCode, setFromCode] = useState('USD')
  const [toCode, setToCode] = useState('VND')
  const [amount, setAmount] = useState('1')

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function loadData() {
      setLoading(true)
      try {
        const response = await fetch(buildApiUrl(`/api/exchange-rates?days=${days}`), {
          signal: controller.signal,
        })
        const json: ExchangeRateApiResponse = await response.json()
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? 'Không thể tải dữ liệu tỷ giá')
        }

        if (!active) {
          return
        }

        setPayload(json)
        setError(null)
      } catch (fetchError) {
        if (!active || controller.signal.aborted) {
          return
        }

        setPayload(null)
        setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải dữ liệu tỷ giá')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      active = false
      controller.abort()
    }
  }, [days])

  const rateLookup = useMemo(() => {
    const map = new Map<string, number>()
    map.set('VND', 1)
    for (const item of payload?.items ?? []) {
      map.set(item.currencyCode, item.latestVndPerUnit)
    }
    return map
  }, [payload])

  const orderedCodes = useMemo(() => {
    const sourceCodes = payload?.availableCodes ?? []
    return [...sourceCodes].sort(compareByPriority)
  }, [payload])

  useEffect(() => {
    if (!payload || orderedCodes.length === 0) {
      return
    }

    if (!rateLookup.has(fromCode)) {
      setFromCode(orderedCodes[0])
    }

    if (!rateLookup.has(toCode)) {
      setToCode('VND')
    }
  }, [fromCode, orderedCodes, payload, rateLookup, toCode])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    const items = (payload?.items ?? []).filter(item => {
      if (!query) {
        return true
      }

      return item.currencyCode.toLowerCase().includes(query) || item.currencyName.toLowerCase().includes(query)
    })

    const copy = [...items]
    copy.sort((left, right) => {
      if (sortKey === 'priority') {
        return compareByPriority(left.currencyCode, right.currencyCode)
      }

      if (sortKey === 'code_asc') {
        return left.currencyCode.localeCompare(right.currencyCode)
      }

      if (sortKey === 'rate_desc') {
        return right.latestVndPerUnit - left.latestVndPerUnit
      }

      if (sortKey === 'change_1d_desc') {
        return (right.change1dPct ?? Number.NEGATIVE_INFINITY) - (left.change1dPct ?? Number.NEGATIVE_INFINITY)
      }

      return (right.change30dPct ?? Number.NEGATIVE_INFINITY) - (left.change30dPct ?? Number.NEGATIVE_INFINITY)
    })

    return copy
  }, [payload, search, sortKey])

  const parsedAmount = Number(amount)
  const fromRate = rateLookup.get(fromCode) ?? null
  const toRate = rateLookup.get(toCode) ?? null
  const convertedValue =
    Number.isFinite(parsedAmount) && parsedAmount >= 0 && fromRate && toRate
      ? (parsedAmount * fromRate) / toRate
      : null

  const latestObservedOn = payload?.latestObservedOn
    ? new Date(`${payload.latestObservedOn}T00:00:00.000Z`).toLocaleDateString('vi-VN')
    : '--'
  const refreshedAt = payload?.refreshedAt ? new Date(payload.refreshedAt).toLocaleString('vi-VN') : '--'

  return (
    <main className="exchange-rate-page">
      <section className="exchange-rate-page__hero">
        <div>
          <h1>Tra cứu tỷ giá VND</h1>
          <p>Theo dõi tỷ giá của các đồng tiền lớn so với VND, cập nhật hằng ngày và lưu lịch sử đến 1 năm.</p>
        </div>
        <div className="exchange-rate-page__hero-meta">
          <span className={`exchange-rate-page__badge exchange-rate-page__badge--${payload?.status ?? 'fallback'}`}>
            {payload?.status === 'live' ? 'Dữ liệu từ cơ sở dữ liệu' : 'Dữ liệu dự phòng'}
          </span>
          <span>Ngày dữ liệu mới nhất: {latestObservedOn}</span>
          <span>Đồng bộ lúc: {refreshedAt}</span>
        </div>
      </section>

      <section className="exchange-rate-page__summary">
        <article>
          <span>Số đồng tiền đang theo dõi</span>
          <strong>{payload?.items.length ?? 0}</strong>
        </article>
        <article>
          <span>Khoảng lịch sử</span>
          <strong>{days} ngày</strong>
        </article>
        <article>
          <span>Nguồn</span>
          <strong>{payload?.items[0]?.source.id ?? 'N/A'}</strong>
        </article>
      </section>

      <section className="exchange-rate-page__tools">
        <label className="exchange-rate-page__search">
          <span>Tìm kiếm</span>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="USD, EUR, Yên..."
          />
        </label>
        <label>
          <span>Khoảng ngày</span>
          <select value={days} onChange={event => setDays(Number(event.target.value))}>
            {DAY_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option} ngày
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sắp xếp</span>
          <select value={sortKey} onChange={event => setSortKey(event.target.value as SortKey)}>
            {SORT_OPTIONS.map(option => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="exchange-rate-page__converter">
        <h2>Quy đổi nhanh</h2>
        <div className="exchange-rate-page__converter-grid">
          <label>
            <span>Số tiền</span>
            <input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            <span>Từ</span>
            <select value={fromCode} onChange={event => setFromCode(event.target.value)}>
              {['VND', ...orderedCodes].map(code => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Đổi sang</span>
            <select value={toCode} onChange={event => setToCode(event.target.value)}>
              {['VND', ...orderedCodes].map(code => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <div className="exchange-rate-page__converter-result">
            <span>Kết quả</span>
            <strong>{convertedValue === null ? '--' : convertedValue.toLocaleString('vi-VN', { maximumFractionDigits: 4 })}</strong>
          </div>
        </div>
      </section>

      {error ? <div className="exchange-rate-page__state exchange-rate-page__state--error">{error}</div> : null}
      {payload?.errors?.length ? (
        <div className="exchange-rate-page__state exchange-rate-page__state--warning">
          {payload.errors[0]}
        </div>
      ) : null}

      <section className="exchange-rate-page__table-wrap">
        {loading ? (
          <div className="exchange-rate-page__state">Đang tải dữ liệu...</div>
        ) : filteredItems.length === 0 ? (
          <div className="exchange-rate-page__state">Không tìm thấy đồng tiền phù hợp.</div>
        ) : (
          <table className="exchange-rate-page__table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên đồng tiền</th>
                <th>1 đơn vị = VND</th>
                <th>1 ngày</th>
                <th>7 ngày</th>
                <th>30 ngày</th>
                <th>Xu hướng</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.currencyCode}>
                  <td className="exchange-rate-page__code">{item.currencyCode}</td>
                  <td>{item.currencyName}</td>
                  <td>{formatVnd(item.latestVndPerUnit)}</td>
                  <td className={`exchange-rate-page__change exchange-rate-page__change--${changeTone(item.change1dPct)}`}>
                    {formatPct(item.change1dPct)}
                  </td>
                  <td className={`exchange-rate-page__change exchange-rate-page__change--${changeTone(item.change7dPct)}`}>
                    {formatPct(item.change7dPct)}
                  </td>
                  <td className={`exchange-rate-page__change exchange-rate-page__change--${changeTone(item.change30dPct)}`}>
                    {formatPct(item.change30dPct)}
                  </td>
                  <td>
                    <Sparkline history={item.history.slice(-30)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="exchange-rate-page__footer">
        Nguồn: <a href="https://github.com/fawazahmed0/exchange-api" target="_blank" rel="noreferrer">exchange-api (CC0-1.0)</a>. Dữ liệu tham khảo, không phải khuyến nghị tài chính.
      </footer>
    </main>
  )
}
