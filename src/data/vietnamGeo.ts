type Coordinate = [number, number]

type RegistryLocationInput = {
  id: string
  name: string
  address: string | null
  province: string | null
  district: string | null
}

const PROVINCE_COORDS: Record<string, Coordinate> = {
  'an giang': [105.1259, 10.5216],
  'ba ria vung tau': [107.1684, 10.5417],
  'bac giang': [106.199, 21.273],
  'bac kan': [105.8348, 22.147],
  'bac lieu': [105.7244, 9.294],
  'bac ninh': [106.076, 21.186],
  'bao loc': [107.807, 11.548],
  'ben tre': [106.375, 10.243],
  'bien hoa': [106.8246, 10.9574],
  'binh dinh': [108.902, 14.166],
  'binh duong': [106.668, 11.325],
  'binh phuoc': [106.883, 11.751],
  'binh thuan': [108.102, 11.091],
  'buon ma thuot': [108.05, 12.667],
  'ca mau': [105.152, 9.176],
  'cao bang': [106.252, 22.666],
  'can tho': [105.746, 10.045],
  'da nang': [108.202, 16.054],
  'dak lak': [108.237, 12.667],
  'dak nong': [107.609, 12.264],
  'dong nai': [107.167, 11.068],
  'dong thap': [105.636, 10.493],
  'dong xoai': [106.92, 11.533],
  'gia lai': [108.0, 13.983],
  'gia nghia': [107.69, 12.0],
  'ha giang': [104.984, 22.823],
  'ha nam': [105.923, 20.583],
  'ha noi': [105.854, 21.028],
  'ha tinh': [105.905, 18.356],
  'hai duong': [106.32, 20.94],
  'hai phong': [106.688, 20.844],
  'hau giang': [105.641, 9.784],
  'hoa binh': [105.338, 20.686],
  'ho chi minh': [106.7, 10.776],
  'hung yen': [106.06, 20.646],
  'khanh hoa': [109.196, 12.258],
  'kien giang': [105.125, 10.012],
  'kon tum': [107.996, 14.35],
  'lai chau': [103.458, 22.386],
  'lam dong': [108.438, 11.94],
  'lang son': [106.762, 21.853],
  'lao cai': [103.971, 22.48],
  'long an': [106.243, 10.695],
  'long khanh': [107.244, 10.93],
  'nam dinh': [106.162, 20.438],
  'nghe an': [104.92, 19.234],
  'ninh binh': [105.975, 20.25],
  'ninh thuan': [108.988, 11.673],
  'phan thiet': [108.102, 10.933],
  'phu tho': [105.22, 21.322],
  'phu yen': [109.092, 13.088],
  'pleiku': [108.0, 13.983],
  'quang binh': [106.623, 17.468],
  'quang ngai': [108.804, 15.121],
  'quang nam': [108.047, 15.539],
  'quang ninh': [107.292, 21.006],
  'quang tri': [107.185, 16.75],
  'soc trang': [105.973, 9.602],
  'son la': [103.91, 21.328],
  'tay ninh': [106.1, 11.335],
  'thai binh': [106.34, 20.447],
  'thai nguyen': [105.85, 21.59],
  'thanh hoa': [105.776, 19.807],
  'thua thien hue': [107.59, 16.463],
  'thu duc': [106.757, 10.85],
  'tien giang': [106.342, 10.449],
  'tra vinh': [106.345, 9.934],
  'tuyen quang': [105.218, 21.823],
  'vinh long': [105.97, 10.25],
  'vinh phuc': [105.604, 21.308],
  'yen bai': [104.87, 21.705],
}

const SORTED_LOCATION_KEYS = Object.keys(PROVINCE_COORDS).sort((left, right) => right.length - left.length)
const VIETNAM_CENTER: Coordinate = [106.3, 16.2]

export function foldVietnamese(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0111\u0110]/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\b(tinh|thanh pho|tp|thi xa|huyen|quan|phuong|xa|thi tran)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function hashText(value: string) {
  let hash = 17
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 9973
  }
  return hash
}

function jitterCoordinate(base: Coordinate, seed: string, maxOffset = 0.16): Coordinate {
  const hash = hashText(seed)
  const lngOffset = (((hash % 200) / 199) - 0.5) * maxOffset
  const latOffset = ((((hash * 7) % 200) / 199) - 0.5) * maxOffset
  return [Number((base[0] + lngOffset).toFixed(5)), Number((base[1] + latOffset).toFixed(5))]
}

export function resolveRegistryCoordinate(item: RegistryLocationInput): Coordinate {
  const foldedText = foldVietnamese(`${item.province ?? ''} ${item.address ?? ''} ${item.district ?? ''}`)
  const key = SORTED_LOCATION_KEYS.find(locationKey => foldedText.includes(locationKey))
  const base = key ? PROVINCE_COORDS[key] : VIETNAM_CENTER
  const maxOffset = key ? 0.16 : 1.6
  return jitterCoordinate(base, `${item.id}:${item.name}:${item.address ?? ''}`, maxOffset)
}
