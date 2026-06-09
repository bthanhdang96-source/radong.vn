import { useEffect, useMemo, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useNavigate, useParams } from 'react-router-dom'
import { resolveRegistryCoordinate } from '../data/vietnamGeo'
import { buildApiUrl } from '../lib/api'
import { useDebounce } from '../utils/useDebounce'
import './LookupPage.css'

const MapIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>
)

const ListIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
)

const PhoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
)

const BookmarkIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
)


type RegistryType = 'production_area' | 'packing_facility'
type LookupSortKey = 'updated_desc' | 'name_asc' | 'province_asc'

type ApprovalPeriod = {
  round: number
  startsOn: string | null
  endsOn: string | null
  startRaw: string | null
  endRaw: string | null
}

type LookupItem = {
  id: string
  registryType: RegistryType
  sourceUrl: string
  sourcePage: number
  sourceRowNumber: number | null
  name: string
  address: string | null
  phone: string | null
  phoneDisplay: string | null
  market: string | null
  province: string | null
  district: string | null
  commune: string | null
  product: string
  registryCode: string | null
  approvalPeriods: ApprovalPeriod[]
  harvestStatus: 'harvesting' | 'soon' | 'ended' | 'unknown'
  harvestStatusLabel: string
  seasonProgressPct: number | null
  latestCrawledAt: string
  capacity: string | null
  certifications: string[]
}

type LookupMapItem = Omit<LookupItem, 'sourceUrl' | 'sourcePage' | 'sourceRowNumber'>

type LookupResponse = {
  success: boolean
  items: LookupItem[]
  mapItems: LookupMapItem[]
  total: number
  page: number
  limit: number
  latestCrawledAt: string | null
  stats: Record<RegistryType, number>
  filters: {
    provinces: string[]
    markets: string[]
    products: string[]
  }
  error?: string
}

type LookupMapFeature = {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    id: string
    registryType: RegistryType
    name: string
  }
}

type LookupMapFeatureCollection = {
  type: 'FeatureCollection'
  features: LookupMapFeature[]
}

type RegistryTab = {
  slug: string
  type: RegistryType
  label: string
  shortLabel: string
}

const TABS: RegistryTab[] = [
  { slug: 'vung-trong', type: 'production_area', label: 'Vùng trồng nông sản', shortLabel: 'Vùng trồng' },
  { slug: 'co-so-dong-goi', type: 'packing_facility', label: 'Cơ sở đóng gói', shortLabel: 'Đóng gói' },
]

const FAVORITES_KEY = 'nongsanvn_export_registry_favorites'
const DEFAULT_RESPONSE: LookupResponse = {
  success: true,
  items: [],
  mapItems: [],
  total: 0,
  page: 1,
  limit: 24,
  latestCrawledAt: null,
  stats: {
    production_area: 0,
    packing_facility: 0,
  },
  filters: {
    provinces: [],
    markets: [],
    products: [],
  },
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('vi-VN') : '--'
}

function getFavoriteId(item: LookupItem) {
  return `${item.registryType}:${item.id}`
}

function shouldShowProductLabel(product: string) {
  const normalizedProduct = product.trim().toLocaleLowerCase('vi-VN')
  return ![
    'một loại nông sản khác',
    'mot loai nong san khac',
    'nông sản khác',
    'nong san khac',
    'khác',
    'khac',
  ].includes(normalizedProduct)
}

function readFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function useCanUseTelLinks() {
  const [canUseTelLinks, setCanUseTelLinks] = useState(false)

  useEffect(() => {
    if (!window.matchMedia) {
      return
    }

    const mediaQuery = window.matchMedia('(pointer: coarse)')
    const syncPreference = () => setCanUseTelLinks(mediaQuery.matches)
    syncPreference()
    mediaQuery.addEventListener('change', syncPreference)

    return () => {
      mediaQuery.removeEventListener('change', syncPreference)
    }
  }, [])

  return canUseTelLinks
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const input = document.createElement('input')
  input.value = text
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  input.remove()
}

