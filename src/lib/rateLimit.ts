import { supabase } from './supabase'
import { headers } from 'next/headers'

export async function getIP(): Promise<string> {
  const h = await headers()
  // x-real-ip is set by Vercel to the actual client IP and cannot be spoofed.
  // x-forwarded-for can be manipulated by adding a fake first entry.
  const realIp = h.get('x-real-ip')
  if (realIp) return realIp.trim()
  // Fallback: use the LAST entry in x-forwarded-for (added by Vercel edge, not user-controlled).
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',')
    return parts[parts.length - 1].trim()
  }
  return 'unknown'
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
