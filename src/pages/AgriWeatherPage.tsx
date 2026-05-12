import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import WeatherAdvisoryCards from '../components/weather/WeatherAdvisoryCards'
import WeatherDailyOutlook from '../components/weather/WeatherDailyOutlook'
import WeatherHourlyOutlook from '../components/weather/WeatherHourlyOutlook'
import WeatherLocationPicker from '../components/weather/WeatherLocationPicker'
import type { AgriWeatherPayload, WeatherLocationSummary } from '../data/agriWeatherTypes'
import { CONDITION_LABELS } from '../data/agriWeatherTypes'
import { buildApiUrl } from '../lib/api'
import './AgriWeatherPage.css'

const LAST_LOCATION_STORAGE_KEY = 'agri-weather:last-location'
const LAST_LOCATION_SOURCE_STORAGE_KEY = 'agri-weather:last-location-source'
const LEGACY_DEFAULT_MIGRATION_STORAGE_KEY = 'agri-weather:default-migrated-v2'
const DEFAULT_LOCATION_CODE = 'HCM'
const LEGACY_DEFAULT_LOCATION_CODE = 'DLK'

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
    const savedSource = localStorage.getItem(LAST_LOCATION_SOURCE_STORAGE_KEY)
    const legacyDefaultMigrated = localStorage.getItem(LEGACY_DEFAULT_MIGRATION_STORAGE_KEY) === '1'
    const shouldMigrateLegacyDefault =
      !urlCode &&
      !legacyDefaultMigrated &&
      savedCode === LEGACY_DEFAULT_LOCATION_CODE &&
      savedSource !== 'user'
    const resolvedSavedCode = shouldMigrateLegacyDefault ? null : savedCode

    const nextCode = isValidLocation(urlCode)
      ? urlCode
      : isValidLocation(resolvedSavedCode)
        ? resolvedSavedCode
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

    if (shouldMigrateLegacyDefault) {
      localStorage.setItem(LEGACY_DEFAULT_MIGRATION_STORAGE_KEY, '1')
    }

    if (savedCode !== nextCode) {
      localStorage.setItem(LAST_LOCATION_STORAGE_KEY, nextCode)
    }

    if (!savedSource || savedCode !== nextCode || shouldMigrateLegacyDefault) {
      localStorage.setItem(LAST_LOCATION_SOURCE_STORAGE_KEY, urlCode === nextCode ? 'url' : 'system')
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

  const lastUpdatedLabel = payload?.updatedAt ? new Date(payload.updatedAt).toLocaleString('vi-VN') : '--'

  function handleLocationChange(code: string) {
    setSelectedLocationCode(code)
    setSearchParams({ location: code }, { replace: false })
    localStorage.setItem(LAST_LOCATION_STORAGE_KEY, code)
    localStorage.setItem(LAST_LOCATION_SOURCE_STORAGE_KEY, 'user')
    localStorage.setItem(LEGACY_DEFAULT_MIGRATION_STORAGE_KEY, '1')
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
          <span className="agri-weather-page__eyebrow">Thời tiết nông nghiệp tổng hợp</span>
          <h1>Dự báo thời tiết phục vụ vận hành ngoài ruộng</h1>
          <p>
            Dữ liệu được tổng hợp tự động từ các nguồn khả dụng để hỗ trợ theo dõi mưa, nhiệt, gió, UV và các cảnh
            báo canh tác cơ bản theo từng địa phương.
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
            {payload?.status === 'stale' ? 'Bản lưu gần nhất' : 'Dự báo tổng hợp'}
          </span>
          <strong>
            {payload?.status === 'stale'
              ? 'Dữ liệu đang hiển thị là bản lưu gần nhất để giữ page khả dụng.'
              : payload?.status === 'partial'
                ? 'Một phần nguồn đang gián đoạn nhưng forecast tổng hợp vẫn hoạt động bình thường.'
                : 'Dữ liệu tổng hợp mới nhất đã sẵn sàng để theo dõi ngắn hạn.'}
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

          <section className="weather-section">
            <div className="weather-section__heading">
              <div>
                <span className="weather-section__eyebrow">Lưu ý sử dụng</span>
                <h2 className="weather-section__title">Forecast tổng hợp cho vận hành ngắn hạn</h2>
              </div>
            </div>

            <div className="agri-weather-page__attribution">
              <p className="agri-weather-page__disclaimer">
                Dự báo được tổng hợp tự động từ các nguồn dữ liệu khả dụng. Khi một số nguồn gián đoạn, hệ thống vẫn
                tiếp tục hiển thị forecast tổng hợp từ các nguồn còn lại.
              </p>
              <p className="agri-weather-page__disclaimer">
                Dữ liệu dùng để tham khảo vận hành ngắn hạn, không thay thế đánh giá thực địa hoặc khuyến cáo chuyên
                môn chuyên sâu theo từng cây trồng.
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
