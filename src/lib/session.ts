import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { SessionPayload } from '@/types'

const SESSION_COOKIE = 'survivor_session'
const ADMIN_COOKIE = 'survivor_admin'

function getSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET env var is not set')
  return new TextEncoder().encode(s)
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expires)
    .sign(getSecret())

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
    .sign(getSecret())

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
    const { payload } = await jwtVerify(token, getSecret())
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
    const { payload } = await jwtVerify(token, getSecret())
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
