import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

function firstDefined(...values: Array<string | undefined>) {
  return values.find(value => typeof value === 'string' && value.trim().length > 0)
}

const supabaseUrl = firstDefined(
  process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_URL,
)

const supabaseAnonKey = firstDefined(
  process.env.SUPABASE_ANON_KEY,
  process.env.SUPABASE_PUBLISHABLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
)

const supabaseServiceRoleKey = firstDefined(
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

export const hasSupabaseReadConfig = Boolean(supabaseUrl && supabaseAnonKey)
export const hasSupabaseAdminConfig = Boolean(supabaseUrl && supabaseServiceRoleKey)

export const supabaseReadClient =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null

export const supabaseAdminClient =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null

export function getSupabaseReadClient() {
  return supabaseAdminClient ?? supabaseReadClient
}

export function getSupabaseAdminClient() {
  return supabaseAdminClient
}

export function getSupabaseRuntimeStatus() {
  return {
    hasReadConfig: hasSupabaseReadConfig,
    hasAdminConfig: hasSupabaseAdminConfig,
    missingServiceRole: hasSupabaseReadConfig && !hasSupabaseAdminConfig,
  }
}
