import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { SessionPayload } from '@/types'

const SESSION_COOKIE = 'survivor_session'
const ADMIN_COOKIE = 'survivor_admin'
const secret = new TextEncoder().encode(process.env.SESSION_SECRET!)

export async function createSession(payload: SessionPayload): Promise<void> {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expires)
    .sign(secret)

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
    .sign(secret)

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
    const { payload } = await jwtVerify(token, secret)
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
    await jwtVerify(token, secret)
    return true
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
