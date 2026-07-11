import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { SessionPayload } from '@/types'
import { isTestMode } from './testMode'
import { getJwtSecret } from './jwtSecret'

const SESSION_COOKIE = 'survivor_session'
const ADMIN_COOKIE = 'survivor_admin'

export async function createSession(payload: SessionPayload): Promise<void> {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  // Stamp the environment: a session created in the testing sandbox holds a
  // sandbox player_id, which must never resolve against production (and vice
  // versa). getSession() rejects sessions whose stamp doesn't match.
  const test_mode = await isTestMode()
  const token = await new SignJWT({ ...payload, test_mode })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expires)
    .sign(getJwtSecret())

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires,
    path: '/',
  })
}

export async function createAdminSession(): Promise<void> {
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 hours
  const token = await new SignJWT({ is_admin: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expires)
    .sign(getJwtSecret())

  const cookieStore = await cookies()
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires,
    path: '/',
  })
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    // All app JWTs share one secret, so a valid signature isn't enough — an
    // admin/test-mode/invite token pasted into the session cookie would
    // verify. Only tokens carrying a player identity are player sessions.
    if (typeof payload.player_id !== 'string' || payload.player_id.length === 0) return null
    // Sessions are scoped to the environment they were created in — a sandbox
    // session is invisible in production and vice versa.
    if ((payload.test_mode === true) !== (await isTestMode())) return null
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function getAdminSession(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_COOKIE)?.value
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    // Player sessions are signed with the same secret, so a valid signature is
    // not enough — require the is_admin claim that only createAdminSession sets.
    return payload.is_admin === true
  } catch {
    return false
  }
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export async function deleteAdminSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_COOKIE)
}
