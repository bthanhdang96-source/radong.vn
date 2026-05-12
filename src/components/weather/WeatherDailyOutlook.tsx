import type { ForecastDay } from '../../data/agriWeatherTypes'
import { AGREEMENT_LABELS, CONDITION_LABELS, formatDayLabel } from '../../data/agriWeatherTypes'

type WeatherDailyOutlookProps = {
  days: ForecastDay[]
}

export default function WeatherDailyOutlook({ days }: WeatherDailyOutlookProps) {
  return (
    <section className="weather-section">
      <div className="weather-section__heading">
        <div>
          <span className="weather-section__eyebrow">Khung 7 ngày</span>
          <h2 className="weather-section__title">Outlook tổng hợp theo ngày</h2>
        </div>
      </div>

      <div className="weather-daily">
        {days.map(day => (
          <article key={day.date} className="weather-daily__card">
            <div className="weather-daily__top">
              <div>
                <strong>{formatDayLabel(day.date)}</strong>
                <span>{CONDITION_LABELS[day.conditionKey]}</span>
              </div>
              <span className={`weather-daily__badge weather-daily__badge--${day.agreement}`}>{day.providerCount} nguồn</span>
            </div>
            <div className="weather-daily__temps">
              <strong>{day.tempMaxC !== null ? `${day.tempMaxC.toFixed(1)}°` : '--'}</strong>
              <span>{day.tempMinC !== null ? `${day.tempMinC.toFixed(1)}°` : '--'}</span>
            </div>
            <div className="weather-daily__grid">
              <span>Mưa ngày: {day.rainMm !== null ? `${day.rainMm.toFixed(1)} mm` : '--'}</span>
              <span>Xác suất: {day.rainProbabilityPct !== null ? `${day.rainProbabilityPct}%` : '--'}</span>
              <span>Ẩm TB: {day.humidityAvgPct !== null ? `${day.humidityAvgPct.toFixed(0)}%` : '--'}</span>
              <span>Gió max: {day.windMaxKph !== null ? `${day.windMaxKph.toFixed(1)} km/h` : '--'}</span>
              <span>UV max: {day.uvMax !== null ? day.uvMax.toFixed(1) : '--'}</span>
              <span>ET0: {day.et0Mm !== null ? `${day.et0Mm.toFixed(1)} mm` : '--'}</span>
            </div>
            <small className={`weather-daily__agreement weather-daily__agreement--${day.agreement}`}>
              {AGREEMENT_LABELS[day.agreement]}
            </small>
          </article>
        ))}
      </div>
    </section>
  )
}
