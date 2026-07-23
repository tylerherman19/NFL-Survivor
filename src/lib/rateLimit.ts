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

// Rate limits always live in production (public schema) — a sandbox browser
// must not get a fresh budget for login/signup attempts.
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean }> {
  try {
    // One atomic round trip (migration 006). Falls back to the legacy
    // read-then-write path if the function hasn't been installed yet.
    const { data, error } = await supabase.rpc('bump_rate_limit', {
      p_key: key,
      p_max: maxRequests,
      p_window_seconds: windowSeconds,
    })
    if (!error) return { allowed: data === true }
    return legacyCheckRateLimit(key, maxRequests, windowSeconds)
  } catch {
    return { allowed: true } // fail open — never lock users out over infra errors
  }
}

async function legacyCheckRateLimit(
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