function buildQuery(params: {
  type: RegistryType
  search: string
  province: string
  market: string
  product: string
  status: string
  sort: LookupSortKey
  page: number
}) {
  const query = new URLSearchParams({
    type: params.type,
    page: String(params.page),
    limit: '24',
    sort: params.sort,
    mapMode: 'page',
  })

  if (params.search.trim()) {
    query.set('q', params.search.trim())
  }
  if (params.province !== 'all') {
    query.set('province', params.province)
  }
  if (params.market !== 'all') {
    query.set('market', params.market)
  }
  if (params.product !== 'all') {
    query.set('product', params.product)
  }
  if (params.status === 'harvesting') {
    query.set('status', 'harvesting')
  }

  return query
}

function LookupCardSkeleton() {
  return (
    <article className="lookup-card lookup-card--skeleton">
      <div className="skeleton-line skeleton-type"></div>
      <div className="skeleton-line skeleton-title"></div>
      <div className="skeleton-line skeleton-meta"></div>
      <div className="skeleton-line skeleton-address"></div>
      <div className="skeleton-box"></div>
      <div className="lookup-card__actions">
        <div className="skeleton-btn" style={{ flex: 1 }}></div>
        <div className="skeleton-btn" style={{ width: '78px' }}></div>
      </div>
    </article>
  )
}

function Pagination({ page, totalPages, setPage }: { page: number, totalPages: number, setPage: (p: number) => void }) {
  const pages = []
  const maxVisible = 5
  let start = Math.max(1, page - Math.floor(maxVisible / 2))
  let end = start + maxVisible - 1

  if (end > totalPages) {
    end = totalPages
    start = Math.max(1, end - maxVisible + 1)
  }

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  return (
    <nav className="lookup-pagination" aria-label="Phân trang tra cứu">
      <button type="button" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}>Trước</button>

      {start > 1 && (
        <>
          <button type="button" onClick={() => setPage(1)}>1</button>
          {start > 2 && <span className="lookup-pagination__dots">...</span>}
        </>
      )}

      {pages.map(p => (
        <button
          key={p}
          type="button"
          className={p === page ? 'is-current' : ''}
          onClick={() => setPage(p)}
        >
          {p}
        </button>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="lookup-pagination__dots">...</span>}
          <button type="button" onClick={() => setPage(totalPages)}>{totalPages}</button>
        </>
      )}

      <button type="button" disabled={page >= totalPages} onClick={() => setPage(Math.min(totalPages, page + 1))}>Tiếp</button>
    </nav>
  )
}


