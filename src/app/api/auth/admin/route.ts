import { NextRequest, NextResponse } from 'next/server'
import { createAdminSession, deleteAdminSession } from '@/lib/session'
import { checkRateLimit, getIP } from '@/lib/rateLimit'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const ip = await getIP()
    const { allowed } = await checkRateLimit(`admin-login:${ip}`, 5, 15 * 60)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in 15 minutes.' },
        { status: 429 }
      )
    }

    const { password } = await req.json()
    if (!password || typeof password !== 'string' || password.length > 200) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const adminHash = process.env.ADMIN_PASSWORD_HASH
    if (!adminHash) {
      return NextResponse.json({ error: 'Admin not configured' }, { status: 503 })
    }

    const valid = await bcrypt.compare(password, adminHash)
    if (!valid) {
      return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
    }

    await createAdminSession()
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE() {
  await deleteAdminSession()
  return NextResponse.json({ ok: true })
}
