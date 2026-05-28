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

type SortKey = 'priority' | 'name_asc' | 'rate_desc' | 'change_abs_desc'

const DAY_OPTIONS = [365, 180, 90, 30]
const IMPORTANT_CURRENCY_ORDER = ['USD', 'CNY', 'EUR', 'JPY', 'KRW', 'SGD', 'THB', 'AUD', 'CAD', 'GBP'] as const
const IMPORTANT_CURRENCY_ORDER_MAP: Map<string, number> = new Map(
  IMPORTANT_CURRENCY_ORDER.map((code, index) => [code, index]),
)

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'priority', label: 'Đồng tiền quan trọng' },
  { key: 'name_asc', label: 'Tên (A-Z)' },
  { key: 'rate_desc', label: 'Tỷ giá cao đến thấp' },
  { key: 'change_abs_desc', label: 'Biến động nhiều nhất' },
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
  const height = 36
  const values = history.map(point => point.vndPerUnit)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)
  const stepX = width / Math.max(1, history.length - 1)

  const points = history.map((point, index) => {
    const x = index * stepX
    const y = height - ((point.vndPerUnit - min) / range) * (height - 6) - 3
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const tone = history[history.length - 1].vndPerUnit >= history[0].vndPerUnit ? 'up' : 'down'

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`exchange-rate-page__spark exchange-rate-page__spark--${tone}`} aria-hidden="true">
      <polyline points={points.join(' ')} fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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

      if (sortKey === 'name_asc') {
        return left.currencyName.localeCompare(right.currencyName, 'vi')
      }

      if (sortKey === 'rate_desc') {
        return right.latestVndPerUnit - left.latestVndPerUnit
      }

      const leftChange = left.change1dPct === null ? Number.NEGATIVE_INFINITY : Math.abs(left.change1dPct)
      const rightChange = right.change1dPct === null ? Number.NEGATIVE_INFINITY : Math.abs(right.change1dPct)
      return rightChange - leftChange
    })

    return copy
  }, [payload, search, sortKey])

  const strongestMove30dItem = useMemo(() => {
    const source = filteredItems.length > 0 ? filteredItems : payload?.items ?? []
    if (source.length === 0) {
      return null
    }

    const candidates = source.filter(item => item.change30dPct !== null)
    if (candidates.length === 0) {
      return null
    }

    return candidates.reduce((strongest, current) => (
      Math.abs(current.change30dPct ?? 0) > Math.abs(strongest.change30dPct ?? 0) ? current : strongest
    ), candidates[0])
  }, [filteredItems, payload])

  const strongestMove30dLabel = useMemo(() => {
    if (!strongestMove30dItem || strongestMove30dItem.change30dPct === null) {
      return '--'
    }

    if (strongestMove30dItem.change30dPct > 0) {
      return `Tăng mạnh 30 ngày: ${strongestMove30dItem.currencyCode} (${formatPct(strongestMove30dItem.change30dPct)})`
    }

    if (strongestMove30dItem.change30dPct < 0) {
      return `Giảm mạnh 30 ngày: ${strongestMove30dItem.currencyCode} (${formatPct(strongestMove30dItem.change30dPct)})`
    }

    return `Ổn định 30 ngày: ${strongestMove30dItem.currencyCode} (${formatPct(strongestMove30dItem.change30dPct)})`
  }, [strongestMove30dItem])

  const strongestMove30dTone =
    strongestMove30dItem?.change30dPct === null || !strongestMove30dItem
      ? 'neutral'
      : strongestMove30dItem.change30dPct > 0
        ? 'up'
        : strongestMove30dItem.change30dPct < 0
          ? 'down'
          : 'neutral'

  const upCount = useMemo(
    () => filteredItems.filter(item => (item.change1dPct ?? 0) > 0).length,
    [filteredItems],
  )
  const downCount = useMemo(
    () => filteredItems.filter(item => (item.change1dPct ?? 0) < 0).length,
    [filteredItems],
  )

  const parsedAmount = Number(amount)
  const fromRate = rateLookup.get(fromCode) ?? null
  const toRate = rateLookup.get(toCode) ?? null
  const convertedValue =
    Number.isFinite(parsedAmount) && parsedAmount >= 0 && fromRate && toRate
      ? (parsedAmount * fromRate) / toRate
      : null

  const convertedDisplay = convertedValue === null
    ? '--'
    : `${convertedValue.toLocaleString('vi-VN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })} ${toCode}`

  const conversionFormula = useMemo(() => {
    if (!fromRate || !toRate) {
      return '--'
    }

    if (toCode === 'VND') {
      return `1 ${fromCode} = ${formatVnd(fromRate)} VND`
    }

    const ratio = fromRate / toRate
    return `1 ${fromCode} ≈ ${ratio.toLocaleString('vi-VN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ${toCode}`
  }, [fromCode, fromRate, toCode, toRate])

  const healthLabel = error
    ? 'Gián đoạn dữ liệu'
    : loading
      ? 'Đang cập nhật'
      : 'Hoạt động tốt'

  const healthTone = error ? 'critical' : loading ? 'aging' : 'ok'

  return (
    <main className="exchange-rate-page">
      <section className="exchange-rate-page__hero">
        <span className="exchange-rate-page__hero-pill">Dữ liệu tỷ giá thời gian thực</span>
        <h1>Tra cứu tỷ giá VND</h1>
        <p>Theo dõi sát tỷ giá các đồng tiền lớn so với VND, cập nhật hằng ngày và lưu lịch sử đến 1 năm.</p>
      </section>

      <section className="exchange-rate-page__workspace">
        <div className="exchange-rate-page__workspace-main">
          <div className="exchange-rate-page__summary-grid">
            <article className="exchange-rate-page__summary-card">
              <span>Số đồng tiền đang theo dõi</span>
              <strong>{filteredItems.length} đồng tiền</strong>
              <small className={`exchange-rate-page__summary-move exchange-rate-page__summary-move--${strongestMove30dTone}`}>
                {strongestMove30dLabel}
              </small>
            </article>
            <article className="exchange-rate-page__summary-card">
              <span>Khoảng lịch sử phân tích</span>
              <strong>{days} ngày</strong>
              <small className={`exchange-rate-page__health exchange-rate-page__health--${healthTone}`}>{healthLabel}</small>
            </article>
          </div>

          <section className="exchange-rate-page__filters-card">
            <h2>Bộ lọc dữ liệu nâng cao</h2>
            <div className="exchange-rate-page__filters-grid">
              <label>
                <span>Tìm kiếm đồng tiền</span>
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="USD, EUR, CNY..."
                />
              </label>
              <label>
                <span>Khoảng ngày</span>
                <select value={days} onChange={event => setDays(Number(event.target.value))}>
                  {DAY_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option} ngày gần nhất
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
            </div>
            <p className="exchange-rate-page__filters-tip">
              Mẹo: Nhập mã tiền tệ hoặc tên đầy đủ để lọc nhanh theo nhu cầu.
            </p>
          </section>
        </div>

        <section className="exchange-rate-page__converter-card">
          <h2>Quy đổi nhanh</h2>
          <div className="exchange-rate-page__converter-grid">
            <label>
              <span>Số tiền quy đổi</span>
              <input
                value={amount}
                onChange={event => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="Nhập số tiền..."
              />
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
          </div>
          <div className="exchange-rate-page__converter-result">
            <span>Kết quả quy đổi</span>
            <strong>{convertedDisplay}</strong>
            <small>{conversionFormula}</small>
          </div>
        </section>
      </section>

      {error ? <div className="exchange-rate-page__state exchange-rate-page__state--error">{error}</div> : null}

      <section className="exchange-rate-page__table-card">
        <header className="exchange-rate-page__table-head">
          <div>
            <h2>Bảng tỷ giá chi tiết</h2>
            <p>So sánh mức biến động theo chu kỳ 1 ngày, 7 ngày và 30 ngày.</p>
          </div>
          <div className="exchange-rate-page__table-flags">
            <span className="exchange-rate-page__flag exchange-rate-page__flag--down">{downCount} đồng tiền giảm giá</span>
            <span className="exchange-rate-page__flag exchange-rate-page__flag--up">{upCount} đồng tiền tăng giá</span>
          </div>
        </header>

        <div className="exchange-rate-page__table-wrap">
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
                  <th>Xu hướng (30 ngày)</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr key={item.currencyCode}>
                    <td className="exchange-rate-page__code">{item.currencyCode}</td>
                    <td>{item.currencyName}</td>
                    <td className="exchange-rate-page__rate">{formatVnd(item.latestVndPerUnit)}</td>
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
        </div>

        <footer className="exchange-rate-page__footer">
          Nguồn dữ liệu:{' '}
          <a href="https://github.com/fawazahmed0/exchange-api" target="_blank" rel="noreferrer">
            exchange-api (CC0-1.0)
          </a>
          . Dữ liệu dùng để tham khảo.
        </footer>
      </section>
    </main>
  )
}
