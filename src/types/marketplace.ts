export type MarketplaceUnit = 'kg' | 'ta' | 'tan'

export interface MarketplaceListing {
  id: string
  title: string
  category: string
  location: string
  price: number
  unit: MarketplaceUnit
  description: string | null
  vendorName: string
  createdAt: string
}

export interface MarketplaceListingInsert {
  title: string
  category: string
  location: string
  price: number
  unit: MarketplaceUnit
  description: string | null
  vendorName: string
}