function PhoneAction({
  phone,
  phoneDisplay,
  className,
  canUseTelLinks,
}: {
  phone: string
  phoneDisplay: string | null
  className: string
  canUseTelLinks: boolean
}) {
  const [copied, setCopied] = useState(false)
  const displayPhone = phoneDisplay ?? phone

  async function handleCopyPhone() {
    await copyText(phone)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  if (canUseTelLinks) {
    return (
      <a href={`tel:${phone}`} className={className}>
        <PhoneIcon /> Gọi {displayPhone}
      </a>
    )
  }

  return (
    <button type="button" className={className} onClick={handleCopyPhone} title="Copy số điện thoại">
      <PhoneIcon /> {copied ? 'Đã copy' : displayPhone}
    </button>
  )
}

function SeasonBar({ item }: { item: LookupItem }) {
  if (item.registryType !== 'production_area') {
    return null
  }

  const pct = item.seasonProgressPct ?? 0
  const firstPeriod = item.approvalPeriods[0]
  return (
    <div className={`lookup-card__season lookup-card__season--${item.harvestStatus}`}>
      <div className="lookup-card__season-row">
        <span>{item.harvestStatusLabel}</span>
        <strong>{item.seasonProgressPct === null ? '--' : `${item.seasonProgressPct}%`}</strong>
      </div>
      <div className="lookup-card__progress" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <div className="lookup-card__period">
        {firstPeriod ? `Đợt ${firstPeriod.round}: ${firstPeriod.startRaw ?? '--'} - ${firstPeriod.endRaw ?? '--'}` : 'Chưa có lịch mùa vụ'}
      </div>
    </div>
  )
}

function LookupCard({
  item,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
  canUseTelLinks,
}: {
  item: LookupItem
  selected: boolean
  favorite: boolean
  onSelect: (item: LookupItem) => void
  onToggleFavorite: (item: LookupItem) => void
  canUseTelLinks: boolean
}) {
  const showProductLabel = shouldShowProductLabel(item.product)

  return (
    <article
      id={`registry-card-${item.id}`}
      className={`lookup-card${selected ? ' lookup-card--selected' : ''}`}
      onClick={() => onSelect(item)}
    >
      <div className="lookup-card__topline">
        {showProductLabel ? <span className="lookup-card__product">{item.product}</span> : <span aria-hidden="true" />}
        {item.market ? <span className="lookup-card__market">{item.market}</span> : null}
      </div>

      <h2>{item.name}</h2>

      {item.registryCode ? (
        <div className="lookup-card__meta">
          <span>Mã: {item.registryCode}</span>
        </div>
      ) : null}

      <p className="lookup-card__address">{item.address ?? 'Chưa có địa chỉ'}</p>

      <SeasonBar item={item} />

      {item.registryType === 'packing_facility' && (item.capacity || item.certifications.length > 0) ? (
        <div className="lookup-card__facility-extra">
          {item.capacity ? <span>Công suất: {item.capacity}</span> : null}
          {item.certifications.map(certification => (
            <span key={certification}>{certification}</span>
          ))}
        </div>
      ) : null}

      <div className="lookup-card__actions" onClick={event => event.stopPropagation()}>
        {item.phone ? (
          <PhoneAction
            phone={item.phone}
            phoneDisplay={item.phoneDisplay}
            className={`lookup-card__call lookup-card__call--${item.registryType}`}
            canUseTelLinks={canUseTelLinks}
          />
        ) : (
          <span className="lookup-card__no-phone">Chưa có số liên hệ</span>
        )}
        <button type="button" className={favorite ? 'lookup-card__favorite lookup-card__favorite--active' : 'lookup-card__favorite'} onClick={() => onToggleFavorite(item)}>
          <BookmarkIcon filled={favorite} /> {favorite ? 'Đã lưu' : 'Lưu'}
        </button>
      </div>
    </article>
  )
}

const LOOKUP_MAP_SOURCE_ID = 'lookup-registry-points'
const LOOKUP_SELECTED_SOURCE_ID = 'lookup-selected-registry-point'
const LOOKUP_CLUSTER_LAYER_ID = 'lookup-clusters'
const LOOKUP_CLUSTER_COUNT_LAYER_ID = 'lookup-cluster-count'
const LOOKUP_POINT_LAYER_ID = 'lookup-unclustered-point'
const LOOKUP_POINT_COUNT_LAYER_ID = 'lookup-unclustered-point-count'
const LOOKUP_SELECTED_POINT_LAYER_ID = 'lookup-selected-point'
const LOOKUP_SELECTED_POINT_COUNT_LAYER_ID = 'lookup-selected-point-count'

const EMPTY_FEATURE_COLLECTION: LookupMapFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}

type LookupMapStatus = 'loading' | 'ready' | 'error'

function buildLookupMapFeatureCollection(items: LookupMapItem[]): LookupMapFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: items.map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: resolveRegistryCoordinate(item),
      },
      properties: {
        id: item.id,
        registryType: item.registryType,
        name: item.name,
      },
    })),
  }
}

