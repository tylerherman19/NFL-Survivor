import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from './session'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

// Escape LIKE wildcards so user input used in .ilike() matches literally —
// otherwise a name like "T%" would match any player starting with T.
export function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

// Returns a 401 response for non-admins, null when authorized.
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await getAdminSession()) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// Cron endpoints accept the Vercel Cron secret (always runs against
// production — no cookies) or a logged-in admin, which lets the Testing
// panel exercise these flows against the sandbox. CRON_SECRET must actually
// be set for the header path — otherwise "Bearer undefined" would match.
export async function requireCronOrAdmin(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return null
  return requireAdmin()
}
