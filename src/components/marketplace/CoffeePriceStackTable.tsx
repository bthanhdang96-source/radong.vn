import type { CoffeePriceStackItem } from '../../data/vnPriceTypes'
import './CoffeePriceStackTable.css'

type Props = {
  data: CoffeePriceStackItem[]
  loading: boolean
  error: string | null
  lastUpdated: string
}

export default function CoffeePriceStackTable({ data, loading, error, lastUpdated }: Props) {
  if (loading) {
    return (
      <section className="cpst" aria-label="Đang tải benchmark cà phê thế giới">
        <div className="cpst__skeleton-row" />
        <div className="cpst__skeleton-row" />
        <div className="cpst__skeleton-row" />
      </section>
    )
  }

  return (
    <section className="cpst" aria-label="Đối chiếu benchmark cà phê">
      <header className="cpst__header">
        <div>
          <h2>Đối chiếu benchmark Robusta</h2>
          <p>
            So sánh giá xuất khẩu, giá nội địa quy đổi và benchmark thế giới theo tháng.
          </p>
        </div>
        <span className="cpst__updated">Cập nhật: {lastUpdated ? new Date(lastUpdated).toLocaleString('vi-VN') : '--'}</span>
      </header>

      {error ? <div className="cpst__error">{error}</div> : null}

      <div className="cpst__table-shell">
        <table className="cpst__table">
          <thead>
            <tr>
              <th>Tháng</th>
              <th>Export (USD/tấn)</th>
              <th>Nội địa (USD/tấn)</th>
              <th>Benchmark</th>
              <th>World (USD/tấn)</th>
              <th>Export gap</th>
              <th>Nội địa gap</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={7} className="cpst__empty">
                  Chưa có dữ liệu benchmark để đối chiếu.
                </td>
              </tr>
            ) : (
              data.map(row => (
                <tr key={`${row.periodLabel}-${row.benchmarkName ?? 'unknown'}`}>
                  <td>{row.periodLabel}</td>
                  <td>{formatUsdTon(row.avgExportUnitValueUsdPerTon)}</td>
                  <td>{formatUsdTon(row.avgDomesticPriceUsdPerTon)}</td>
                  <td>{row.benchmarkName ?? '--'}</td>
                  <td>{formatUsdTon(row.avgWorldBenchmarkUsdPerTon)}</td>
                  <td className={deltaClass(row.exportVsBenchmarkGapPct)}>{formatPct(row.exportVsBenchmarkGapPct)}</td>
                  <td className={deltaClass(row.domesticVsBenchmarkGapPct)}>{formatPct(row.domesticVsBenchmarkGapPct)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="cpst__note">
        {data[0]?.interpretationNote ??
          'Directional benchmark only; benchmark/futures indicators are not physical transaction prices, FOB prices, margins, or profit.'}
      </p>
    </section>
  )
}

function formatUsdTon(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }
  return value.toLocaleString('vi-VN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })
}

function formatPct(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function deltaClass(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 'cpst__delta cpst__delta--neutral'
  }
  if (value > 0) {
    return 'cpst__delta cpst__delta--up'
  }
  if (value < 0) {
    return 'cpst__delta cpst__delta--down'
  }
  return 'cpst__delta cpst__delta--neutral'
}
