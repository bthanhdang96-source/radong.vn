import { useDeferredValue, useEffect, useId, useRef, useState } from 'react'
import type { WeatherLocationSummary } from '../../data/agriWeatherTypes'

type WeatherLocationPickerProps = {
  locations: WeatherLocationSummary[]
  selectedCode: string | null
  disabled?: boolean
  onChange: (code: string) => void
}

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .toLowerCase()
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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listboxId = useId()
  const selectedLocation = locations.find(location => location.code === selectedCode) ?? null

  useEffect(() => {
    if (!open) {
      return
    }

    searchInputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setQuery('')
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setQuery('')
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const normalizedQuery = normalizeSearchValue(deferredQuery.trim())
  const filteredLocations = normalizedQuery
    ? locations.filter(location => {
        const normalizedName = normalizeSearchValue(location.nameVi)
        const normalizedCode = normalizeSearchValue(location.code)
        return normalizedName.includes(normalizedQuery) || normalizedCode.includes(normalizedQuery)
      })
    : locations

  const selectedMeta = selectedLocation
    ? `${selectedLocation.code} · ${selectedLocation.type === 'city' ? 'Thành phố trực thuộc trung ương' : 'Tỉnh'}`
    : 'Chọn tỉnh hoặc thành phố'

  function handleToggle() {
    if (disabled) {
      return
    }

    if (open) {
      setQuery('')
      setOpen(false)
      return
    }

    setQuery('')
    setOpen(true)
  }

  function handleSelect(code: string) {
    onChange(code)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="weather-picker">
      <span className="weather-picker__label">Địa phương theo dõi</span>

      <button
        type="button"
        className={`weather-picker__trigger${open ? ' weather-picker__trigger--open' : ''}`}
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        disabled={disabled}
      >
        <span className="weather-picker__trigger-copy">
          <strong>{selectedLocation?.nameVi ?? 'TP. Hồ Chí Minh'}</strong>
          <span>{selectedMeta}</span>
        </span>
        <span className="weather-picker__chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="weather-picker__menu">
          <div className="weather-picker__search">
            <input
              id={`${listboxId}-search`}
              ref={searchInputRef}
              className="weather-picker__search-input"
              type="text"
              value={query}
              placeholder="Gõ để lọc nhanh theo tỉnh/thành hoặc mã"
              autoComplete="off"
              aria-label="Lọc nhanh địa phương"
              onChange={event => setQuery(event.target.value)}
            />
          </div>

          <div id={listboxId} className="weather-picker__options" role="listbox" aria-label="Danh sách địa phương">
            {filteredLocations.length > 0 ? (
              filteredLocations.map(location => (
                <button
                  key={location.code}
                  type="button"
                  role="option"
                  aria-selected={location.code === selectedCode}
                  className={`weather-picker__option${location.code === selectedCode ? ' weather-picker__option--active' : ''}`}
                  onClick={() => handleSelect(location.code)}
                >
                  <strong>{location.nameVi}</strong>
                  <span>
                    {location.code} · {location.type === 'city' ? 'Thành phố' : 'Tỉnh'} · {location.macroRegion}
                  </span>
                </button>
              ))
            ) : (
              <div className="weather-picker__empty">Không tìm thấy địa phương phù hợp.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
