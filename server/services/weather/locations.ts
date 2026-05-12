import type { WeatherLocationSummary } from './types.js'

// Representative coordinates for province-level weather selection.
const WEATHER_LOCATIONS: WeatherLocationSummary[] = [
  { code: 'AGI', nameVi: 'An Giang', type: 'province', macroRegion: 'south', lat: 10.38639, lon: 105.43518, elevationM: null, featured: true },
  { code: 'BNI', nameVi: 'Bắc Ninh', type: 'province', macroRegion: 'north', lat: 21.18608, lon: 106.07631, elevationM: null, featured: false },
  { code: 'CBG', nameVi: 'Cao Bằng', type: 'province', macroRegion: 'north', lat: 22.66568, lon: 106.25786, elevationM: null, featured: false },
  { code: 'CTO', nameVi: 'Cần Thơ', type: 'city', macroRegion: 'south', lat: 10.03711, lon: 105.78825, elevationM: null, featured: true },
  { code: 'CMA', nameVi: 'Cà Mau', type: 'province', macroRegion: 'south', lat: 9.17682, lon: 105.15242, elevationM: null, featured: false },
  { code: 'DNG', nameVi: 'Đà Nẵng', type: 'city', macroRegion: 'central', lat: 16.06778, lon: 108.22083, elevationM: null, featured: false },
  { code: 'DBI', nameVi: 'Điện Biên', type: 'province', macroRegion: 'north', lat: 21.38602, lon: 103.02301, elevationM: null, featured: false },
  { code: 'DLK', nameVi: 'Đắk Lắk', type: 'province', macroRegion: 'highland', lat: 12.66747, lon: 108.03775, elevationM: null, featured: true },
  { code: 'DNI', nameVi: 'Đồng Nai', type: 'province', macroRegion: 'south', lat: 10.94469, lon: 106.82432, elevationM: null, featured: false },
  { code: 'DTP', nameVi: 'Đồng Tháp', type: 'province', macroRegion: 'south', lat: 10.46017, lon: 105.63294, elevationM: null, featured: true },
  { code: 'GLA', nameVi: 'Gia Lai', type: 'province', macroRegion: 'highland', lat: 13.97111, lon: 108.01591, elevationM: null, featured: true },
  { code: 'HNI', nameVi: 'Hà Nội', type: 'city', macroRegion: 'north', lat: 21.02851, lon: 105.80482, elevationM: null, featured: true },
  { code: 'HTI', nameVi: 'Hà Tĩnh', type: 'province', macroRegion: 'central', lat: 18.34282, lon: 105.90569, elevationM: null, featured: false },
  { code: 'HPG', nameVi: 'Hải Phòng', type: 'city', macroRegion: 'north', lat: 20.84491, lon: 106.68808, elevationM: null, featured: false },
  { code: 'HCM', nameVi: 'TP. Hồ Chí Minh', type: 'city', macroRegion: 'south', lat: 10.77689, lon: 106.70081, elevationM: null, featured: true },
  { code: 'HUE', nameVi: 'Huế', type: 'city', macroRegion: 'central', lat: 16.46371, lon: 107.59086, elevationM: null, featured: false },
  { code: 'HYN', nameVi: 'Hưng Yên', type: 'province', macroRegion: 'north', lat: 20.64637, lon: 106.05112, elevationM: null, featured: false },
  { code: 'KHO', nameVi: 'Khánh Hòa', type: 'province', macroRegion: 'central', lat: 12.24507, lon: 109.19432, elevationM: null, featured: false },
  { code: 'LCH', nameVi: 'Lai Châu', type: 'province', macroRegion: 'north', lat: 22.39644, lon: 103.45824, elevationM: null, featured: false },
  { code: 'LDO', nameVi: 'Lâm Đồng', type: 'province', macroRegion: 'highland', lat: 11.94042, lon: 108.45831, elevationM: null, featured: true },
  { code: 'LSN', nameVi: 'Lạng Sơn', type: 'province', macroRegion: 'north', lat: 21.85264, lon: 106.76101, elevationM: null, featured: false },
  { code: 'LCA', nameVi: 'Lào Cai', type: 'province', macroRegion: 'north', lat: 22.48556, lon: 103.97066, elevationM: null, featured: false },
  { code: 'NAN', nameVi: 'Nghệ An', type: 'province', macroRegion: 'central', lat: 18.67337, lon: 105.69232, elevationM: null, featured: false },
  { code: 'NBI', nameVi: 'Ninh Bình', type: 'province', macroRegion: 'north', lat: 20.25061, lon: 105.97445, elevationM: null, featured: false },
  { code: 'PTO', nameVi: 'Phú Thọ', type: 'province', macroRegion: 'north', lat: 21.32274, lon: 105.40198, elevationM: null, featured: false },
  { code: 'QNG', nameVi: 'Quảng Ngãi', type: 'province', macroRegion: 'central', lat: 15.12047, lon: 108.79232, elevationM: null, featured: false },
  { code: 'QNI', nameVi: 'Quảng Ninh', type: 'province', macroRegion: 'north', lat: 20.95166, lon: 107.08, elevationM: null, featured: false },
  { code: 'QTR', nameVi: 'Quảng Trị', type: 'province', macroRegion: 'central', lat: 16.81625, lon: 107.10031, elevationM: null, featured: false },
  { code: 'SLA', nameVi: 'Sơn La', type: 'province', macroRegion: 'north', lat: 21.3256, lon: 103.91882, elevationM: null, featured: false },
  { code: 'THO', nameVi: 'Thanh Hóa', type: 'province', macroRegion: 'central', lat: 19.8075, lon: 105.7764, elevationM: null, featured: false },
  { code: 'TNN', nameVi: 'Tây Ninh', type: 'province', macroRegion: 'south', lat: 11.31004, lon: 106.09828, elevationM: null, featured: false },
  { code: 'TNG', nameVi: 'Thái Nguyên', type: 'province', macroRegion: 'north', lat: 21.59422, lon: 105.84817, elevationM: null, featured: false },
  { code: 'TQG', nameVi: 'Tuyên Quang', type: 'province', macroRegion: 'north', lat: 21.82356, lon: 105.21424, elevationM: null, featured: false },
  { code: 'VLO', nameVi: 'Vĩnh Long', type: 'province', macroRegion: 'south', lat: 10.25369, lon: 105.9722, elevationM: null, featured: false },
]

export function listWeatherLocations() {
  return [...WEATHER_LOCATIONS].sort((left, right) => {
    if (left.featured !== right.featured) {
      return left.featured ? -1 : 1
    }

    return left.nameVi.localeCompare(right.nameVi, 'vi-VN')
  })
}

export function getWeatherLocation(code: string | null | undefined) {
  if (!code) {
    return null
  }

  const normalized = code.trim().toUpperCase()
  return WEATHER_LOCATIONS.find(location => location.code === normalized) ?? null
}

export function hasWeatherLocation(code: string | null | undefined) {
  return getWeatherLocation(code) !== null
}

export function getDefaultWeatherLocation() {
  return getWeatherLocation(process.env.WEATHER_DEFAULT_LOCATION_CODE ?? 'DLK') ?? getWeatherLocation('DLK') ?? listWeatherLocations()[0]
}