function RegistryMap({
  items,
  activeType,
  selectedId,
  onSelect,
  onCloseMobile,
  canUseTelLinks,
}: {
  items: LookupMapItem[]
  activeType: RegistryType
  selectedId: string | null
  onSelect: (item: LookupMapItem) => void
  onCloseMobile?: () => void
  canUseTelLinks: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const maplibreRef = useRef<typeof import('maplibre-gl') | null>(null)
  const itemsRef = useRef(items)
  const onSelectRef = useRef(onSelect)
  const [mapStatus, setMapStatus] = useState<LookupMapStatus>('loading')
  const mapReady = mapStatus === 'ready'
  const selectedItem = items.find(item => item.id === selectedId)
  const showSelectedProductLabel = selectedItem ? shouldShowProductLabel(selectedItem.product) : false
  const selectedFirstPeriod = selectedItem?.approvalPeriods[0]
  const mapData = useMemo(() => buildLookupMapFeatureCollection(items), [items])

  useEffect(() => {
    itemsRef.current = items
    onSelectRef.current = onSelect
  }, [items, onSelect])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let hasLoaded = false
    const container = containerRef.current

    void import('maplibre-gl').then(maplibregl => {
      if (disposed || mapRef.current) {
        return
      }

      let map: MapLibreMap
      try {
        maplibreRef.current = maplibregl
        map = new maplibregl.Map({
          container,
          style: 'https://tiles.openfreemap.org/styles/positron',
          center: [106.3, 16.2],
          zoom: 4.7,
          attributionControl: { compact: true },
        })
      } catch {
        setMapStatus('error')
        return
      }

      mapRef.current = map
      map.on('error', () => {
        if (!disposed && !hasLoaded) {
          setMapStatus('error')
        }
      })
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
      resizeObserver = new ResizeObserver(() => {
        mapRef.current?.resize()
      })
      resizeObserver.observe(container)

      map.once('load', () => {
        if (disposed) {
          return
        }

        hasLoaded = true
        map.addSource(LOOKUP_MAP_SOURCE_ID, {
          type: 'geojson',
          data: EMPTY_FEATURE_COLLECTION as Parameters<GeoJSONSource['setData']>[0],
          cluster: true,
          clusterMaxZoom: 10,
          clusterRadius: 46,
        })
        map.addSource(LOOKUP_SELECTED_SOURCE_ID, {
          type: 'geojson',
          data: EMPTY_FEATURE_COLLECTION as Parameters<GeoJSONSource['setData']>[0],
        })

        map.addLayer({
          id: LOOKUP_CLUSTER_LAYER_ID,
          type: 'circle',
          source: LOOKUP_MAP_SOURCE_ID,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#15803d',
              80,
              '#0f766e',
              250,
              '#1d4ed8',
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              18,
              80,
              24,
              250,
              30,
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 3,
            'circle-opacity': 0.92,
          },
        })

        map.addLayer({
          id: LOOKUP_CLUSTER_COUNT_LAYER_ID,
          type: 'symbol',
          source: LOOKUP_MAP_SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 12,
          },
          paint: {
            'text-color': '#ffffff',
          },
        })

        map.addLayer({
          id: LOOKUP_POINT_LAYER_ID,
          type: 'circle',
          source: LOOKUP_MAP_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'match',
              ['get', 'registryType'],
              'packing_facility',
              '#2563eb',
              '#15803d',
            ],
            'circle-radius': 13,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 3,
            'circle-opacity': 0.94,
          },
        })

        map.addLayer({
          id: LOOKUP_POINT_COUNT_LAYER_ID,
          type: 'symbol',
          source: LOOKUP_MAP_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          layout: {
            'text-field': '1',
            'text-size': 10,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0, 0, 0, 0.16)',
            'text-halo-width': 0.5,
          },
        })

        map.addLayer({
          id: LOOKUP_SELECTED_POINT_LAYER_ID,
          type: 'circle',
          source: LOOKUP_SELECTED_SOURCE_ID,
          paint: {
            'circle-color': '#ef4444',
            'circle-radius': 19,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 4,
            'circle-opacity': 0.98,
          },
        })

        map.addLayer({
          id: LOOKUP_SELECTED_POINT_COUNT_LAYER_ID,
          type: 'symbol',
          source: LOOKUP_SELECTED_SOURCE_ID,
          layout: {
            'text-field': '1',
            'text-size': 12,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(127, 29, 29, 0.35)',
            'text-halo-width': 0.75,
          },
        })

        map.on('click', LOOKUP_CLUSTER_LAYER_ID, event => {
          const feature = map.queryRenderedFeatures(event.point, { layers: [LOOKUP_CLUSTER_LAYER_ID] })[0]
          const properties = feature?.properties as { cluster_id?: number } | undefined
          const clusterId = Number(properties?.cluster_id)
          if (!Number.isFinite(clusterId) || feature?.geometry.type !== 'Point') {
            return
          }

          const center = feature.geometry.coordinates as [number, number]
          const source = map.getSource(LOOKUP_MAP_SOURCE_ID) as GeoJSONSource | undefined
          void source?.getClusterExpansionZoom(clusterId).then(zoom => {
            map.easeTo({
              center,
              zoom,
              duration: 350,
            })
          })
        })

        const selectRenderedPoint = (event: MapMouseEvent, layers: string[]) => {
          const feature = map.queryRenderedFeatures(event.point, { layers })[0]
          const properties = feature?.properties as { id?: string } | undefined
          const item = properties?.id ? itemsRef.current.find(entry => entry.id === properties.id) : null
          if (item) {
            onSelectRef.current(item)
          }
        }

        map.on('click', LOOKUP_POINT_LAYER_ID, event => selectRenderedPoint(event, [LOOKUP_POINT_LAYER_ID]))
        map.on('click', LOOKUP_POINT_COUNT_LAYER_ID, event => selectRenderedPoint(event, [LOOKUP_POINT_COUNT_LAYER_ID]))
        map.on('click', LOOKUP_SELECTED_POINT_LAYER_ID, event => selectRenderedPoint(event, [LOOKUP_SELECTED_POINT_LAYER_ID]))
        map.on('click', LOOKUP_SELECTED_POINT_COUNT_LAYER_ID, event => selectRenderedPoint(event, [LOOKUP_SELECTED_POINT_COUNT_LAYER_ID]))

        map.on('mouseenter', LOOKUP_CLUSTER_LAYER_ID, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', LOOKUP_CLUSTER_LAYER_ID, () => {
          map.getCanvas().style.cursor = ''
        })
        map.on('mouseenter', LOOKUP_POINT_LAYER_ID, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', LOOKUP_POINT_LAYER_ID, () => {
          map.getCanvas().style.cursor = ''
        })
        map.on('mouseenter', LOOKUP_POINT_COUNT_LAYER_ID, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', LOOKUP_POINT_COUNT_LAYER_ID, () => {
          map.getCanvas().style.cursor = ''
        })
        map.on('mouseenter', LOOKUP_SELECTED_POINT_LAYER_ID, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', LOOKUP_SELECTED_POINT_LAYER_ID, () => {
          map.getCanvas().style.cursor = ''
        })
        map.on('mouseenter', LOOKUP_SELECTED_POINT_COUNT_LAYER_ID, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', LOOKUP_SELECTED_POINT_COUNT_LAYER_ID, () => {
          map.getCanvas().style.cursor = ''
        })

        setMapStatus('ready')
      })
    }).catch(() => {
      if (!disposed) {
        setMapStatus('error')
      }
    })

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const maplibregl = maplibreRef.current
    if (!map || !maplibregl || !mapReady) {
      return
    }

    const source = map.getSource(LOOKUP_MAP_SOURCE_ID) as GeoJSONSource | undefined
    source?.setData(mapData as Parameters<GeoJSONSource['setData']>[0])

    if (mapData.features.length === 1) {
      map.easeTo({ center: mapData.features[0].geometry.coordinates, zoom: 8.4, duration: 450 })
    } else if (mapData.features.length > 1) {
      const bounds = mapData.features.reduce(
        (acc, feature) => acc.extend(feature.geometry.coordinates),
        new maplibregl.LngLatBounds(mapData.features[0].geometry.coordinates, mapData.features[0].geometry.coordinates),
      )
      map.fitBounds(bounds, {
        padding: { top: 72, right: 44, bottom: 120, left: 44 },
        maxZoom: 8,
        duration: 450,
      })
    }
  }, [mapData, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) {
      return
    }

    const source = map.getSource(LOOKUP_SELECTED_SOURCE_ID) as GeoJSONSource | undefined
    source?.setData(
      buildLookupMapFeatureCollection(selectedItem ? [selectedItem] : []) as Parameters<GeoJSONSource['setData']>[0],
    )
  }, [mapReady, selectedItem])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedItem) {
      return
    }

    map.easeTo({
      center: resolveRegistryCoordinate(selectedItem),
      zoom: Math.max(map.getZoom(), 8),
      duration: 350,
    })
  }, [selectedItem])

  return (
    <aside className="lookup-map" aria-label="Bản đồ vị trí vùng trồng và cơ sở đóng gói">
      <div className="lookup-map__head">
        <div>
          <span>Bản đồ OpenStreetMap</span>
          <strong>{items.length} điểm đang hiển thị</strong>
        </div>
        {onCloseMobile ? <button type="button" onClick={onCloseMobile}>Danh sách</button> : null}
      </div>
      <div className="lookup-map__canvas" data-map-type={activeType} data-map-status={mapStatus}>
        <div ref={containerRef} className="lookup-map__real-canvas" />
        {mapStatus === 'loading' ? (
          <div className="lookup-map__fallback" role="status">
            <strong>Đang tải bản đồ...</strong>
            <span>Danh sách kết quả vẫn sẵn sàng để tra cứu.</span>
          </div>
        ) : null}
        {mapStatus === 'error' ? (
          <div className="lookup-map__fallback lookup-map__fallback--error" role="status">
            <strong>Bản đồ tạm thời chưa tải được</strong>
            <span>Danh sách vẫn hoạt động.</span>
          </div>
        ) : null}
      </div>
      {mapReady && selectedItem ? (
        <div className="lookup-map__popup">
          <div className="lookup-map__popup-topline">
            {showSelectedProductLabel ? <span>{selectedItem.product}</span> : null}
            {selectedItem.market ? <span>{selectedItem.market}</span> : null}
          </div>
          <strong>{selectedItem.name}</strong>
          <p>{selectedItem.address ?? 'Chưa có địa chỉ'}</p>
          <div className="lookup-map__popup-facts">
            {selectedItem.registryCode ? <span>Mã: {selectedItem.registryCode}</span> : null}
            {selectedItem.registryType === 'production_area' ? <span>{selectedItem.harvestStatusLabel}</span> : null}
            {selectedItem.capacity ? <span>Công suất: {selectedItem.capacity}</span> : null}
            {selectedFirstPeriod ? <span>Đợt {selectedFirstPeriod.round}: {selectedFirstPeriod.startRaw ?? '--'} - {selectedFirstPeriod.endRaw ?? '--'}</span> : null}
            {selectedItem.certifications.map(certification => (
              <span key={certification}>{certification}</span>
            ))}
          </div>
          {selectedItem.phone ? (
            <PhoneAction
              phone={selectedItem.phone}
              phoneDisplay={selectedItem.phoneDisplay}
              className="lookup-map__popup-call"
              canUseTelLinks={canUseTelLinks}
            />
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}

export default function LookupPage() {
  const { categorySlug } = useParams()
  const navigate = useNavigate()
  const activeTab = TABS.find(tab => tab.slug === categorySlug) ?? TABS[0]
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 400)
  const [province, setProvince] = useState('all')
  const [market, setMarket] = useState('all')
  const [product, setProduct] = useState('all')
  const [status, setStatus] = useState<'all' | 'harvesting'>('all')
  const [sort, setSort] = useState<LookupSortKey>('updated_desc')
  const [page, setPage] = useState(1)
  const [payload, setPayload] = useState<LookupResponse>(DEFAULT_RESPONSE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileMapOpen, setMobileMapOpen] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites())
  const canUseTelLinks = useCanUseTelLinks()

  useEffect(() => {
    if (!categorySlug || !TABS.some(tab => tab.slug === categorySlug)) {
      navigate('/tra-cuu/vung-trong', { replace: true })
    }
  }, [categorySlug, navigate])

  useEffect(() => {
    setPage(1)
    setSelectedId(null)
    setMobileMapOpen(false)
  }, [activeTab.type, debouncedSearch, province, market, product, status, sort])

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function loadEntries() {
      setLoading(true)
      try {
        const query = buildQuery({
          type: activeTab.type,
          search: debouncedSearch,
          province,
          market,
          product,
          status: activeTab.type === 'production_area' ? status : 'all',
          sort,
          page,
        })
        const response = await fetch(buildApiUrl(`/api/export-registry/entries?${query.toString()}`), {
          signal: controller.signal,
        })
        const json: LookupResponse = await response.json()
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? 'Không thể tải dữ liệu tra cứu')
        }
        if (!active) {
          return
        }
        setPayload(json)
        setError(null)
      } catch (fetchError) {
        if (!active || controller.signal.aborted) {
          return
        }
        setPayload(DEFAULT_RESPONSE)
        setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải dữ liệu tra cứu')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadEntries()

    return () => {
      active = false
      controller.abort()
    }
  }, [activeTab.type, market, page, product, province, debouncedSearch, status, sort])

  const favoriteSet = useMemo(() => new Set(favorites), [favorites])
  const totalPages = Math.max(1, Math.ceil(payload.total / payload.limit))
  const selectedItem = (payload.mapItems.length > 0 ? payload.mapItems : payload.items).find(item => item.id === selectedId)
  const allVisibleMapItems: LookupMapItem[] = payload.mapItems.length > 0 ? payload.mapItems : payload.items

  function switchTab(tab: RegistryTab) {
    navigate(`/tra-cuu/${tab.slug}`)
    setStatus('all')
  }

  function toggleFavorite(item: LookupItem) {
    const favoriteId = getFavoriteId(item)
    setFavorites(current => {
      const next = current.includes(favoriteId)
        ? current.filter(value => value !== favoriteId)
        : [...current, favoriteId]
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
      return next
    })
  }

  function selectItem(item: { id: string }) {
    setSelectedId(item.id)
  }

  return (
    <main className={`lookup-page${mobileMapOpen ? ' lookup-page--map-open' : ''}`}>
      <button type="button" className="lookup-page__map-fab" onClick={() => setMobileMapOpen(current => !current)}>
        {mobileMapOpen ? <><ListIcon /> Xem danh sách</> : <><MapIcon /> Xem bản đồ</>}
      </button>

      <section className="lookup-shell">
        <div className="lookup-main">
          <header className="lookup-hero">
            <div>
              <h1>Tra cứu vùng trồng & cơ sở đóng gói</h1>
              <p>Dữ liệu công khai được chuẩn hóa để người mua, hợp tác xã và đơn vị xuất khẩu quét nhanh theo địa phương, thị trường và mùa vụ.</p>
            </div>
            <div className="lookup-stats">
              <article>
                <span>Vùng trồng</span>
                <strong>{payload.stats.production_area.toLocaleString('vi-VN')}</strong>
              </article>
              <article>
                <span>Cơ sở đóng gói</span>
                <strong>{payload.stats.packing_facility.toLocaleString('vi-VN')}</strong>
              </article>
              <article>
                <span>Đã lưu</span>
                <strong>{favorites.length}</strong>
              </article>
            </div>
          </header>

          <section className="lookup-controls">
            <div className="lookup-tabs" role="tablist" aria-label="Danh mục tra cứu">
              {TABS.map(tab => (
                <button
                  key={tab.slug}
                  type="button"
                  className={activeTab.type === tab.type ? 'lookup-tabs__tab lookup-tabs__tab--active' : 'lookup-tabs__tab'}
                  onClick={() => switchTab(tab)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="lookup-filter-grid">
              <label className="lookup-search">
                <span>Tìm kiếm</span>
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Tên, mã, số điện thoại, xã/huyện/tỉnh..."
                />
              </label>
              <label>
                <span>Sản phẩm</span>
                <select value={product} onChange={event => setProduct(event.target.value)}>
                  <option value="all">Tất cả</option>
                  {payload.filters.products.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span>Địa phương</span>
                <select value={province} onChange={event => setProvince(event.target.value)}>
                  <option value="all">Tất cả</option>
                  {payload.filters.provinces.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span>Thị trường</span>
                <select value={market} onChange={event => setMarket(event.target.value)}>
                  <option value="all">Tất cả</option>
                  {payload.filters.markets.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span>Sắp xếp</span>
                <select value={sort} onChange={event => setSort(event.target.value as LookupSortKey)}>
                  <option value="updated_desc">Ngày cập nhật mới nhất</option>
                  <option value="name_asc">Tên A-Z</option>
                  <option value="province_asc">Tỉnh/thành A-Z</option>
                </select>
              </label>
            </div>

            {activeTab.type === 'production_area' ? (
              <div className="lookup-status-filter">
                <button type="button" className={status === 'all' ? 'is-active' : ''} onClick={() => setStatus('all')}>Tất cả</button>
                <button type="button" className={status === 'harvesting' ? 'is-active' : ''} onClick={() => setStatus('harvesting')}>Đang thu hoạch</button>
              </div>
            ) : null}
          </section>

          <section className="lookup-results-head">
            <span>{loading ? 'Đang tải...' : `${payload.total.toLocaleString('vi-VN')} kết quả`}</span>
            <span>Cập nhật: {formatDate(payload.latestCrawledAt)}</span>
          </section>

          {error ? <div className="lookup-state lookup-state--error">{error}</div> : null}
          {!error && loading && payload.items.length === 0 ? (
            <section className="lookup-card-grid">
              {Array.from({ length: 6 }).map((_, i) => <LookupCardSkeleton key={i} />)}
            </section>
          ) : null}
          {!error && !loading && payload.items.length === 0 ? (
            <div className="lookup-state lookup-state--empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="lookup-empty-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <p>Không tìm thấy kết quả nào phù hợp với bộ lọc hiện tại.</p>
              <button type="button" onClick={() => {
                setSearch('')
                setProvince('all')
                setMarket('all')
                setProduct('all')
                setStatus('all')
              }}>Xoá bộ lọc</button>
            </div>
          ) : null}

          {!error && (!loading || payload.items.length > 0) && payload.items.length > 0 ? (
            <>
              <section className="lookup-card-grid">
                {payload.items.map(item => (
                  <LookupCard
                    key={item.id}
                    item={item}
                    selected={selectedId === item.id}
                    favorite={favoriteSet.has(getFavoriteId(item))}
                    onSelect={selectItem}
                    onToggleFavorite={toggleFavorite}
                    canUseTelLinks={canUseTelLinks}
                  />
                ))}
              </section>

              <Pagination page={page} totalPages={totalPages} setPage={setPage} />
            </>
          ) : null}
        </div>

        <RegistryMap
          items={allVisibleMapItems}
          activeType={activeTab.type}
          selectedId={selectedItem?.id ?? null}
          onSelect={selectItem}
          onCloseMobile={mobileMapOpen ? () => setMobileMapOpen(false) : undefined}
          canUseTelLinks={canUseTelLinks}
        />
      </section>
    </main>
  )
}
