import { supabase } from './supabase'
import { headers } from 'next/headers'

export async function getIP(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean }> {
  try {
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString()

    const { data } = await supabase
      .from('rate_limits')
      .select('count, window_start')
      .eq('key', key)
      .single()

    if (!data || data.window_start < windowStart) {
      await supabase.from('rate_limits').upsert({ key, count: 1, window_start: new Date().toISOString() })
      return { allowed: true }
    }

    if (data.count >= maxRequests) {
      return { allowed: false }
    }

    await supabase.from('rate_limits').update({ count: data.count + 1 }).eq('key', key)
    return { allowed: true }
  } catch {
    return { allowed: true }
  }
}
