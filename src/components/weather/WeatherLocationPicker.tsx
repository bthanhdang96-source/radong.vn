import { useDeferredValue, useState } from 'react'
import type { WeatherLocationSummary } from '../../data/agriWeatherTypes'

type WeatherLocationPickerProps = {
  locations: WeatherLocationSummary[]
  selectedCode: string | null
  disabled?: boolean
  onChange: (code: string) => void
}

export default function WeatherLocationPicker({
  locations,
  selectedCode,
  disabled = false,
  onChange,
}: WeatherLocationPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const deferredQuery = useDeferredValue(query)
  const selectedLocation = locations.find(location => location.code === selectedCode) ?? null
  const inputValue = open ? query : selectedLocation?.nameVi ?? query

  const normalizedQuery = deferredQuery.trim().toLowerCase()
  const filteredLocations = normalizedQuery
    ? locations.filter(
        location =>
          location.nameVi.toLowerCase().includes(normalizedQuery) ||
          location.code.toLowerCase().includes(normalizedQuery),
      )
    : locations

  return (
    <div className="weather-picker">
      <label className="weather-picker__label" htmlFor="weather-location-input">
        Địa phương theo dõi
      </label>
      <div className={`weather-picker__control${open ? ' weather-picker__control--open' : ''}`}>
        <input
          id="weather-location-input"
          className="weather-picker__input"
          type="text"
          value={inputValue}
          placeholder="Tìm tỉnh/thành hoặc mã"
          autoComplete="off"
          disabled={disabled}
          onFocus={() => {
            setQuery(selectedLocation?.nameVi ?? query)
            setOpen(true)
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120)
          }}
          onChange={event => {
            setOpen(true)
            setQuery(event.target.value)
          }}
          onKeyDown={event => {
            if (event.key === 'Enter' && filteredLocations[0]) {
              event.preventDefault()
              onChange(filteredLocations[0].code)
              setQuery(filteredLocations[0].nameVi)
              setOpen(false)
            }
          }}
        />
        <button
          type="button"
          className="weather-picker__chevron"
          onMouseDown={event => event.preventDefault()}
          onClick={() => setOpen(current => !current)}
          aria-label="Mở danh sách địa phương"
          disabled={disabled}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {selectedLocation ? (
        <div className="weather-picker__hint">
          <span>{selectedLocation.code}</span>
          <span>{selectedLocation.type === 'city' ? 'Thành phố trực thuộc trung ương' : 'Tỉnh'}</span>
        </div>
      ) : null}

      {open ? (
        <div className="weather-picker__menu">
          {filteredLocations.length > 0 ? (
            filteredLocations.map(location => (
              <button
                key={location.code}
                type="button"
                className={`weather-picker__option${location.code === selectedCode ? ' weather-picker__option--active' : ''}`}
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                  onChange(location.code)
                  setQuery(location.nameVi)
                  setOpen(false)
                }}
              >
                <strong>{location.nameVi}</strong>
                <span>
                  {location.code} · {location.macroRegion}
                </span>
              </button>
            ))
          ) : (
            <div className="weather-picker__empty">Không tìm thấy địa phương phù hợp.</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
