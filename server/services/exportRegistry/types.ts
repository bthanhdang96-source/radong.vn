export type ExportRegistryType = 'production_area' | 'packing_facility'

export type ExportRegistryPeriod = {
  round: number
  startsOn: string | null
  endsOn: string | null
  startRaw: string | null
  endRaw: string | null
}

export type ExportRegistryEntry = {
  registryType: ExportRegistryType
  sourceUrl: string
  sourcePage: number
  sourcePosition: number
  sourceRowNumber: number | null
  name: string
  address: string | null
  phone: string | null
  market: string | null
  province: string | null
  district: string | null
  commune: string | null
  approvalPeriods: ExportRegistryPeriod[]
  rawPayload: Record<string, unknown>
  contentHash: string
  crawledAt: string
}

export type ExportRegistryCrawlResult = {
  registryType: ExportRegistryType
  sourceUrl: string
  crawledAt: string
  pageCount: number
  items: ExportRegistryEntry[]
  errors: string[]
}

export type ExportRegistrySyncResult = {
  runId: string
  registryType: ExportRegistryType | 'all'
  itemCount: number
  insertedCount: number
  updatedCount: number
}
