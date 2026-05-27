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

type SortKey = 'code_asc' | 'rate_desc' | 'change_1d_desc' | 'change_30d_desc'

const DAY_OPTIONS = [30, 90, 365]
const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'code_asc', label: 'Ma tien te (A-Z)' },
  { key: 'rate_desc', label: 'Ty gia cao nhat' },
  { key: 'change_1d_desc', label: 'Bien dong 1 ngay' },
  { key: 'change_30d_desc', label: 'Bien dong 30 ngay' },
]

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
  const [sortKey, setSortKey] = useState<SortKey>('code_asc')
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
          throw new Error(json.error ?? 'Khong the tai du lieu ty gia')
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
        setError(fetchError instanceof Error ? fetchError.message : 'Khong the tai du lieu ty gia')
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

  useEffect(() => {
    if (!payload || payload.items.length === 0) {
      return
    }

    if (!rateLookup.has(fromCode)) {
      setFromCode(payload.items[0].currencyCode)
    }

    if (!rateLookup.has(toCode)) {
      setToCode('VND')
    }
  }, [fromCode, payload, rateLookup, toCode])

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
          <h1>Tra cuu ty gia VND</h1>
          <p>Theo doi ty gia cua cac dong tien lon so voi VND, cap nhat hang ngay va luu lich su den 1 nam.</p>
        </div>
        <div className="exchange-rate-page__hero-meta">
          <span className={`exchange-rate-page__badge exchange-rate-page__badge--${payload?.status ?? 'fallback'}`}>
            {payload?.status === 'live' ? 'Du lieu tu database' : 'Du lieu fallback'}
          </span>
          <span>Ngay du lieu moi nhat: {latestObservedOn}</span>
          <span>Dong bo luc: {refreshedAt}</span>
        </div>
      </section>

      <section className="exchange-rate-page__summary">
        <article>
          <span>So dong tien dang theo doi</span>
          <strong>{payload?.items.length ?? 0}</strong>
        </article>
        <article>
          <span>Khoang lich su</span>
          <strong>{days} ngay</strong>
        </article>
        <article>
          <span>Nguon</span>
          <strong>{payload?.items[0]?.source.id ?? 'N/A'}</strong>
        </article>
      </section>

      <section className="exchange-rate-page__tools">
        <label className="exchange-rate-page__search">
          <span>Tim kiem</span>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="USD, EUR, Yen..."
          />
        </label>
        <label>
          <span>Khoang ngay</span>
          <select value={days} onChange={event => setDays(Number(event.target.value))}>
            {DAY_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option} ngay
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sap xep</span>
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
        <h2>Quy doi nhanh</h2>
        <div className="exchange-rate-page__converter-grid">
          <label>
            <span>So tien</span>
            <input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            <span>Tu</span>
            <select value={fromCode} onChange={event => setFromCode(event.target.value)}>
              {['VND', ...(payload?.availableCodes ?? [])].map(code => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sang</span>
            <select value={toCode} onChange={event => setToCode(event.target.value)}>
              {['VND', ...(payload?.availableCodes ?? [])].map(code => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <div className="exchange-rate-page__converter-result">
            <span>Ket qua</span>
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
          <div className="exchange-rate-page__state">Dang tai du lieu...</div>
        ) : filteredItems.length === 0 ? (
          <div className="exchange-rate-page__state">Khong tim thay dong tien phu hop.</div>
        ) : (
          <table className="exchange-rate-page__table">
            <thead>
              <tr>
                <th>Ma</th>
                <th>Ten dong tien</th>
                <th>1 don vi = VND</th>
                <th>1 ngay</th>
                <th>7 ngay</th>
                <th>30 ngay</th>
                <th>Xu huong</th>
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
        Nguon: <a href="https://github.com/fawazahmed0/exchange-api" target="_blank" rel="noreferrer">exchange-api (CC0-1.0)</a>. Du lieu tham khao, khong phai khuyen nghi tai chinh.
      </footer>
    </main>
  )
}
