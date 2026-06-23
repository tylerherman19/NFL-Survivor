import { NextRequest, NextResponse } from 'next/server'
import { createAdminSession, deleteAdminSession } from '@/lib/session'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json()
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
