import type { ForecastHour } from '../../data/agriWeatherTypes'
import { AGREEMENT_LABELS, CONDITION_LABELS, formatHourLabel } from '../../data/agriWeatherTypes'

type WeatherHourlyOutlookProps = {
  hours: ForecastHour[]
}

export default function WeatherHourlyOutlook({ hours }: WeatherHourlyOutlookProps) {
  return (
    <section className="weather-section">
      <div className="weather-section__heading">
        <div>
          <span className="weather-section__eyebrow">Khung 72 giờ đầu</span>
          <h2 className="weather-section__title">Dự báo theo giờ từ nhiều nguồn</h2>
        </div>
      </div>

      <div className="weather-hourly">
        {hours.map(hour => (
          <article key={hour.time} className="weather-hourly__card">
            <div className="weather-hourly__meta">
              <span>{formatHourLabel(hour.time)}</span>
              <span className={`weather-hourly__agreement weather-hourly__agreement--${hour.agreement}`}>
                {hour.providerCount} nguồn · {AGREEMENT_LABELS[hour.agreement]}
              </span>
            </div>
            <strong className="weather-hourly__temp">{hour.tempC !== null ? `${hour.tempC.toFixed(1)}°C` : '--'}</strong>
            <span className="weather-hourly__condition">{CONDITION_LABELS[hour.conditionKey]}</span>
            <div className="weather-hourly__stats">
              <span>Mưa {hour.rainMm !== null ? `${hour.rainMm.toFixed(1)} mm` : '--'}</span>
              <span>Xác suất {hour.rainProbabilityPct !== null ? `${hour.rainProbabilityPct}%` : '--'}</span>
              <span>Ẩm {hour.humidityPct !== null ? `${hour.humidityPct}%` : '--'}</span>
              <span>Gió {hour.windKph !== null ? `${hour.windKph.toFixed(1)} km/h` : '--'}</span>
              <span>UV {hour.uv !== null ? hour.uv.toFixed(1) : '--'}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
