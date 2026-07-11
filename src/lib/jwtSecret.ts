import 'server-only'

// Shared HMAC secret for every JWT cookie the app signs: player sessions,
// admin sessions, the test-mode cookie, and testing invite tokens.
export function getJwtSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET env var is not set')
  return new TextEncoder().encode(s)
}
