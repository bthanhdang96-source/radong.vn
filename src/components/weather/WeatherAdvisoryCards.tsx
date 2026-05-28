import type { AgriAdvisory } from '../../data/agriWeatherTypes'

type WeatherAdvisoryCardsProps = {
  advisories: AgriAdvisory[]
}

function formatWindow(start: string, end: string) {
  const startLabel = new Date(start).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const endLabel = new Date(end).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${startLabel} - ${endLabel}`
}

export default function WeatherAdvisoryCards({ advisories }: WeatherAdvisoryCardsProps) {
  return (
    <section className="weather-section">
      <div className="weather-section__heading">
        <div>
          <span className="weather-section__eyebrow">Tín hiệu 24-72 giờ</span>
          <h2 className="weather-section__title">Lưu ý cho dự báo giá và nguồn cung</h2>
        </div>
      </div>

      <div className="weather-advisories">
        {advisories.map(advisory => (
          <article key={advisory.id} className={`weather-advisory weather-advisory--${advisory.severity}`}>
            <div className="weather-advisory__top">
              <span className="weather-advisory__severity">{advisory.severity}</span>
              <span className="weather-advisory__window">{formatWindow(advisory.windowStart, advisory.windowEnd)}</span>
            </div>
            <h3>{advisory.title}</h3>
            <p>{advisory.message}</p>
            <div className="weather-advisory__signals">
              {advisory.basedOn.map(signal => (
                <span key={`${advisory.id}-${signal}`}>{signal}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
