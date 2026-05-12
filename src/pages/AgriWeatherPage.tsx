import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import WeatherAdvisoryCards from '../components/weather/WeatherAdvisoryCards'
import WeatherDailyOutlook from '../components/weather/WeatherDailyOutlook'
import WeatherHourlyOutlook from '../components/weather/WeatherHourlyOutlook'
import WeatherLocationPicker from '../components/weather/WeatherLocationPicker'
import WeatherSourceComparison from '../components/weather/WeatherSourceComparison'
import type { AgriWeatherPayload, WeatherLocationSummary } from '../data/agriWeatherTypes'
import { CONDITION_LABELS, WEATHER_PROVIDER_META } from '../data/agriWeatherTypes'
import { buildApiUrl } from '../lib/api'
import './AgriWeatherPage.css'

const LAST_LOCATION_STORAGE_KEY = 'agri-weather:last-location'
const DEFAULT_LOCATION_CODE = 'DLK'

export default function AgriWeatherPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [locations, setLocations] = useState<WeatherLocationSummary[]>([])
  const [selectedLocationCode, setSelectedLocationCode] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [payload, setPayload] = useState<AgriWeatherPayload | null>(null)
  const [loadingLocations, setLoadingLocations] = useState(true)
  const [loadingWeather, setLoadingWeather] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadLocations() {
      setLoadingLocations(true)
      try {
        const response = await fetch(buildApiUrl('/api/agri-weather/locations'))
        const json = (await response.json()) as { success: boolean; data?: WeatherLocationSummary[]; error?: string }
        if (!response.ok || !json.success || !json.data) {
          throw new Error(json.error ?? 'Không thể tải danh sách địa phương')
        }

        if (active) {
          setLocations(json.data)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Không thể tải danh sách địa phương')
        }
      } finally {
        if (active) {
          setLoadingLocations(false)
        }
      }
    }

    void loadLocations()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (locations.length === 0) {
      return
    }

    const isValidLocation = (code: string | null) => !!code && locations.some(location => location.code === code)
    const urlCode = searchParams.get('location')
    const savedCode = localStorage.getItem(LAST_LOCATION_STORAGE_KEY)
    const nextCode = isValidLocation(urlCode)
      ? urlCode
      : isValidLocation(savedCode)
        ? savedCode
        : isValidLocation(DEFAULT_LOCATION_CODE)
          ? DEFAULT_LOCATION_CODE
          : locations[0]?.code ?? null

    if (!nextCode) {
      return
    }

    if (selectedLocationCode !== nextCode) {
      setSelectedLocationCode(nextCode)
    }

    if (urlCode !== nextCode) {
      setSearchParams({ location: nextCode }, { replace: true })
    }

    if (savedCode !== nextCode) {
      localStorage.setItem(LAST_LOCATION_STORAGE_KEY, nextCode)
    }
  }, [locations, searchParams, selectedLocationCode, setSearchParams])

  useEffect(() => {
    if (!selectedLocationCode) {
      return
    }

    const locationCode = selectedLocationCode
    let active = true

    async function loadWeather() {
      setLoadingWeather(true)
      setError(null)

      try {
        const response = await fetch(buildApiUrl(`/api/agri-weather?locationCode=${encodeURIComponent(locationCode)}`))
        const json = (await response.json()) as AgriWeatherPayload | { success: false; error?: string }
        if (!response.ok || !json.success) {
          throw new Error('error' in json ? json.error ?? 'Không thể tải dự báo thời tiết' : 'Không thể tải dự báo thời tiết')
        }

        if (active) {
          setPayload(json)
        }
      } catch (loadError) {
        if (active) {
          setPayload(null)
          setError(loadError instanceof Error ? loadError.message : 'Không thể tải dự báo thời tiết')
        }
      } finally {
        if (active) {
          setLoadingWeather(false)
        }
      }
    }

    void loadWeather()

    return () => {
      active = false
    }
  }, [refreshNonce, selectedLocationCode])

  const selectedLocation = useMemo(
    () => locations.find(location => location.code === selectedLocationCode) ?? null,
    [locations, selectedLocationCode],
  )

  const activeSourceCount = payload?.sourceStatus.filter(source => source.success).length ?? 0
  const lastUpdatedLabel = payload?.updatedAt ? new Date(payload.updatedAt).toLocaleString('vi-VN') : '--'

  function handleLocationChange(code: string) {
    setSelectedLocationCode(code)
    setSearchParams({ location: code }, { replace: false })
    localStorage.setItem(LAST_LOCATION_STORAGE_KEY, code)
  }

  function handleRefresh() {
    if (!selectedLocationCode) {
      return
    }

    setPayload(null)
    setRefreshNonce(current => current + 1)
  }

  return (
    <div className="agri-weather-page">
      <header className="agri-weather-page__hero">
        <div className="agri-weather-page__hero-copy">
          <span className="agri-weather-page__eyebrow">Thời tiết nông nghiệp đa nguồn</span>
          <h1>Dự báo thời tiết phục vụ vận hành ngoài ruộng</h1>
          <p>
            Tổng hợp từ Open-Meteo, MET.no và WeatherAPI để hỗ trợ theo dõi mưa, nhiệt, gió, UV và các cảnh báo
            canh tác cơ bản theo từng địa phương.
          </p>
        </div>

        <div className="agri-weather-page__hero-panel">
          <WeatherLocationPicker
            locations={locations}
            selectedCode={selectedLocationCode}
            disabled={loadingLocations}
            onChange={handleLocationChange}
          />

          <div className="agri-weather-page__hero-status">
            <div>
              <strong>{selectedLocation?.nameVi ?? 'Đang tải...'}</strong>
              <span>Cập nhật: {lastUpdatedLabel}</span>
            </div>
            <button type="button" className="agri-weather-page__refresh" disabled={loadingWeather || !selectedLocationCode} onClick={handleRefresh}>
              {loadingWeather ? 'Đang tải...' : 'Làm mới'}
            </button>
          </div>
        </div>
      </header>

      <section className="agri-weather-page__banner">
        <article className={`agri-weather-page__status agri-weather-page__status--${payload?.status ?? 'partial'}`}>
          <span className="agri-weather-page__status-label">
            {activeSourceCount}/3 nguồn · {payload?.status ?? 'partial'}
          </span>
          <strong>
            {payload?.status === 'stale'
              ? 'Đang dùng cache cũ để giữ page khả dụng'
              : payload?.status === 'partial'
                ? 'Có nguồn lỗi nhưng forecast tổng hợp vẫn khả dụng'
                : 'Dữ liệu đồng bộ mới từ các nguồn thời tiết'}
          </strong>
        </article>

        <article className="agri-weather-page__current">
          <span>Điều kiện hiện tại</span>
          <strong>{payload?.current?.tempC !== null && payload?.current ? `${payload.current.tempC.toFixed(1)}°C` : '--'}</strong>
          <span>{payload?.current ? CONDITION_LABELS[payload.current.conditionKey] : 'Đang chờ dữ liệu'}</span>
        </article>

        <article className="agri-weather-page__current">
          <span>Mưa 24h gần</span>
          <strong>
            {payload?.daily7d[0]?.rainMm !== null && payload?.daily7d[0] ? `${payload.daily7d[0].rainMm.toFixed(1)} mm` : '--'}
          </strong>
          <span>Ngày đầu forecast</span>
        </article>
      </section>

      {error ? <div className="agri-weather-page__error">{error}</div> : null}

      {payload ? (
        <>
          <WeatherAdvisoryCards advisories={payload.advisories} />
          <WeatherHourlyOutlook hours={payload.hourly72h} />
          <WeatherDailyOutlook days={payload.daily7d} />
          <WeatherSourceComparison rows={payload.comparison} />

          <section className="weather-section">
            <div className="weather-section__heading">
              <div>
                <span className="weather-section__eyebrow">Attribution</span>
                <h2 className="weather-section__title">Nguồn dữ liệu và lưu ý sử dụng</h2>
              </div>
            </div>

            <div className="agri-weather-page__attribution">
              {payload.sourceStatus.map(source => (
                <article key={source.provider} className={`agri-weather-page__source${source.success ? '' : ' agri-weather-page__source--error'}`}>
                  <div>
                    <strong>{WEATHER_PROVIDER_META[source.provider].label}</strong>
                    <a href={WEATHER_PROVIDER_META[source.provider].sourceUrl} target="_blank" rel="noreferrer">
                      tài liệu nguồn
                    </a>
                  </div>
                  <span>{source.success ? `Horizon ${source.horizonDays} ngày` : source.error ?? 'Lỗi nguồn'}</span>
                </article>
              ))}
              <p className="agri-weather-page__disclaimer">
                Dữ liệu dùng để tham khảo vận hành ngắn hạn. Không thay thế khuyến cáo chuyên môn chuyên sâu theo từng
                cây trồng hoặc điều kiện vi khí hậu tại ruộng.
              </p>
            </div>
          </section>
        </>
      ) : loadingWeather ? (
        <div className="agri-weather-page__loading">Đang tổng hợp forecast từ nhiều nguồn...</div>
      ) : null}
    </div>
  )
}
