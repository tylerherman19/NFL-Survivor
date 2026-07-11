import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies, draftMode } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase, sandboxSupabase } from './supabase'
import { getJwtSecret } from './jwtSecret'

// Testing Mode: a black-box sandbox toggled from /admin/testing. Browsers
// carrying the signed test-mode cookie get every query served from the
// `sandbox` schema; everyone else keeps hitting production untouched.
//
// The cookie rides on Next.js Draft Mode: enabling test mode also enables the
// draft bypass cookie, which makes the ISR-cached pages (/, /grid, /schedule)
// render dynamically for that browser only. That is what lets isTestMode()
// be called from cached pages without opting the whole site out of caching.

const TEST_MODE_COOKIE = 'survivor_test_mode'

export async function isTestMode(): Promise<boolean> {
  // Draft mode gates the cookie read: during static/ISR rendering it is
  // simply disabled, so this returns false without forcing the page dynamic.
  const { isEnabled } = await draftMode()
  if (!isEnabled) return false

  const cookieStore = await cookies()
  const token = cookieStore.get(TEST_MODE_COOKIE)?.value
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    return payload.test_mode === true
  } catch {
    return false
  }
}

// The one place that decides which environment a request talks to.
export async function getDb(): Promise<SupabaseClient> {
  return (await isTestMode()) ? sandboxSupabase : supabase
}

// Callable from Route Handlers only (cookie mutation). Pairs with
// draftMode().enable()/.disable() at the call site.
export async function setTestModeCookie(): Promise<void> {
  const token = await new SignJWT({ test_mode: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(getJwtSecret())

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
    .sign(getJwtSecret())
}

export async function verifyTestInviteToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    return payload.test_invite === true
  } catch {
    return false
  }
}
