import { createClient, SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing env var: SUPABASE_SERVICE_ROLE_KEY')

  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false },
    })
  }
  return cached
}
