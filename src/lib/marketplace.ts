import type { PostgrestError } from '@supabase/supabase-js'
import { marketplaceListingsTable, supabase, supabaseConfigError } from './supabase'
import type { MarketplaceListing, MarketplaceListingInsert, MarketplaceUnit } from '../types/marketplace'

type ListingRow = {
  id: string | number
  title: string
  category: string
  location: string
  price: number | string
  unit: MarketplaceUnit
  description: string | null
  vendor_name: string
  created_at: string
}

const listingSelect =
  'id, title, category, location, price, unit, description, vendor_name, created_at'

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase chưa được cấu hình.')
  }

  return supabase
}

function mapListingRow(row: ListingRow): MarketplaceListing {
  return {
    id: String(row.id),
    title: row.title,
    category: row.category,
    location: row.location,
    price: Number(row.price),
    unit: row.unit,
    description: row.description,
    vendorName: row.vendor_name,
    createdAt: row.created_at,
  }
}

function formatSupabaseError(error: PostgrestError) {
  if (error.code === 'PGRST205' || error.message.includes('relation')) {
    return `Không tìm thấy bảng "${marketplaceListingsTable}" trong Supabase. Thêm biến SUPABASE_MARKETPLACE_TABLE nếu tên bảng khác.`
  }

  return error.message
}

export async function fetchMarketplaceListings(limit = 12) {
  const client = requireSupabase()
  const { data, error } = await client
    .from(marketplaceListingsTable)
    .select(listingSelect)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(formatSupabaseError(error))
  }

  return ((data ?? []) as ListingRow[]).map(mapListingRow)
}

export async function createMarketplaceListing(input: MarketplaceListingInsert) {
  const client = requireSupabase()
  const { data, error } = await client
    .from(marketplaceListingsTable)
    .insert({
      title: input.title,
      category: input.category,
      location: input.location,
      price: input.price,
      unit: input.unit,
      description: input.description,
      vendor_name: input.vendorName,
    })
    .select(listingSelect)
    .single()

  if (error) {
    throw new Error(formatSupabaseError(error))
  }

  return mapListingRow(data as ListingRow)
}
