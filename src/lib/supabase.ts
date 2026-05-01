import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const marketplaceListingsTable =
  import.meta.env.VITE_SUPABASE_MARKETPLACE_TABLE ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_MARKETPLACE_TABLE ??
  'marketplace_listings'

export const supabaseConfigError =
  supabaseUrl && supabasePublishableKey
    ? null
    : 'Thiếu cấu hình Supabase. Cần SUPABASE_URL và publishable key trong file .env.'

export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null
