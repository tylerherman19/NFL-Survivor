import 'server-only'
import { SignJWT, jwtVerify } from 'jose'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pickandpray.org'

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET env var is not set')
  return new TextEncoder().encode(secret)
}

async function createUnsubscribeToken(playerId: string): Promise<string> {
  return new SignJWT({ purpose: 'email-unsubscribe' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(playerId)
    .sign(getSecret())
}

export async function createUnsubscribeLinks(playerId: string): Promise<{
  pageUrl: string
  oneClickUrl: string
}> {
  const token = await createUnsubscribeToken(playerId)
  const encodedToken = encodeURIComponent(token)
  return {
    pageUrl: `${APP_URL}/unsubscribe?token=${encodedToken}`,
    oneClickUrl: `${APP_URL}/api/unsubscribe?token=${encodedToken}`,
  }
}

export async function verifyUnsubscribeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] })
    if (payload.purpose !== 'email-unsubscribe' || typeof payload.sub !== 'string') return null
    return payload.sub
  } catch {
    return null
  }
}
