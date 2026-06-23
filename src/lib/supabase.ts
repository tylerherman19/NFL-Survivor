import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

// Lazy singleton — only creates the client when first called, so build-time
// evaluation of this module doesn't fail without env vars set.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_client) {
      const url = process.env.SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
      _client = createClient(url, key, { auth: { persistSession: false } })
    }
    const value = (_client as unknown as Record<string, unknown>)[prop as string]
    return typeof value === 'function' ? value.bind(_client) : value
  },
})
