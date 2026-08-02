import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies, draftMode } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase, sandboxSupabase } from './supabase'

// Testing Mode: a black-box sandbox toggled from /admin/testing. Browsers
// carrying the signed test-mode cookie get every query served from the
// `sandbox` schema; everyone else keeps hitting production untouched.
//
// The cookie rides on Next.js Draft Mode: enabling test mode also enables the
// draft bypass cookie, which makes the ISR-cached pages (/, /grid, /schedule)
// render dynamically for that browser only. That is what lets isTestMode()
// be called from cached pages without opting the whole site out of caching.

const TEST_MODE_COOKIE = 'survivor_test_mode'

function getSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET env var is not set')
  return new TextEncoder().encode(s)
}

// Verify the signed testing-mode token on this request, ignoring draft mode.
// Reads cookies(), so only call it from somewhere already dynamic.
async function hasValidTestToken(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TEST_MODE_COOKIE)?.value
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload.test_mode === true
  } catch {
    return false
  }
}

export async function isTestMode(): Promise<boolean> {
  // Draft mode gates the cookie read: during static/ISR rendering it is
  // simply disabled, so this returns false without forcing the page dynamic.
  const { isEnabled } = await draftMode()
  if (!isEnabled) return false

  return hasValidTestToken()
}

// True when this browser still holds a valid testing-mode token but Next's
// draft-mode bypass cookie no longer matches this deployment.
//
// Next regenerates the bypass cookie's value on every build (see
// DraftModeProvider: isEnabled is `cookieValue === previewProps.previewModeId`),
// so *any deploy signs every tester out of the sandbox*. isTestMode() flips to
// false and the whole site quietly starts serving production data — no banner,
// no error, just different numbers. Surfacing that beats letting someone debug
// a sandbox they are no longer in.
//
// Reads cookies() without the draft-mode gate, so this is for already-dynamic
// routes only (the admin pages). Never call it from a cached page.
export async function hasStaleTestModeCookie(): Promise<boolean> {
  if (await isTestMode()) return false
  return hasValidTestToken()
}

// The one place that decides which environment a request talks to.
export async function getDb(): Promise<SupabaseClient> {
  return (await isTestMode()) ? sandboxSupabase : supabase
}

// The "current time" every deadline/lock decision should use. In test mode
// this reads the sandbox's simulated clock (sandbox.clock, a singleton row
// admins can set/advance from /admin/testing) so a tester can progress
// through a week at their own pace; a null simulated_now — or production —
// just falls through to real wall-clock time.
export async function getEffectiveNow(): Promise<Date> {
  if (!(await isTestMode())) return new Date()
  const { data } = await sandboxSupabase.from('clock').select('simulated_now').eq('id', true).single()
  return data?.simulated_now ? new Date(data.simulated_now) : new Date()
}

// Callable from Route Handlers only (cookie mutation). Pairs with
// draftMode().enable()/.disable() at the call site.
export async function setTestModeCookie(): Promise<void> {
  const token = await new SignJWT({ test_mode: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(getSecret())

  const cookieStore = await cookies()
  // Session cookie (no expires) to match the draft-mode bypass cookie:
  // closing the browser exits the sandbox cleanly on both fronts.
  cookieStore.set(TEST_MODE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}

export async function clearTestModeCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(TEST_MODE_COOKIE)
}

// Invite tokens let the admin share a link that drops another device into the
// sandbox (see /api/test-mode/join) without giving it admin access.
export async function createTestInviteToken(): Promise<string> {
  return new SignJWT({ test_invite: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(getSecret())
}

export async function verifyTestInviteToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload.test_invite === true
  } catch {
    return false
  }
}
