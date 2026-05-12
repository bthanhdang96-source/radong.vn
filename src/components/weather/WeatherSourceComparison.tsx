import type { DailyComparisonProviderValue, DailyComparisonRow } from '../../data/agriWeatherTypes'
import { AGREEMENT_LABELS, WEATHER_PROVIDER_META, formatDayLabel } from '../../data/agriWeatherTypes'

type WeatherSourceComparisonProps = {
  rows: DailyComparisonRow[]
}

function renderProviderCell(value: DailyComparisonProviderValue | undefined) {
  if (!value) {
    return <span className="weather-comparison__muted">--</span>
  }

  return (
    <div className="weather-comparison__cellstack">
      <strong>
        {value.tempMaxC !== null ? `${value.tempMaxC.toFixed(1)}°` : '--'} / {value.tempMinC !== null ? `${value.tempMinC.toFixed(1)}°` : '--'}
      </strong>
      <span>Mưa {value.rainMm !== null ? `${value.rainMm.toFixed(1)} mm` : '--'}</span>
      <span>UV {value.uvMax !== null ? value.uvMax.toFixed(1) : '--'}</span>
    </div>
  )
}

export default function WeatherSourceComparison({ rows }: WeatherSourceComparisonProps) {
  return (
    <section className="weather-section">
      <div className="weather-section__heading">
        <div>
          <span className="weather-section__eyebrow">Đối chiếu nguồn</span>
          <h2 className="weather-section__title">So sánh từng nguồn trên cùng ngày</h2>
        </div>
      </div>

      <div className="weather-comparison">
        <div className="weather-comparison__header">
          <span>Ngày</span>
          <span>Tổng hợp</span>
          <span>{WEATHER_PROVIDER_META.open_meteo.label}</span>
          <span>{WEATHER_PROVIDER_META.met_no.label}</span>
          <span>{WEATHER_PROVIDER_META.weatherapi.label}</span>
        </div>

        {rows.map(row => {
          const byProvider = new Map(row.providers.map(provider => [provider.provider, provider]))
          return (
            <div key={row.date} className="weather-comparison__row">
              <span className="weather-comparison__day">{formatDayLabel(row.date)}</span>
              <div className="weather-comparison__cellstack">
                <strong>
                  {row.consensus.tempMaxC !== null ? `${row.consensus.tempMaxC.toFixed(1)}°` : '--'} /{' '}
                  {row.consensus.tempMinC !== null ? `${row.consensus.tempMinC.toFixed(1)}°` : '--'}
                </strong>
                <span>Mưa {row.consensus.rainMm !== null ? `${row.consensus.rainMm.toFixed(1)} mm` : '--'}</span>
                <span>
                  {row.providerCount} nguồn · {AGREEMENT_LABELS[row.agreement]}
                </span>
              </div>
              {renderProviderCell(byProvider.get('open_meteo'))}
              {renderProviderCell(byProvider.get('met_no'))}
              {renderProviderCell(byProvider.get('weatherapi'))}
            </div>
          )
        })}
      </div>
    </section>
  )
}
